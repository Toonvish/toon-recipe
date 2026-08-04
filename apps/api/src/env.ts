/**
 * Zod-validated environment. Import `env` anywhere in the API — it is parsed
 * exactly once at module load and fails fast with a readable message.
 *
 * Every variable is documented in /.env.example.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

/** Monorepo root (apps/api/src/env.ts -> ../../..). */
export const REPO_ROOT = resolve(import.meta.dir, "../../..");

/**
 * Bun only auto-loads .env from the current working directory, but the API is
 * started from apps/api. So we load the ROOT .env (and .env.local) ourselves —
 * existing process env always wins.
 */
function loadRootDotEnv(): void {
  // Never let a developer .env leak into `bun test` — tests use file::memory:
  // unless the test itself sets the variable in process.env.
  if (process.env.NODE_ENV === "test") return;
  for (const file of [".env", ".env.local"]) {
    const path = join(REPO_ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1]!;
      if (process.env[key] !== undefined) continue;
      let value = match[2]!.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.env[key] = value;
    }
  }
}
loadRootDotEnv();

/** Resolves a relative `file:` DB path against the repo root, not the cwd. */
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const path = url.slice("file:".length);
  if (path.length === 0 || path.startsWith(":memory:") || isAbsolute(path)) return url;
  return `file:${resolve(REPO_ROOT, path)}`;
}

const BooleanishSchema = z
  .string()
  .transform((value) => value === "1" || value.toLowerCase() === "true")
  .optional();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    /** "file:./data/local.db" (self-hosted) or "libsql://xxx.turso.io" (Turso cloud). */
    DATABASE_URL: z.string().min(1, "DATABASE_URL fehlt (z. B. file:./data/local.db)"),
    /** Only needed for remote libsql:// / https:// URLs. */
    DATABASE_AUTH_TOKEN: z.string().optional(),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /** Comma-separated list of allowed browser origins (CORS, credentials: true). */
    WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    SESSION_SECRET: z.string().min(16, "SESSION_SECRET muss mindestens 16 Zeichen haben"),

    PUBLIC_API_URL: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    /** Public base URL of the API; OAuth redirect URIs are built from it. */
    OAUTH_REDIRECT_BASE: z.string().default("http://localhost:3001"),

    UPLOAD_DIR: z.string().default("./data/uploads"),
    TESSERACT_LANGS: z.string().default("deu+eng"),

    /** Optional: set to 1 to log every SQL statement. */
    DEBUG_SQL: BooleanishSchema,

    /**
     * DANGEROUS, development only: lets the URL importer fetch localhost /
     * private-network addresses. Needed to import from a fixture served on
     * 127.0.0.1 (see the smoke test in README.md). IGNORED in production.
     */
    IMPORT_ALLOW_PRIVATE_HOSTS: BooleanishSchema,

    /**
     * Set to 1 ONLY when the API really sits behind a reverse proxy that
     * overwrites X-Forwarded-For (nginx/Caddy/Traefik/Cloudflare). Without it the
     * rate limiter uses the socket address, because otherwise anyone could reset
     * their own login/register bucket by sending a fresh X-Forwarded-For header.
     */
    TRUST_PROXY: BooleanishSchema,
  })
  .transform((value) => {
    const isRemoteDb = /^(libsql|https|http|wss|ws):/i.test(value.DATABASE_URL);
    return {
      ...value,
      isProduction: value.NODE_ENV === "production",
      isTest: value.NODE_ENV === "test",
      /** Origins allowed by CORS, already split and trimmed. */
      webOrigins: value.WEB_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      /** "remote" for Turso cloud, "file" for a local libSQL file / memory DB. */
      databaseKind: (isRemoteDb ? "remote" : "file") as "remote" | "file",
      /** DATABASE_URL with relative file: paths resolved against the repo root. */
      databaseUrl: resolveDatabaseUrl(value.DATABASE_URL),
      /** Absolute upload directory (relative paths resolve from the repo root). */
      uploadDir: resolve(REPO_ROOT, value.UPLOAD_DIR),
      googleOAuthConfigured:
        typeof value.GOOGLE_CLIENT_ID === "string" &&
        value.GOOGLE_CLIENT_ID.length > 0 &&
        typeof value.GOOGLE_CLIENT_SECRET === "string" &&
        value.GOOGLE_CLIENT_SECRET.length > 0,
      githubOAuthConfigured:
        typeof value.GITHUB_CLIENT_ID === "string" &&
        value.GITHUB_CLIENT_ID.length > 0 &&
        typeof value.GITHUB_CLIENT_SECRET === "string" &&
        value.GITHUB_CLIENT_SECRET.length > 0,
      /** Whether X-Forwarded-For / X-Real-IP may be believed (see TRUST_PROXY). */
      trustProxy: value.TRUST_PROXY === true,
      /** SSRF guard escape hatch — can never be enabled in production. */
      allowPrivateImportHosts:
        value.IMPORT_ALLOW_PRIVATE_HOSTS === true && value.NODE_ENV !== "production",
    };
  })
  .refine(
    (value) => value.databaseKind === "file" || (value.DATABASE_AUTH_TOKEN ?? "").length > 0,
    "DATABASE_AUTH_TOKEN ist für eine remote libsql:// Datenbank erforderlich",
  );

export type Env = z.infer<typeof EnvSchema>;

/**
 * Test-friendly defaults so `bun test` works without any setup — and so a
 * developer .env (which Bun auto-loads from the cwd) can never point tests at
 * the real database. Override with TEST_DATABASE_URL if you really need a file.
 */
function rawEnv(): Record<string, string | undefined> {
  const source: Record<string, string | undefined> = {};
  // Empty strings in .env ("DATABASE_AUTH_TOKEN=") mean "not set", so that
  // .default()/.optional() kick in instead of failing a min(1) check.
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value.trim().length === 0) continue;
    source[key] = value;
  }
  if (source.NODE_ENV === "test") {
    source.DATABASE_URL = source.TEST_DATABASE_URL ?? "file::memory:";
    source.DATABASE_AUTH_TOKEN = source.TEST_DATABASE_URL ? source.DATABASE_AUTH_TOKEN : undefined;
    source.SESSION_SECRET ??= "test-secret-test-secret-test-secret";
  }
  return source;
}

function loadEnv(): Env {
  const result = EnvSchema.safeParse(rawEnv());
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(env)";
      return `  - ${key}: ${issue.message}`;
    });
    const message = [
      "Ungültige Umgebungsvariablen — bitte .env prüfen (Vorlage: .env.example):",
      ...lines,
    ].join("\n");
    // Fail fast, no stack trace noise.
    console.error(message);
    process.exit(1);
  }
  return result.data;
}

export const env: Env = loadEnv();
