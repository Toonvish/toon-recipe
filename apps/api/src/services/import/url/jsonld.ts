/**
 * JSON-LD extraction: pull every `<script type="application/ld+json">` body out
 * of a page and find the schema.org `Recipe` node inside it.
 *
 * Real-world shapes this has to survive:
 *   - a bare `{ "@type": "Recipe", … }`
 *   - `[{ "@type":"WebSite" }, { "@type":"Recipe" }]`         (chefkoch)
 *   - `{ "@context":…, "@graph":[ …, { "@type":"Recipe" } ] }` (Yoast/WPRM)
 *   - `"@type": ["Recipe","NewsArticle"]`                     (array types)
 *   - nested Recipe under `mainEntity` / `mainEntityOfPage` / `itemListElement`
 *   - invalid JSON: trailing commas, CDATA wrappers, HTML comments, raw
 *     newlines inside strings, and `<!--` prefixes.
 *
 * Nothing here throws: a broken block is skipped, not fatal.
 */
import { type ElementNode, parseHtml, queryAll, textOf } from "../html/parse.ts";

/** A JSON-LD node — deliberately loose, callers narrow with the helpers below. */
export type JsonLdNode = Record<string, unknown>;

const MAX_JSON_LD_BYTES = 2 * 1024 * 1024;
const MAX_WALK_DEPTH = 12;

/**
 * Best-effort repair of the malformed JSON-LD blocks recipe plugins emit.
 * Applied only after a straight `JSON.parse` has already failed.
 */
export function sanitizeJsonLd(input: string): string {
  let text = input.trim();

  // CDATA / HTML comment wrappers
  text = text.replace(/^<!\[CDATA\[/i, "").replace(/\]\]>$/, "");
  text = text.replace(/^\/\*\s*<!\[CDATA\[\s*\*\//i, "").replace(/\/\*\s*\]\]>\s*\*\/$/i, "");
  text = text.replace(/^<!--/, "").replace(/-->$/, "");
  text = text.trim();

  // Strip a UTF-8 BOM and JS-style comments that are not inside strings.
  text = text.replace(/^\ufeff/, "");
  text = stripJsonComments(text);

  // Trailing commas before } or ]
  text = text.replace(/,(\s*[}\]])/g, "$1");

  // Literal newlines/tabs inside string values (WP plugins do this a lot).
  text = escapeControlCharsInStrings(text);

  return text.trim();
}

/** Removes `//` and block comments outside of string literals. */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end - 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }
    out += char;
  }
  return out;
}

/** Escapes raw control characters that appear inside string literals. */
function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString && !escaped) {
      if (char === "\n") {
        out += "\\n";
        continue;
      }
      if (char === "\r") {
        out += "\\r";
        continue;
      }
      if (char === "\t") {
        out += "\\t";
        continue;
      }
    }
    out += char;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    }
  }
  return out;
}

/** Parses one script body, repairing it if necessary. Returns undefined on failure. */
export function parseJsonLdBlock(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_JSON_LD_BYTES) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to the repair pass
  }
  try {
    return JSON.parse(sanitizeJsonLd(trimmed));
  } catch {
    return undefined;
  }
}

/**
 * Every parseable JSON-LD payload on the page, in document order.
 * Accepts a raw HTML string or an already-parsed document.
 */
export function extractJsonLd(source: string | ElementNode): unknown[] {
  const doc = typeof source === "string" ? parseHtml(source) : source;
  const scripts = queryAll(doc, 'script[type*="ld+json"], script[type*="application/json"]');
  const out: unknown[] = [];
  for (const script of scripts) {
    const type = (script.attrs.type ?? "").toLowerCase();
    // "application/json" alone is usually app state, not JSON-LD — only keep it
    // when it mentions schema.org, which keeps the walk cheap.
    const body = textOf(script.children[0]);
    if (!type.includes("ld+json") && !body.includes("schema.org")) continue;
    const parsed = parseJsonLdBlock(body);
    if (parsed !== undefined) out.push(parsed);
  }
  return out;
}

function isObject(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `@type` as a lowercase string list, whatever shape it has. */
export function typesOf(node: unknown): string[] {
  if (!isObject(node)) return [];
  const raw = node["@type"] ?? node.type;
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.replace(/^https?:\/\/schema\.org\//i, "").trim().toLowerCase());
}

/** True when the node declares (or contains as one of its types) `type`. */
export function hasType(node: unknown, type: string): boolean {
  return typesOf(node).includes(type.toLowerCase());
}

/**
 * Flattens any JSON-LD payload into a list of nodes, following `@graph`,
 * arrays, and the handful of container properties recipe sites nest under.
 */
export function flattenJsonLd(payload: unknown, depth = 0): JsonLdNode[] {
  if (depth > MAX_WALK_DEPTH) return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => flattenJsonLd(entry, depth + 1));
  }
  if (!isObject(payload)) return [];

  const out: JsonLdNode[] = [payload];
  const containerKeys = ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item", "hasPart", "about"];
  for (const key of containerKeys) {
    const value = payload[key];
    if (value !== undefined) out.push(...flattenJsonLd(value, depth + 1));
  }
  return out;
}

/**
 * Finds the schema.org Recipe nodes in a list of JSON-LD payloads, best first.
 * "Best" = the node with the most ingredient lines, because some pages embed a
 * stub Recipe in a breadcrumb/ItemList alongside the real one.
 */
export function findRecipeNodes(payloads: readonly unknown[]): JsonLdNode[] {
  const seen = new Set<JsonLdNode>();
  const recipes: JsonLdNode[] = [];
  for (const payload of payloads) {
    for (const node of flattenJsonLd(payload)) {
      if (seen.has(node) || !hasType(node, "recipe")) continue;
      seen.add(node);
      recipes.push(node);
    }
  }
  return recipes.sort((left, right) => ingredientCount(right) - ingredientCount(left));
}

function ingredientCount(node: JsonLdNode): number {
  const value = node.recipeIngredient ?? node.ingredients;
  if (Array.isArray(value)) return value.length;
  return typeof value === "string" && value.length > 0 ? 1 : 0;
}

/** Convenience: the best Recipe node on a page, or null. */
export function findRecipeInHtml(source: string | ElementNode): JsonLdNode | null {
  return findRecipeNodes(extractJsonLd(source))[0] ?? null;
}
