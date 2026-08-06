/**
 * Two acceptance checks for the interface-language port (docs/i18n.md §11):
 *
 *   1. Every German catalog value existed before, byte-for-byte (a rework, not
 *      a rewrite).
 *   2. No German is left behind in a ported source tree.
 *
 * Both are deliberately grep-shaped — no AST, no parser to maintain. Run via
 * `bun run i18n:check`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;

function sh(command: string[], cwd = ROOT): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    code: proc.exitCode ?? 1,
    stdout: proc.stdout.toString("utf8"),
    stderr: proc.stderr.toString("utf8"),
  };
}

/** The commit this branch forked from — check 1 greps THAT tree, not the working copy. */
function baseCommit(): string {
  const envBase = process.env.I18N_CHECK_BASE;
  if (envBase) return envBase;
  const mergeBase = sh(["git", "merge-base", "HEAD", "origin/main"]);
  if (mergeBase.code === 0 && mergeBase.stdout.trim()) return mergeBase.stdout.trim();
  const fallback = sh(["git", "merge-base", "HEAD", "main"]);
  if (fallback.code === 0 && fallback.stdout.trim()) return fallback.stdout.trim();
  throw new Error(
    "i18n-check: could not resolve a base commit (tried origin/main and main). Set I18N_CHECK_BASE=<sha>.",
  );
}

/**
 * Genuinely NEW German — a previously-English Zod default gaining a real
 * translation (docs/i18n.md §11). One entry per key, with the reason, so a
 * rewritten (not moved) string cannot hide behind this list by accident.
 */
const NEW_GERMAN = new Set<string>([
  "server.zod.too_small.string",
  "server.zod.too_small.number",
  "server.zod.too_small.array",
  "server.zod.too_small",
  "server.zod.too_big.string",
  "server.zod.too_big.number",
  "server.zod.too_big.array",
  "server.zod.too_big",
  "server.zod.invalid_format",
  "server.zod.invalid_type",
  "server.zod.fallback",
]);

/** Every `*.de.ts` catalog file under the two i18n catalog roots. */
function findDeCatalogFiles(): string[] {
  const roots = ["packages/shared/src/i18n/catalogs", "apps/web/src/lib/i18n/catalogs"];
  const files: string[] = [];
  for (const root of roots) {
    const dir = join(ROOT, root);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (entry.endsWith(".de.ts")) files.push(join(dir, entry));
    }
  }
  return files;
}

/** Extracts `"key": "value"` / `"key": { one: "…", other: "…" }` string literals per key. */
function extractCatalogValues(source: string): Map<string, string[]> {
  const values = new Map<string, string[]>();
  const keyRe = /"([a-zA-Z][\w.]*)":\s*(\{[^}]*\}|"(?:[^"\\]|\\.)*")/g;
  for (const match of source.matchAll(keyRe)) {
    const key = match[1]!;
    const rhs = match[2]!;
    const literals = [...rhs.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      m[1]!.replace(/\\"/g, '"').replace(/\\n/g, "\n"),
    );
    // Skip plural-object keys like "one"/"other" themselves — only their VALUES matter.
    const stringValues = rhs.startsWith("{") ? literals.filter((_, i) => i % 1 === 0) : literals;
    values.set(key, stringValues);
  }
  return values;
}

function fragmentsOf(value: string): string[] {
  return value
    .split(/\{[a-zA-Z0-9_]+\}/g)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 3);
}

function checkGermanParity(base: string): string[] {
  const failures: string[] = [];
  for (const file of findDeCatalogFiles()) {
    const source = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    for (const [key, rawValues] of extractCatalogValues(source)) {
      if (NEW_GERMAN.has(key)) continue;
      for (const value of rawValues) {
        for (const fragment of fragmentsOf(value)) {
          const found = sh(["git", "grep", "-F", "-q", fragment, base]);
          if (found.code !== 0) {
            failures.push(`${rel}: "${key}" — fragment not found in ${base}: ${JSON.stringify(fragment)}`);
          }
        }
      }
    }
  }
  return failures;
}

