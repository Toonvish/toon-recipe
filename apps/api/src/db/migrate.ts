/**
 * Applies the generated SQL migrations in apps/api/drizzle.
 * Used by `bun run db:migrate` AND by integration tests against
 * DATABASE_URL="file::memory:".
 */
import { resolve } from "node:path";
import { foldText } from "@toon/shared";
import { and, eq, ne } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Database } from "./client.ts";
import { db as sharedDb } from "./client.ts";
import { recipeIngredients, recipes } from "./schema.ts";

/** Absolute path of the migrations folder, independent of process.cwd(). */
export const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

/**
 * Applies all pending migrations to `database` (defaults to the shared db), then
 * fills in any pre-folded search column that is still empty.
 */
export async function runMigrations(database: Database = sharedDb): Promise<void> {
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
  await backfillFoldedColumns(database);
}

/**
 * Fills `recipes.title_fold` / `description_fold` and
 * `recipe_ingredients.name_fold` for rows written before migration 0003 added them.
 *
 * IN JS, NOT IN SQL, and that is the whole point. The columns exist so that search
 * never folds per row (see the `recipes` comment in schema.ts), and every write
 * fills them with `foldText()`. Reproducing `foldText()` in SQL is not actually
 * possible here: SQLite's `lower()` is ASCII-only, so an uppercase "È" or "ẞ" would
 * need its own `replace()`, and the full table is 40 nested calls against a parser
 * that overflows at 31. Doing it here means ONE definition of the fold — the same
 * function for a backfilled row and a freshly written one.
 *
 * IDEMPOTENT, and safe to run on every boot. "Needs backfill" is `fold = '' AND
 * source <> ''`: an empty fold is a legitimate stored value (a recipe with no
 * description), so the source column has to be what decides. A row whose title is
 * genuinely empty is left alone — its fold is correctly ''.
 *
 * DELIBERATELY NOT IN A TRANSACTION. libSQL 0.17.4 discards a `file::memory:`
 * database when a transaction commits (see `withTransaction` in
 * services/groups/support.ts), and this runs inside `runMigrations`, which every
 * integration test calls against exactly such a database. It does not need one
 * anyway: each row is independent and an interrupted run simply finds the rest of
 * the work still waiting for it next time.
 *
 * Cheap by construction — on an up-to-date database both SELECTs match nothing.
 * It is not built for millions of rows, and a family recipe box does not have them.
 */
export async function backfillFoldedColumns(database: Database = sharedDb): Promise<number> {
  const staleRecipes = await database
    .select({ id: recipes.id, title: recipes.title, description: recipes.description })
    .from(recipes)
    .where(and(eq(recipes.titleFold, ""), ne(recipes.title, "")));

  for (const row of staleRecipes) {
    await database
      .update(recipes)
      .set({ titleFold: foldText(row.title), descriptionFold: foldText(row.description ?? "") })
      .where(eq(recipes.id, row.id));
  }

  const staleIngredients = await database
    .select({ id: recipeIngredients.id, name: recipeIngredients.name })
    .from(recipeIngredients)
    .where(and(eq(recipeIngredients.nameFold, ""), ne(recipeIngredients.name, "")));

  for (const row of staleIngredients) {
    await database
      .update(recipeIngredients)
      .set({ nameFold: foldText(row.name) })
      .where(eq(recipeIngredients.id, row.id));
  }

  return staleRecipes.length + staleIngredients.length;
}
