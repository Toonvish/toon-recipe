/**
 * libSQL client + drizzle instance.
 *
 * The driver choice is NEVER hardcoded: everything comes from DATABASE_URL.
 *   file:./data/local.db      -> self-hosted local file (directory is created)
 *   file::memory:             -> in-memory (tests)
 *   libsql://xxx.turso.io     -> Turso cloud (requires DATABASE_AUTH_TOKEN)
 */
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "../env.ts";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Resolves a `file:` URL against process.cwd() and creates the directory. */
function prepareUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const path = url.slice("file:".length);
  if (path.startsWith(":memory:") || path.length === 0) return url;
  const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);
  mkdirSync(dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

export interface CreateDatabaseOptions {
  url?: string;
  authToken?: string;
}

/**
 * Builds an independent client + drizzle instance. Use this in tests
 * (`createDatabase({ url: "file::memory:" })`); the app uses the shared `db`.
 */
export function createDatabase(options: CreateDatabaseOptions = {}): {
  client: Client;
  db: Database;
} {
  const url = prepareUrl(options.url ?? env.databaseUrl);
  const authToken = options.authToken ?? env.DATABASE_AUTH_TOKEN;
  const client = createClient(authToken ? { url, authToken } : { url });
  const db = drizzle(client, { schema, logger: env.DEBUG_SQL === true });
  return { client, db };
}

const shared = createDatabase();

/** Process-wide libSQL client. */
export const client: Client = shared.client;
/** Process-wide drizzle instance — import this in routes. */
export const db: Database = shared.db;

export { schema };
