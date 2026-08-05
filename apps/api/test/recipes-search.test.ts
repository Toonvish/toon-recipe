/**
 * The pre-folded search columns (`recipes.title_fold`, `recipes.description_fold`,
 * `recipe_ingredients.name_fold`) and the invariant that keeps them honest.
 *
 * WHY THIS FILE EXISTS. The fold used to be computed in SQL on every search, which
 * made `count(*)` fold every row in the group (32 ms at 2000 recipes, 91 ms for a
 * term that matched nothing). It is now STORED, written by the app — so the risk
 * moved from "slow" to "silently wrong": a write path that forgets a column, or a
 * new entry in FOLD_PAIRS, produces a recipe that simply cannot be found. `tsc`
 * catches a forgotten column (they are NOT NULL with no drizzle default); these
 * tests catch the rest.
 *
 * THE ONE THAT MATTERS MOST is the backfill: a row written before migration 0003
 * must end up with exactly the value a fresh write would give it, or old and new
 * recipes answer the same query differently. That is why `backfillFoldedColumns()`
 * folds in JS with the same `foldText()` — reproducing it in SQL is impossible for
 * an uppercase accent (SQLite's `lower()` is ASCII-only) without overflowing the
 * parser at 31 nested `replace()` calls.
 */
import { FOLD_PAIRS, foldText } from "@toon/shared";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { client, db } from "../src/db/client.ts";
import { backfillFoldedColumns, runMigrations } from "../src/db/migrate.ts";
import { groups, recipeIngredients, recipes, sessions, users } from "../src/db/schema.ts";
import { app } from "../src/index.ts";

await runMigrations(db);

interface TestUser {
  id: string;
  cookie: string;
}

async function createUser(): Promise<TestUser> {
  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, email: `search.${id.slice(0, 8)}@toon.test`, name: "Sucher", emailVerified: true });
  const sessionId = crypto.randomUUID().replaceAll("-", "");
  await db
    .insert(sessions)
    .values({ id: sessionId, userId: id, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 });
  return { id, cookie: `toon_session=${sessionId}` };
}

