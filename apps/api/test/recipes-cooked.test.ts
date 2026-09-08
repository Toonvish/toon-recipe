/**
 * "Gekocht" — `POST`/`DELETE /recipes/:recipeId/cooked`, `?sort=lastCooked`,
 * `?hasCooked=1` — `apps/api/src/services/recipes/cookLog.ts` +
 * `services/recipes/recipes.service.ts`.
 *
 * WHAT THIS FILE PINS, beyond the usual CRUD:
 *   - the server NEVER guesses "today": no `plannedOn` and no `mealPlanEntryId`
 *     stamps nothing, and `mealPlanEntry` comes back `null`.
 *   - `recipes.last_cooked_at` is denormalised and has exactly ONE writer — the
 *     agreement test below asserts it never drifts from `max(cooked_at)`.
 *   - a cook is not an edit: `recipes.updated_at` must not move.
 *   - `?sort=lastCooked` reads its order off `recipes_group_last_cooked_idx`, not
 *     a temp b-tree — same shape as `test/recipes-search.test.ts`'s title sort and
 *     `test/plan.test.ts`'s range read.
 */
import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { client, db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { mealPlanEntries, recipeCookLog, recipes, sessions, users } from "../src/db/schema.ts";
import { app } from "../src/index.ts";
import { COOK_UNDO_WINDOW_MS } from "../src/services/recipes/cookLog.ts";

await runMigrations(db);

/* -------------------------------------------------------------------------- */
/* harness — duplicated per file rather than shared, per repo convention      */
/* -------------------------------------------------------------------------- */

interface TestUser {
  id: string;
  cookie: string;
}

async function createUser(): Promise<TestUser> {
  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, email: `cooked.${id.slice(0, 8)}@toon.test`, name: "Köchin", emailVerified: true });
  const sessionId = crypto.randomUUID().replaceAll("-", "");
  await db
    .insert(sessions)
    .values({ id: sessionId, userId: id, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 });
  return { id, cookie: `toon_session=${sessionId}` };
}

interface CallOptions {
  method?: string;
  cookie?: string;
  body?: unknown;
}

async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createGroup(user: TestUser, name: string): Promise<string> {
  const response = await call("/api/groups", { method: "POST", cookie: user.cookie, body: { name } });
  const payload = await body<{ group: { id: string } }>(response);
  return payload.group.id;
}

async function createRecipe(user: TestUser, groupId: string, title: string): Promise<string> {
  const response = await call(`/api/groups/${groupId}/recipes`, {
    method: "POST",
    cookie: user.cookie,
    body: {
      title,
      ingredients: [],
      steps: [{ text: "Alles verrühren und backen." }],
      tags: [],
      collectionIds: [],
    },
  });
  expect(response.status).toBe(201);
  const payload = await body<{ recipe: { id: string } }>(response);
  return payload.recipe.id;
}

async function planEntry(
  user: TestUser,
  groupId: string,
  input: { recipeId: string; plannedOn: string },
): Promise<{ id: string }> {
  const response = await call(`/api/groups/${groupId}/plan`, { method: "POST", cookie: user.cookie, body: input });
  const payload = await body<{ entry: { id: string } }>(response);
  return payload.entry;
}

interface CookedPayload {
  recipeId: string;
  cookedAt: string;
  lastCookedAt: string;
  mealPlanEntry: { id: string; cookedAt: string | null } | null;
}

async function markCooked(
  user: TestUser,
  groupId: string,
  recipeId: string,
  input: { plannedOn?: string; mealPlanEntryId?: string } = {},
): Promise<Response> {
  return call(`/api/groups/${groupId}/recipes/${recipeId}/cooked`, {
    method: "POST",
    cookie: user.cookie,
    body: input,
  });
}

async function undoCooked(user: TestUser, groupId: string, recipeId: string): Promise<Response> {
  return call(`/api/groups/${groupId}/recipes/${recipeId}/cooked`, { method: "DELETE", cookie: user.cookie });
}

async function getRecipeDetail(user: TestUser, groupId: string, recipeId: string) {
  const response = await call(`/api/groups/${groupId}/recipes/${recipeId}`, { cookie: user.cookie });
  const payload = await body<{ recipe: { lastCookedAt: string | null; updatedAt: string } }>(response);
  return payload.recipe;
}

async function listRecipes(user: TestUser, groupId: string, query = "") {
  const response = await call(`/api/groups/${groupId}/recipes${query}`, { cookie: user.cookie });
  return body<{ items: Array<{ id: string; title: string; lastCookedAt: string | null }>; total: number }>(response);
}

/* -------------------------------------------------------------------------- */
/* POST /recipes/:recipeId/cooked                                            */
/* -------------------------------------------------------------------------- */