/* -------------------------------------------------------------------------- */
/* check 2 — no German left in ported source                                  */
/* -------------------------------------------------------------------------- */

const GERMAN_STOPWORDS =
  /\b(der|die|das|und|nicht|dein|deine|dich|kann|wurde|keine|bitte|noch|mehr|schon)\b/i;
const GERMAN_CHARS = /[äöüßÄÖÜ]/;

/** Content-language files: German recipe vocabulary / seed data, never flagged. */
const ALLOW_LIST = [
  "packages/shared/src/units.ts",
  "packages/shared/src/ingredients.ts",
  "packages/shared/src/numbers.ts",
  "packages/shared/src/text.ts",
  "packages/shared/src/duration.ts",
  "apps/api/src/services/import/ocr/quantity-fix.ts",
  "apps/api/src/services/import/ocr/segment.ts",
  "apps/api/src/services/import/url/schema-map.ts",
  "apps/api/src/services/import/url/adapters",
  "apps/api/src/services/import/url/fetch.ts",
  "apps/api/src/services/import/url/ssrf.ts",
  "apps/api/src/services/import/url/image.ts",
  "apps/api/src/services/import/parsed.ts",
  "apps/api/src/services/import/times.ts",
  "apps/api/scripts/seed.ts",
];

const PORTED_ROOTS = [
  "apps/web/src/features/auth",
  "apps/web/src/features/recipes",
  "apps/web/src/features/import",
  "apps/web/src/features/shopping",
  "apps/web/src/features/groups",
  "apps/web/src/features/collections",
  "apps/web/src/features/tags",
  "apps/web/src/components",
  "apps/web/src/lib",
  "apps/api/src",
  "packages/shared/src",
];

function isAllowed(rel: string): boolean {
  if (rel.endsWith(".de.ts")) return true;
  if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return true;
  if (rel.startsWith("apps/api/test/fixtures/")) return true;
  if (rel.includes("/lib/i18n/catalogs/")) return true;
  return ALLOW_LIST.some((allowed) => rel === allowed || rel.startsWith(`${allowed}/`) || rel.startsWith(allowed));
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
}

function checkNoGermanLeft(): string[] {
  const failures: string[] = [];
  for (const root of PORTED_ROOTS) {
    const dir = join(ROOT, root);
    if (!existsSync(dir)) continue;
    const files: string[] = [];
    walk(dir, files);
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (isAllowed(rel)) continue;
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]!;
        // Only inside string/JSX literals — a rough but grep-shaped filter:
        // require a quote or JSX text character on the line to cut noise from
        // identifiers/imports that happen to contain a stopword substring.
        if (!/["'`>]/.test(line)) continue;
        if (GERMAN_CHARS.test(line) || GERMAN_STOPWORDS.test(line)) {
          failures.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
  }
  return failures;
}

/* -------------------------------------------------------------------------- */

async function main() {
  const base = baseCommit();
  console.log(`[i18n:check] base commit: ${base}`);

  console.log("[i18n:check] 1/2 German catalog parity…");
  const parityFailures = checkGermanParity(base);
  if (parityFailures.length > 0) {
    console.error(`[i18n:check] FAILED — ${parityFailures.length} value(s) not found in the base tree:`);
    for (const failure of parityFailures) console.error(`  - ${failure}`);
  } else {
    console.log("[i18n:check] OK");
  }

  console.log("[i18n:check] 2/2 no German left in ported source…");
  const leftoverFailures = checkNoGermanLeft();
  if (leftoverFailures.length > 0) {
    console.error(`[i18n:check] FAILED — ${leftoverFailures.length} possible German literal(s):`);
    for (const failure of leftoverFailures.slice(0, 200)) console.error(`  - ${failure}`);
    if (leftoverFailures.length > 200) {
      console.error(`  … and ${leftoverFailures.length - 200} more`);
    }
  } else {
    console.log("[i18n:check] OK");
  }

  if (parityFailures.length > 0 || leftoverFailures.length > 0) process.exit(1);
}

await main();