async function call(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function createGroup(user: TestUser, name: string): Promise<string> {
  const response = await call("/api/groups", { method: "POST", cookie: user.cookie, body: { name } });
  const payload = (await response.json()) as { group: { id: string } };
  return payload.group.id;
}

interface RecipeInput {
  title: string;
  description?: string;
  ingredients?: Array<{ name: string }>;
}

async function createRecipe(user: TestUser, groupId: string, input: RecipeInput): Promise<string> {
  const response = await call(`/api/groups/${groupId}/recipes`, {
    method: "POST",
    cookie: user.cookie,
    body: {
      title: input.title,
      description: input.description,
      ingredients: (input.ingredients ?? []).map((ingredient) => ({ name: ingredient.name })),
      steps: [{ text: "Alles verrühren und backen." }],
      tags: [],
      collectionIds: [],
    },
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { recipe: { id: string } };
  return payload.recipe.id;
}

async function search(user: TestUser, groupId: string, term: string): Promise<string[]> {
  const response = await call(
    `/api/groups/${groupId}/recipes?q=${encodeURIComponent(term)}&limit=100`,
    { cookie: user.cookie },
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { items: Array<{ title: string }>; total: number };
  // `total` comes from the count(*) half, which is a SEPARATE query with the same
  // WHERE — a divergence between the two would show up here first.
  expect(payload.total).toBe(payload.items.length);
  return payload.items.map((item) => item.title);
}

/** Strings that exercise the fold: every table entry, plus real-world titles. */
const FOLD_SAMPLES: readonly string[] = [
  ...FOLD_PAIRS.map(([from]) => from),
  ...FOLD_PAIRS.map(([from]) => `Vor${from}Nach`),
  "Möhren-Auflauf",
  "Grießbrei",
  "MÜSLI",
  "Ähnliche Öl-Übung",
  "Käsespätzle mit Röstzwiebeln",
  // Uppercase accents and ẞ: JS lowercases them, SQLite's lower() does not, which
  // is precisely why the backfill is not written in SQL.
  "GRIEẞBREI",
  "CRÈME BRÛLÉE",
  "CRÊPES SUZETTE",
  "Curaçao",
  "CURAÇAO",
  // Outside the fold table entirely — must survive untouched apart from lowercasing.
  "SMØRREBRØD",
  "Łódź-Torte",
  "already folded ascii",
  "",
];

describe("folded search columns", () => {
  test("the backfill reproduces foldText() exactly, including uppercase accents", async () => {
    // Simulates the pre-0003 state: rows whose fold columns still hold the migration's
    // DEFAULT ''. This is the path every existing deployment takes on the next boot.
    const userId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email: `bf.${userId.slice(0, 8)}@toon.test`, name: "BF" });
    await db.insert(groups).values({ id: groupId, name: `BF ${groupId.slice(0, 8)}`, createdBy: userId });

    const ids = new Map<string, string>();
    for (const sample of FOLD_SAMPLES) {
      const id = crypto.randomUUID();
      ids.set(id, sample);
      await db.insert(recipes).values({
        id,
        groupId,
        title: sample,
        description: sample,
        titleFold: "",
        descriptionFold: "",
        createdBy: userId,
      });
      await db.insert(recipeIngredients).values({
        id: crypto.randomUUID(),
        recipeId: id,
        position: 0,
        name: sample,
        nameFold: "",
      });
    }

    await backfillFoldedColumns(db);

    for (const [id, sample] of ids) {
      const [row] = await db.select().from(recipes).where(eq(recipes.id, id));
      const expected = foldText(sample);
      // An empty title is left alone — '' is already the correct fold for it.
      expect(row?.titleFold).toBe(expected);
      expect(row?.descriptionFold).toBe(expected);

      const [ingredient] = await db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, id));
      expect(ingredient?.nameFold).toBe(expected);
    }
  });

  test("the backfill is idempotent and leaves correct rows untouched", async () => {
    const userId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email: `idem.${userId.slice(0, 8)}@toon.test`, name: "Idem" });
    await db.insert(groups).values({ id: groupId, name: `Idem ${groupId.slice(0, 8)}`, createdBy: userId });
    const id = crypto.randomUUID();
    await db.insert(recipes).values({
      id,
      groupId,
      title: "Möhrensuppe",
      // No description: '' is the CORRECT fold here, and the backfill must not treat
      // it as work to redo (which is why the predicate looks at the source column).
      description: null,
      titleFold: "",
      descriptionFold: "",
      createdBy: userId,
    });

    expect(await backfillFoldedColumns(db)).toBeGreaterThan(0);
    // Second run finds nothing left to do.
    expect(await backfillFoldedColumns(db)).toBe(0);

    const [row] = await db.select().from(recipes).where(eq(recipes.id, id));
    expect(row?.titleFold).toBe("mohrensuppe");
    expect(row?.descriptionFold).toBe("");
  });

  test("a backfilled row and a freshly written one answer the same search", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "Alt und neu");
    // "new" goes through the API, "old" is inserted the pre-0003 way and backfilled.
    await createRecipe(user, groupId, { title: "CRÈME BRÛLÉE neu" });
    const oldId = crypto.randomUUID();
    await db.insert(recipes).values({
      id: oldId,
      groupId,
      title: "CRÈME BRÛLÉE alt",
      titleFold: "",
      descriptionFold: "",
      createdBy: user.id,
    });
    await backfillFoldedColumns(db);

    expect((await search(user, groupId, "creme brulee")).sort()).toEqual([
      "CRÈME BRÛLÉE alt",
      "CRÈME BRÛLÉE neu",
    ]);
  });

  test("a created recipe stores folds that match foldText()", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "Fold-Gruppe");
    const title = "Möhren-Auflauf mit Grießbrei";
    const description = "Süß und würzig, à la Oma.";
    const recipeId = await createRecipe(user, groupId, {
      title,
      description,
      ingredients: [{ name: "Möhren" }, { name: "Grieß" }],
    });

    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(row?.titleFold).toBe(foldText(title));
    expect(row?.descriptionFold).toBe(foldText(description));

    const ingredients = await db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId));
    for (const ingredient of ingredients) {
      expect(ingredient.nameFold).toBe(foldText(ingredient.name));
    }
  });

  test("a recipe with no description stores an empty descriptionFold, not NULL", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "Ohne Beschreibung");
    const recipeId = await createRecipe(user, groupId, { title: "Nur Titel" });

    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(row?.descriptionFold).toBe("");
    // An empty fold must not match a non-empty term (LIKE '%x%' against '').
    expect(await search(user, groupId, "beschreibung")).toEqual([]);
  });

  test("PATCH moves title, description and ingredient folds with their columns", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "Patch-Gruppe");
    const recipeId = await createRecipe(user, groupId, {
      title: "Altes Gericht",
      description: "alte Beschreibung",
      ingredients: [{ name: "Zwiebeln" }],
    });

    // Findable under the old spelling ...
    expect(await search(user, groupId, "altes")).toEqual(["Altes Gericht"]);

    const response = await call(`/api/groups/${groupId}/recipes/${recipeId}`, {
      method: "PATCH",
      cookie: user.cookie,
      body: {
        title: "Käsekuchen à la Öma",
        description: "süße Füllung",
        ingredients: [{ name: "Quark" }, { name: "Zitronenschale" }],
      },
    });
    expect(response.status).toBe(200);

    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(row?.titleFold).toBe(foldText("Käsekuchen à la Öma"));
    expect(row?.descriptionFold).toBe(foldText("süße Füllung"));

    const ingredients = await db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId));
    expect(ingredients.map((row) => row.nameFold).sort()).toEqual(["quark", "zitronenschale"]);

    // ... and no longer under it, which is what proves the fold was REWRITTEN
    // rather than merely added to.
    expect(await search(user, groupId, "altes")).toEqual([]);
    expect(await search(user, groupId, "kasekuchen")).toEqual(["Käsekuchen à la Öma"]);
  });

  test("search is case- and diacritic-insensitive across title, description and ingredients", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "Suchgruppe");
    await createRecipe(user, groupId, {
      title: "Möhrensuppe",
      description: "Mit frischem Ingwer.",
      ingredients: [{ name: "Möhren" }, { name: "Gemüsebrühe" }],
    });
    await createRecipe(user, groupId, {
      title: "Grießbrei",
      description: "Süßspeise für Kinder.",
      ingredients: [{ name: "Grieß" }, { name: "Milch" }],
    });

    // title, either spelling and either case
    expect(await search(user, groupId, "möhrensuppe")).toEqual(["Möhrensuppe"]);
    expect(await search(user, groupId, "MOHRENSUPPE")).toEqual(["Möhrensuppe"]);
    // ß folds to ss in both directions
    expect(await search(user, groupId, "griessbrei")).toEqual(["Grießbrei"]);
    expect(await search(user, groupId, "Grießbrei")).toEqual(["Grießbrei"]);
    // description
    expect(await search(user, groupId, "ingwer")).toEqual(["Möhrensuppe"]);
    expect(await search(user, groupId, "sussspeise")).toEqual(["Grießbrei"]);
    // ingredient name, via the EXISTS sub-query
    expect(await search(user, groupId, "gemusebruhe")).toEqual(["Möhrensuppe"]);
    // a term that matches nothing
    expect(await search(user, groupId, "zzqqx")).toEqual([]);
  });

  test("LIKE wildcards in the search term stay literal", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "Wildcards");
    await createRecipe(user, groupId, { title: "100% Roggenbrot" });
    await createRecipe(user, groupId, { title: "Dinkelbrot" });

    // '%' must not match everything, and must still find the recipe containing it.
    expect(await search(user, groupId, "100%")).toEqual(["100% Roggenbrot"]);
    expect(await search(user, groupId, "%")).toEqual(["100% Roggenbrot"]);
    expect(await search(user, groupId, "_")).toEqual([]);
  });

  test("search is scoped to the group", async () => {
    const user = await createUser();
    const mine = await createGroup(user, "Meine");
    const other = await createGroup(user, "Andere");
    await createRecipe(user, mine, { title: "Möhrensuppe" });
    await createRecipe(user, other, { title: "Möhrensuppe" });

    expect(await search(user, mine, "mohren")).toEqual(["Möhrensuppe"]);
    expect(await search(user, other, "mohren")).toEqual(["Möhrensuppe"]);
  });

  test("?sort=title orders by the folded column, ignoring case and diacritics", async () => {
    const user = await createUser();
    const groupId = await createGroup(user, "Sortiergruppe");
    // Raw ASCII ordering would put every uppercase title before every lowercase one
    // and sort "Ä" after "Z"; the folded column must not.
    for (const title of ["Zwiebelkuchen", "ähnliches Gericht", "Bratkartoffeln", "Öl-Salat", "apfelmus"]) {
      await createRecipe(user, groupId, { title });
    }

    const response = await call(`/api/groups/${groupId}/recipes?sort=title&limit=100`, {
      cookie: user.cookie,
    });
    const payload = (await response.json()) as { items: Array<{ title: string }> };
    expect(payload.items.map((item) => item.title)).toEqual([
      "ähnliches Gericht",
      "apfelmus",
      "Bratkartoffeln",
      "Öl-Salat",
      "Zwiebelkuchen",
    ]);
  });

  test("the title sort reads its order from an index, not a temp B-tree", async () => {
    // The whole point of storing the fold for sorting. `foldSql(title)` in the
    // ORDER BY forced `USE TEMP B-TREE FOR ORDER BY` over every row in the group.
    const plan = await client.execute(
      "explain query plan select * from recipes where group_id = 'x' order by title_fold asc limit 24",
    );
    const detail = plan.rows.map((row) => String(row.detail)).join(" | ");
    expect(detail).toContain("recipes_group_title_fold_idx");
    expect(detail).not.toContain("TEMP B-TREE");
  });

  test("the search count(*) runs two SQL function calls per row, not fifty", async () => {
    // A regression guard for the actual bug. `count(*)` cannot stop early, so every
    // SQL function in its WHERE runs once per row in the group. Comparing pre-folded
    // columns needs exactly one call per column — the LIKE itself. Folding in SQL
    // instead adds `lower()` plus one `replace()` per FOLD_PAIRS entry to each,
    // which is what made a search cost 32 ms at 2000 recipes.
    //
    // Counting `Function` opcodes rather than asserting their absence: LIKE compiles
    // to one, so "none" is unachievable and "few" is the real invariant.
    const countOpcodes = async (sql: string, args: unknown[]): Promise<number> => {
      const plan = await client.execute({ sql, args: args as never[] });
      return plan.rows.filter((row) => String(row.opcode) === "Function").length;
    };

    const stored = await countOpcodes(
      `explain select count(*) from recipes where group_id = ? and (title_fold like ? escape '\\' or description_fold like ? escape '\\')`,
      ["g", "%mohre%", "%mohre%"],
    );
    expect(stored).toBe(2);

    // The shape this replaced, built the way foldSql() would, for contrast.
    let folded = "lower(title)";
    for (const [from, to] of FOLD_PAIRS) folded = `replace(${folded}, '${from}', '${to}')`;
    const expression = await countOpcodes(
      `explain select count(*) from recipes where group_id = ? and (${folded} like ? escape '\\')`,
      ["g", "%mohre%"],
    );
    expect(expression).toBeGreaterThan(stored * 10);
  });
});
