/**
 * Shared query helpers for the groups + recipes services.
 *
 * Lives inside services/groups/ because that directory and services/recipes/
 * are owned by the same agent; both import from here.
 */
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { env } from "../../env.ts";

/** The transaction handle drizzle hands to `db.transaction(cb)`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Anything that can run queries: the pooled drizzle instance or a transaction.
 * Every service function takes this so it can be composed inside a transaction
 * and so tests can pass an isolated in-memory database.
 */
export type DbLike = Database | Tx;

/**
 * KNOWN LIBSQL LIMITATION (verified with @libsql/client 0.17.4 + Bun 1.3.14):
 * `client.transaction()` opens a SECOND connection, and for an in-memory URL
 * (`file::memory:`) that second connection is a brand-new, EMPTY database —
 * after the transaction commits, every table is gone. File-backed databases
 * (self-hosted `file:./data/local.db`) and Turso are unaffected.
 *
 * Integration tests run with DATABASE_URL=file::memory: (forced by env.ts), so
 * `withTransaction` degrades to sequential execution there and uses a real
 * transaction in every other configuration. The statement order is identical,
 * so the tests still cover the full write path; only the rollback guarantee is
 * missing on the memory DB.
 */
export const transactionsSupported: boolean = !env.databaseUrl.includes(":memory:");

/** Runs `work` inside a transaction wherever libSQL supports one (see above). */
export async function withTransaction<T>(
  db: Database,
  work: (tx: DbLike) => Promise<T>,
): Promise<T> {
  if (!transactionsSupported) return work(db);
  return db.transaction(async (tx) => work(tx));
}

/** Current unix ms — one place so tests can reason about ordering. */
export function nowMs(): number {
  return Date.now();
}

/* -------------------------------------------------------------------------- */
/* German-friendly, case-insensitive text matching                            */
/* -------------------------------------------------------------------------- */

/**
 * SQLite's `lower()` only folds ASCII, so "Ä" would never match "ä" and
 * "Grieß" would never match "griess". We therefore fold BOTH sides (column and
 * search term) with the same replacement table before the LIKE comparison.
 * Umlauts are folded to their base letter so "Möhre" is found by "mohre" too.
 */
const FOLD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Ä", "a"],
  ["Ö", "o"],
  ["Ü", "u"],
  ["ä", "a"],
  ["ö", "o"],
  ["ü", "u"],
  ["ß", "ss"],
  ["é", "e"],
  ["è", "e"],
  ["ê", "e"],
  ["á", "a"],
  ["à", "a"],
  ["â", "a"],
  ["í", "i"],
  ["ì", "i"],
  ["î", "i"],
  ["ó", "o"],
  ["ò", "o"],
  ["ô", "o"],
  ["ú", "u"],
  ["ù", "u"],
  ["û", "u"],
  ["ç", "c"],
];

/** Wraps a column/expression in `lower()` + the fold replacements. */
export function foldSql(expression: SQL | SQL.Aliased | unknown): SQL<string> {
  let folded = sql`lower(${expression})`;
  for (const [from, to] of FOLD_PAIRS) {
    folded = sql`replace(${folded}, ${from}, ${to})`;
  }
  return folded as SQL<string>;
}

/** Applies the same folding as `foldSql` in JavaScript. */
export function foldText(value: string): string {
  let folded = value.toLowerCase();
  for (const [from, to] of FOLD_PAIRS) folded = folded.split(from).join(to);
  return folded;
}

/** Escapes LIKE wildcards; pair with `escape '\'` (see likeFolded). */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * `<folded column> LIKE '%<folded term>%' ESCAPE '\'` — the LIKE-based search
 * documented in src/db/schema.ts (FTS5 is deliberately out of scope).
 */
export function likeFolded(expression: unknown, term: string): SQL<unknown> {
  const pattern = `%${escapeLike(foldText(term))}%`;
  // The doubled backslash is the TS escape: SQLite sees ESCAPE '\'.
  return sql`${foldSql(expression)} like ${pattern} escape '\\'`;
}

/** Case-insensitive equality (German folded) for names, e.g. tag names. */
export function eqFolded(expression: unknown, value: string): SQL<unknown> {
  return sql`${foldSql(expression)} = ${foldText(value)}`;
}

/* -------------------------------------------------------------------------- */
/* misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Turns rows of `{ key, value }` counts into a lookup map. */
export function toCountMap(rows: ReadonlyArray<{ key: string; value: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.key, Number(row.value));
  return map;
}

/** De-duplicates while keeping the first occurrence order. */
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