describe("POST /recipes/:recipeId/cooked", () => {
  test("appends one log row with the caller as cooked_by, and sets recipes.last_cooked_at", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Kochen");
    const recipeId = await createRecipe(user, groupId, "Bolognese");

    const response = await markCooked(user, groupId, recipeId);
    expect(response.status).toBe(200);
    const payload = await body<CookedPayload>(response);
    expect(payload.recipeId).toBe(recipeId);
    expect(payload.mealPlanEntry).toBeNull();

    const rows = await db.select().from(recipeCookLog).where(eq(recipeCookLog.recipeId, recipeId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.cookedBy).toBe(user.id);

    const detail = await getRecipeDetail(user, groupId, recipeId);
    expect(detail.lastCookedAt).toBe(payload.lastCookedAt);
  });

  test("lastCookedAt is null before the first cook, on both list item and detail", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Ungekocht");
    const recipeId = await createRecipe(user, groupId, "Noch nie gekocht");

    const detail = await getRecipeDetail(user, groupId, recipeId);
    expect(detail.lastCookedAt).toBeNull();

    const list = await listRecipes(user, groupId);
    const item = list.items.find((entry) => entry.id === recipeId);
    expect(item?.lastCookedAt).toBeNull();

    await markCooked(user, groupId, recipeId);

    const detailAfter = await getRecipeDetail(user, groupId, recipeId);
    expect(detailAfter.lastCookedAt).not.toBeNull();
    const listAfter = await listRecipes(user, groupId);
    const itemAfter = listAfter.items.find((entry) => entry.id === recipeId);
    expect(itemAfter?.lastCookedAt).toBe(detailAfter.lastCookedAt);
  });

  test("with plannedOn naming a planned day, that entry is stamped and returned", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Plan");
    const recipeId = await createRecipe(user, groupId, "Geplantes Gericht");
    const entry = await planEntry(user, groupId, { recipeId, plannedOn: "2026-09-10" });

    const response = await markCooked(user, groupId, recipeId, { plannedOn: "2026-09-10" });
    const payload = await body<CookedPayload>(response);
    expect(payload.mealPlanEntry?.id).toBe(entry.id);
    expect(payload.mealPlanEntry?.cookedAt).not.toBeNull();

    const rows = await db.select().from(mealPlanEntries).where(eq(mealPlanEntries.id, entry.id));
    expect(rows[0]?.cookedAt).not.toBeNull();
  });

  test("without plannedOn and without mealPlanEntryId, nothing is stamped — the server never guesses today", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Rätst nicht");
    const recipeId = await createRecipe(user, groupId, "Ungeplant gekocht");
    // Planned for TODAY in the seed's own calendar sense would be a guess; the
    // point is that the server has no notion of "today" at all.
    await planEntry(user, groupId, { recipeId, plannedOn: "2026-09-10" });

    const response = await markCooked(user, groupId, recipeId);
    const payload = await body<CookedPayload>(response);
    expect(payload.mealPlanEntry).toBeNull();

    const rows = await db.select().from(mealPlanEntries).where(eq(mealPlanEntries.recipeId, recipeId));
    expect(rows[0]?.cookedAt).toBeNull();
  });

  test("mealPlanEntryId pointing at another recipe's entry -> 404", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Verwechselt");
    const recipeA = await createRecipe(user, groupId, "Rezept A");
    const recipeB = await createRecipe(user, groupId, "Rezept B");
    const entryA = await planEntry(user, groupId, { recipeId: recipeA, plannedOn: "2026-09-11" });

    const response = await markCooked(user, groupId, recipeB, { mealPlanEntryId: entryA.id });
    expect(response.status).toBe(404);
  });

  test("recipes.updated_at is unchanged by a cook", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Unverändert");
    const recipeId = await createRecipe(user, groupId, "Bleibt gleich alt");
    const before = await getRecipeDetail(user, groupId, recipeId);

    await markCooked(user, groupId, recipeId);

    const after = await getRecipeDetail(user, groupId, recipeId);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test("deleting a plan entry leaves the log row with meal_plan_entry_id IS NULL", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Entfernt");
    const recipeId = await createRecipe(user, groupId, "Verwaister Log-Eintrag");
    const entry = await planEntry(user, groupId, { recipeId, plannedOn: "2026-09-12" });
    await markCooked(user, groupId, recipeId, { mealPlanEntryId: entry.id });

    const deleteResponse = await call(`/api/groups/${groupId}/plan/${entry.id}`, {
      method: "DELETE",
      cookie: user.cookie,
    });
    expect(deleteResponse.status).toBe(204);

    const rows = await db.select().from(recipeCookLog).where(eq(recipeCookLog.recipeId, recipeId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.mealPlanEntryId).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* ?sort=lastCooked / ?hasCooked=1                                            */
/* -------------------------------------------------------------------------- */

describe("?sort=lastCooked and ?hasCooked=1", () => {
  test("cooked recipes sort newest-first, never-cooked last; hasCooked=1 returns only the cooked ones", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Sortiert");
    const never = await createRecipe(user, groupId, "Nie gekocht");
    const older = await createRecipe(user, groupId, "Älter gekocht");
    const newer = await createRecipe(user, groupId, "Neu gekocht");

    await markCooked(user, groupId, older);
    await markCooked(user, groupId, newer);

    const sorted = await listRecipes(user, groupId, "?sort=lastCooked&limit=100");
    const order = sorted.items.map((item) => item.id);
    expect(order.indexOf(newer)).toBeLessThan(order.indexOf(older));
    expect(order.indexOf(older)).toBeLessThan(order.indexOf(never));

    const cookedOnly = await listRecipes(user, groupId, "?hasCooked=1&limit=100");
    expect(cookedOnly.items.map((item) => item.id).sort()).toEqual([newer, older].sort());
    expect(cookedOnly.total).toBe(cookedOnly.items.length);
  });
});

/* -------------------------------------------------------------------------- */
/* the agreement invariant                                                    */
/* -------------------------------------------------------------------------- */

describe("the agreement invariant", () => {
  test("recipes.last_cooked_at always equals max(cooked_at) of its log rows, or is NULL", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Übereinstimmung");
    const recipeA = await createRecipe(user, groupId, "Rezept Eins");
    const recipeB = await createRecipe(user, groupId, "Rezept Zwei");

    await markCooked(user, groupId, recipeA);
    await markCooked(user, groupId, recipeB);
    await markCooked(user, groupId, recipeA);
    await undoCooked(user, groupId, recipeA);

    for (const recipeId of [recipeA, recipeB]) {
      const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
      const logRows = await db.select().from(recipeCookLog).where(eq(recipeCookLog.recipeId, recipeId));
      const expected = logRows.length === 0 ? null : Math.max(...logRows.map((row) => row.cookedAt));
      expect(recipe?.lastCookedAt ?? null).toBe(expected);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* DELETE /recipes/:recipeId/cooked (undo)                                    */
/* -------------------------------------------------------------------------- */

describe("DELETE /recipes/:recipeId/cooked (undo)", () => {
  test("undoes the caller's own most recent cook inside the window", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Rückgängig");
    const recipeId = await createRecipe(user, groupId, "Rückgängig gemacht");
    await markCooked(user, groupId, recipeId);

    const response = await undoCooked(user, groupId, recipeId);
    expect(response.status).toBe(204);

    const rows = await db.select().from(recipeCookLog).where(eq(recipeCookLog.recipeId, recipeId));
    expect(rows.length).toBe(0);
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(recipe?.lastCookedAt).toBeNull();
  });

  test("clears the plan entry's cooked_at when it was the row that stamped it", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Entstempelt");
    const recipeId = await createRecipe(user, groupId, "Entstempelt");
    const entry = await planEntry(user, groupId, { recipeId, plannedOn: "2026-09-13" });
    await markCooked(user, groupId, recipeId, { mealPlanEntryId: entry.id });

    await undoCooked(user, groupId, recipeId);

    const rows = await db.select().from(mealPlanEntries).where(eq(mealPlanEntries.id, entry.id));
    expect(rows[0]?.cookedAt).toBeNull();
  });

  test("404 server.recipes.nothingToUndo outside the window", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Zu spät");
    const recipeId = await createRecipe(user, groupId, "Zu spät zum Widerrufen");
    await markCooked(user, groupId, recipeId);

    // Backdate the log row past the undo window rather than waiting ten minutes.
    await db
      .update(recipeCookLog)
      .set({ cookedAt: Date.now() - COOK_UNDO_WINDOW_MS - 1000 })
      .where(and(eq(recipeCookLog.recipeId, recipeId), eq(recipeCookLog.cookedBy, user.id)));

    const response = await undoCooked(user, groupId, recipeId);
    expect(response.status).toBe(404);
    const payload = await body<{ error: { code: string } }>(response);
    expect(payload.error.code).toBe("not_found");

    const rows = await db.select().from(recipeCookLog).where(eq(recipeCookLog.recipeId, recipeId));
    expect(rows.length).toBe(1); // untouched
  });

  test("404 with nothing to undo at all", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "WG Nichts");
    const recipeId = await createRecipe(user, groupId, "Nie gekocht, nichts zum Widerrufen");

    const response = await undoCooked(user, groupId, recipeId);
    expect(response.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* index usage                                                                */
/* -------------------------------------------------------------------------- */

describe("the lastCooked sort", () => {
  test("uses recipes_group_last_cooked_idx, not a temp b-tree", async () => {
    const plan = await client.execute(
      "explain query plan select * from recipes where group_id = 'x' " +
        "order by last_cooked_at desc, created_at desc limit 24",
    );
    const detail = plan.rows.map((row) => String(row.detail)).join(" | ");
    expect(detail).toContain("recipes_group_last_cooked_idx");
    expect(detail).not.toContain("TEMP B-TREE");
  });
});
