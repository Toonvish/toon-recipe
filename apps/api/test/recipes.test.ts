/**
 * Integration tests for /api/groups/:groupId/{recipes,tags,collections}.
 *
 * Same harness as test/groups.test.ts: real Hono app, real session + group
 * middleware, in-memory libSQL database with the generated migrations applied.
 */
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import {
  collectionRecipes,
  groupMembers,
  recipeIngredients,
  recipeSteps,
  sessions,
  users,
} from "../src/db/schema.ts";
import { env } from "../src/env.ts";
import { app } from "../src/index.ts";

await runMigrations(db);

interface TestUser {
  id: string;
  email: string;
  name: string;
  cookie: string;
}

async function createUser(name: string): Promise<TestUser> {
  const id = crypto.randomUUID();
  const email = `${name.toLowerCase()}.${id.slice(0, 8)}@toon.test`;
  await db.insert(users).values({ id, email, name, emailVerified: true });
  const sessionId = crypto.randomUUID().replaceAll("-", "");
  await db
    .insert(sessions)
    .values({ id: sessionId, userId: id, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 });
  return { id, email, name, cookie: `toon_session=${sessionId}` };
}

interface RequestOptions {
  method?: string;
  cookie?: string;
  body?: unknown;
}

async function call(path: string, options: RequestOptions = {}): Promise<Response> {
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

interface RecipeDetailPayload {
  recipe: {
    id: string;
    title: string;
    imageUrl: string | null;
    ingredients: Array<{ position: number; section: string | null; name: string; quantity: number | null; raw: string }>;
    steps: Array<{ position: number; section: string | null; text: string }>;
    tags: Array<{ id: string; name: string }>;
    collectionIds: string[];
    author: { id: string; name: string };
  };
}

interface RecipeListPayload {
  items: Array<{ id: string; title: string; ingredientCount: number; stepCount: number; tags: Array<{ id: string; name: string }> }>;
  total: number;
  limit: number;
  offset: number;
}

interface ErrorPayload {
  error: { code: string; message: string };
}

/** owner + one plain member sharing a fresh group. */
async function setupGroup(): Promise<{ owner: TestUser; member: TestUser; groupId: string }> {
  const owner = await createUser("Owner");
  const member = await createUser("Member");
  const created = await call("/api/groups", {
    method: "POST",
    cookie: owner.cookie,
    body: { name: `Kochbuch ${crypto.randomUUID().slice(0, 8)}` },
  });
  expect(created.status).toBe(201);
  const groupId = (await body<{ group: { id: string } }>(created)).group.id;
  await db
    .insert(groupMembers)
    .values({ id: crypto.randomUUID(), groupId, userId: member.id, role: "member" });
  return { owner, member, groupId };
}

const SAMPLE_RECIPE = {
  title: "Zucchini-Auflauf mit Möhren",
  description: "Schnelles Ofengericht für die ganze Familie",
  servingsAmount: 2,
  servingsUnit: "Portionen",
  prepMinutes: 15,
  cookMinutes: 25,
  difficulty: "einfach",
  ingredients: [
    { section: "Für den Auflauf", quantity: 500, unit: "g", name: "Zucchini" },
    { section: "Für den Auflauf", quantity: 2, quantityMax: 3, unit: "Stück", name: "Möhren" },
    { section: "Für die Soße", quantity: 200, unit: "ml", name: "Sahne", note: "vegan" },
    { section: "Für die Soße", quantity: 1, unit: "Prise", name: "Muskatnuss" },
  ],
  steps: [
    { section: "Vorbereiten", text: "Gemüse waschen und in Scheiben schneiden." },
    { section: "Backen", text: "Bei 200 °C 25 Minuten backen." },
  ],
  tags: ["Vegetarisch", "Ofen"],
};

/** Creates SAMPLE_RECIPE (optionally patched) and returns the detail payload. */
async function createRecipe(
  user: TestUser,
  groupId: string,
  patch: Record<string, unknown> = {},
): Promise<RecipeDetailPayload["recipe"]> {
  const response = await call(`/api/groups/${groupId}/recipes`, {
    method: "POST",
    cookie: user.cookie,
    body: { ...SAMPLE_RECIPE, ...patch },
  });
  expect(response.status).toBe(201);
  return (await body<RecipeDetailPayload>(response)).recipe;
}

describe("recipe create + detail", () => {
  test("nested ingredients, steps, sections and tag names round-trip", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId);

    expect(recipe.ingredients.map((item) => item.position)).toEqual([0, 1, 2, 3]);
    expect(recipe.ingredients.map((item) => item.section)).toEqual([
      "Für den Auflauf",
      "Für den Auflauf",
      "Für die Soße",
      "Für die Soße",
    ]);
    // `raw` is derived when the client does not send it
    expect(recipe.ingredients[0]?.raw).toBe("500 g Zucchini");
    expect(recipe.ingredients[1]?.raw).toBe("2-3 Stück Möhren");
    expect(recipe.ingredients[2]?.raw).toBe("200 ml Sahne (vegan)");

    expect(recipe.steps.map((step) => step.position)).toEqual([0, 1]);
    expect(recipe.steps.map((step) => step.section)).toEqual(["Vorbereiten", "Backen"]);
    expect(recipe.tags.map((tag) => tag.name).sort()).toEqual(["Ofen", "Vegetarisch"]);
    expect(recipe.author.id).toBe(owner.id);

    const detail = await call(`/api/groups/${groupId}/recipes/${recipe.id}`, {
      cookie: owner.cookie,
    });
    expect(detail.status).toBe(200);
    const fetched = (await body<RecipeDetailPayload>(detail)).recipe;
    expect(fetched.ingredients).toHaveLength(4);
    expect(fetched.steps).toHaveLength(2);
  });

  test("a second member of the group sees the recipe, a non-member does not", async () => {
    const { owner, member, groupId } = await setupGroup();
    const outsider = await createUser("Outsider");
    const recipe = await createRecipe(owner, groupId);

    const memberList = await call(`/api/groups/${groupId}/recipes`, { cookie: member.cookie });
    expect(memberList.status).toBe(200);
    expect((await body<RecipeListPayload>(memberList)).items[0]?.id).toBe(recipe.id);

    const memberDetail = await call(`/api/groups/${groupId}/recipes/${recipe.id}`, {
      cookie: member.cookie,
    });
    expect(memberDetail.status).toBe(200);

    for (const path of [`/api/groups/${groupId}/recipes`, `/api/groups/${groupId}/recipes/${recipe.id}`]) {
      const denied = await call(path, { cookie: outsider.cookie });
      expect([403, 404]).toContain(denied.status);
    }

    const anonymous = await call(`/api/groups/${groupId}/recipes`);
    expect(anonymous.status).toBe(401);
  });

  test("the list shape stays lightweight but carries counts and tags", async () => {
    const { owner, groupId } = await setupGroup();
    await createRecipe(owner, groupId);
    const list = await body<RecipeListPayload>(
      await call(`/api/groups/${groupId}/recipes`, { cookie: owner.cookie }),
    );
    expect(list.total).toBe(1);
    expect(list.limit).toBe(24);
    expect(list.offset).toBe(0);
    const item = list.items[0];
    expect(item?.ingredientCount).toBe(4);
    expect(item?.stepCount).toBe(2);
    expect(item?.tags).toHaveLength(2);
    expect(item as unknown as { ingredients?: unknown }).not.toHaveProperty("ingredients");
  });

  test("a recipe of another group is not reachable through this group", async () => {
    const first = await setupGroup();
    const second = await setupGroup();
    const recipe = await createRecipe(first.owner, first.groupId);
    const response = await call(`/api/groups/${second.groupId}/recipes/${recipe.id}`, {
      cookie: second.owner.cookie,
    });
    expect([403, 404]).toContain(response.status);
  });
});

describe("search, filter, sort", () => {
  test("q matches title, description and ingredient names (umlaut folded)", async () => {
    const { owner, groupId } = await setupGroup();
    await createRecipe(owner, groupId);
    await createRecipe(owner, groupId, {
      title: "Grießbrei",
      description: "Süßer Klassiker",
      ingredients: [{ quantity: 250, unit: "ml", name: "Milch" }],
      steps: [{ text: "Alles aufkochen." }],
      tags: [],
    });

    const search = async (q: string): Promise<RecipeListPayload> =>
      body<RecipeListPayload>(
        await call(`/api/groups/${groupId}/recipes?q=${encodeURIComponent(q)}`, {
          cookie: owner.cookie,
        }),
      );

    // ingredient name hit
    expect((await search("zucchini")).total).toBe(1);
    // title hit with folded umlauts ("Möhren" found by "mohren")
    expect((await search("mohren")).total).toBe(1);
    // description hit
    expect((await search("ofengericht")).total).toBe(1);
    // ß folded to ss
    expect((await search("griessbrei")).total).toBe(1);
    expect((await search("Grießbrei")).total).toBe(1);
    // nothing
    expect((await search("pizza")).total).toBe(0);
    // LIKE wildcards are escaped, not interpreted
    expect((await search("%")).total).toBe(0);
  });

  test("filters by tag, collection, maxMinutes and difficulty", async () => {
    const { owner, groupId } = await setupGroup();
    const auflauf = await createRecipe(owner, groupId);
    const quick = await createRecipe(owner, groupId, {
      title: "Schnelles Brot",
      prepMinutes: 5,
      cookMinutes: 5,
      difficulty: "mittel",
      tags: ["Ofen"],
      ingredients: [{ quantity: 1, unit: "kg", name: "Mehl" }],
      steps: [{ text: "Backen." }],
    });

    const tags = await body<{ items: Array<{ id: string; name: string; recipeCount: number }> }>(
      await call(`/api/groups/${groupId}/tags`, { cookie: owner.cookie }),
    );
    const ofen = tags.items.find((tag) => tag.name === "Ofen");
    const vegetarisch = tags.items.find((tag) => tag.name === "Vegetarisch");
    expect(ofen?.recipeCount).toBe(2);
    expect(vegetarisch?.recipeCount).toBe(1);

    const query = async (search: string): Promise<RecipeListPayload> =>
      body<RecipeListPayload>(
        await call(`/api/groups/${groupId}/recipes?${search}`, { cookie: owner.cookie }),
      );

    // a recipe must carry ALL requested tags
    expect((await query(`tags=${ofen?.id}`)).total).toBe(2);
    expect((await query(`tags=${ofen?.id},${vegetarisch?.id}`)).total).toBe(1);
    expect((await query("maxMinutes=15")).items.map((item) => item.id)).toEqual([quick.id]);
    expect((await query("difficulty=einfach")).items.map((item) => item.id)).toEqual([auflauf.id]);

    const collection = await body<{ collection: { id: string } }>(
      await call(`/api/groups/${groupId}/collections`, {
        method: "POST",
        cookie: owner.cookie,
        body: { name: "Lieblinge", recipeIds: [quick.id] },
      }),
    );
    expect((await query(`collectionId=${collection.collection.id}`)).items.map((i) => i.id)).toEqual([
      quick.id,
    ]);
  });

  test("sort=title orders case- and umlaut-insensitively, pagination works", async () => {
    const { owner, groupId } = await setupGroup();
    for (const title of ["Zwiebelkuchen", "Äpfelkuchen", "birnenkuchen"]) {
      await createRecipe(owner, groupId, { title, tags: [], ingredients: [], steps: [] });
    }
    const sorted = await body<RecipeListPayload>(
      await call(`/api/groups/${groupId}/recipes?sort=title`, { cookie: owner.cookie }),
    );
    expect(sorted.items.map((item) => item.title)).toEqual([
      "Äpfelkuchen",
      "birnenkuchen",
      "Zwiebelkuchen",
    ]);

    const page = await body<RecipeListPayload>(
      await call(`/api/groups/${groupId}/recipes?sort=title&limit=2&offset=2`, {
        cookie: owner.cookie,
      }),
    );
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.title)).toEqual(["Zwiebelkuchen"]);
  });

  test("an invalid query is a 422", async () => {
    const { owner, groupId } = await setupGroup();
    const response = await call(`/api/groups/${groupId}/recipes?sort=bogus`, {
      cookie: owner.cookie,
    });
    expect(response.status).toBe(422);
  });
});

describe("recipe update + delete", () => {
  test("replacing ingredients keeps positions contiguous and leaves no orphans", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId);

    const response = await call(`/api/groups/${groupId}/recipes/${recipe.id}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: {
        ingredients: [
          { section: "Für den Teig", quantity: 300, unit: "g", name: "Mehl" },
          { section: "Für den Teig", quantity: 1, unit: "Pck.", name: "Trockenhefe" },
          { section: "Für die Glasur", quantity: 2, unit: "EL", name: "Zucker" },
        ],
        steps: [{ text: "Teig kneten." }],
      },
    });
    expect(response.status).toBe(200);
    const updated = (await body<RecipeDetailPayload>(response)).recipe;
    expect(updated.ingredients.map((item) => item.position)).toEqual([0, 1, 2]);
    expect(updated.ingredients.map((item) => item.section)).toEqual([
      "Für den Teig",
      "Für den Teig",
      "Für die Glasur",
    ]);
    expect(updated.steps.map((step) => step.position)).toEqual([0]);
    // untouched fields survive a partial update
    expect(updated.title).toBe(SAMPLE_RECIPE.title);
    expect(updated.tags).toHaveLength(2);

    const ingredientRows = await db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipe.id))
      .orderBy(asc(recipeIngredients.position));
    expect(ingredientRows.map((row) => row.position)).toEqual([0, 1, 2]);
    const stepRows = await db.select().from(recipeSteps).where(eq(recipeSteps.recipeId, recipe.id));
    expect(stepRows).toHaveLength(1);
  });

  test("absent child arrays are untouched, empty arrays clear them", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId);

    const renamed = (
      await body<RecipeDetailPayload>(
        await call(`/api/groups/${groupId}/recipes/${recipe.id}`, {
          method: "PATCH",
          cookie: owner.cookie,
          body: { title: "Neuer Titel" },
        }),
      )
    ).recipe;
    expect(renamed.title).toBe("Neuer Titel");
    expect(renamed.ingredients).toHaveLength(4);

    const cleared = (
      await body<RecipeDetailPayload>(
        await call(`/api/groups/${groupId}/recipes/${recipe.id}`, {
          method: "PATCH",
          cookie: owner.cookie,
          body: { ingredients: [], tags: [] },
        }),
      )
    ).recipe;
    expect(cleared.ingredients).toHaveLength(0);
    expect(cleared.tags).toHaveLength(0);
    expect(cleared.steps).toHaveLength(2);
  });

  test("only the author or an admin may change/delete a recipe", async () => {
    const { owner, member, groupId } = await setupGroup();
    const ownersRecipe = await createRecipe(owner, groupId);
    const membersRecipe = await createRecipe(member, groupId, { title: "Vom Mitglied" });

    // plain member on somebody else's recipe
    expect(
      (
        await call(`/api/groups/${groupId}/recipes/${ownersRecipe.id}`, {
          method: "PATCH",
          cookie: member.cookie,
          body: { title: "Geklaut" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`/api/groups/${groupId}/recipes/${ownersRecipe.id}`, {
          method: "DELETE",
          cookie: member.cookie,
        })
      ).status,
    ).toBe(403);

    // author edits their own
    expect(
      (
        await call(`/api/groups/${groupId}/recipes/${membersRecipe.id}`, {
          method: "PATCH",
          cookie: member.cookie,
          body: { rating: 5 },
        })
      ).status,
    ).toBe(200);

    // owner (admin rank) deletes somebody else's
    expect(
      (
        await call(`/api/groups/${groupId}/recipes/${membersRecipe.id}`, {
          method: "DELETE",
          cookie: owner.cookie,
        })
      ).status,
    ).toBe(204);
    expect(
      (await call(`/api/groups/${groupId}/recipes/${membersRecipe.id}`, { cookie: owner.cookie }))
        .status,
    ).toBe(404);
  });
});

describe("tags", () => {
  test("create, duplicate conflict, rename, member-vs-admin delete", async () => {
    const { owner, member, groupId } = await setupGroup();
    const created = await call(`/api/groups/${groupId}/tags`, {
      method: "POST",
      cookie: member.cookie,
      body: { name: "Süßspeise", color: "#e11d48" },
    });
    expect(created.status).toBe(201);
    const tag = (await body<{ tag: { id: string; name: string; color: string | null } }>(created))
      .tag;
    expect(tag.color).toBe("#e11d48");

    const duplicate = await call(`/api/groups/${groupId}/tags`, {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "süßspeise" },
    });
    expect(duplicate.status).toBe(409);
    expect((await body<ErrorPayload>(duplicate)).error.code).toBe("tag_name_taken");

    const renamed = await call(`/api/groups/${groupId}/tags/${tag.id}`, {
      method: "PATCH",
      cookie: member.cookie,
      body: { name: "Dessert" },
    });
    expect(renamed.status).toBe(200);
    expect((await body<{ tag: { name: string } }>(renamed)).tag.name).toBe("Dessert");

    // deleting needs admin+
    expect(
      (await call(`/api/groups/${groupId}/tags/${tag.id}`, { method: "DELETE", cookie: member.cookie }))
        .status,
    ).toBe(403);
    expect(
      (await call(`/api/groups/${groupId}/tags/${tag.id}`, { method: "DELETE", cookie: owner.cookie }))
        .status,
    ).toBe(204);
  });

  test("tagging a recipe get-or-creates and never 404s", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId, { tags: ["Neu", "neu", " Frisch "] });
    expect(recipe.tags.map((tag) => tag.name).sort()).toEqual(["Frisch", "Neu"]);

    const retagged = (
      await body<RecipeDetailPayload>(
        await call(`/api/groups/${groupId}/recipes/${recipe.id}`, {
          method: "PATCH",
          cookie: owner.cookie,
          body: { tags: ["Frisch", "Winter"] },
        }),
      )
    ).recipe;
    expect(retagged.tags.map((tag) => tag.name).sort()).toEqual(["Frisch", "Winter"]);

    // "Neu" still exists in the group, now unused
    const tags = await body<{ items: Array<{ name: string; recipeCount: number }> }>(
      await call(`/api/groups/${groupId}/tags`, { cookie: owner.cookie }),
    );
    expect(tags.items.find((tag) => tag.name === "Neu")?.recipeCount).toBe(0);
    expect(tags.items.find((tag) => tag.name === "Frisch")?.recipeCount).toBe(1);
  });

  test("deleting a tag unlinks it from its recipes", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId);
    const tagId = recipe.tags[0]?.id ?? "";

    expect(
      (await call(`/api/groups/${groupId}/tags/${tagId}`, { method: "DELETE", cookie: owner.cookie }))
        .status,
    ).toBe(204);

    const detail = (
      await body<RecipeDetailPayload>(
        await call(`/api/groups/${groupId}/recipes/${recipe.id}`, { cookie: owner.cookie }),
      )
    ).recipe;
    expect(detail.tags.map((tag) => tag.id)).not.toContain(tagId);
  });
});

describe("collections", () => {
  interface CollectionPayload {
    collection: { id: string; name: string; recipeCount?: number };
  }
  interface CollectionDetailPayload {
    collection: { id: string; recipeCount?: number };
    recipes: Array<{ id: string; title: string }>;
  }

  test("create with recipes, detail keeps position order, PATCH reorders", async () => {
    const { owner, groupId } = await setupGroup();
    const a = await createRecipe(owner, groupId, { title: "Erstes", tags: [] });
    const b = await createRecipe(owner, groupId, { title: "Zweites", tags: [] });
    const c = await createRecipe(owner, groupId, { title: "Drittes", tags: [] });

    const created = await call(`/api/groups/${groupId}/collections`, {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "Wochenplan", recipeIds: [a.id, b.id, c.id] },
    });
    expect(created.status).toBe(201);
    const collectionId = (await body<CollectionPayload>(created)).collection.id;

    const detail = await body<CollectionDetailPayload>(
      await call(`/api/groups/${groupId}/collections/${collectionId}`, { cookie: owner.cookie }),
    );
    expect(detail.recipes.map((recipe) => recipe.id)).toEqual([a.id, b.id, c.id]);
    expect(detail.collection.recipeCount).toBe(3);

    // reorder = PATCH with the new recipeIds order (one transaction)
    const reordered = await call(`/api/groups/${groupId}/collections/${collectionId}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { recipeIds: [c.id, a.id, b.id] },
    });
    expect(reordered.status).toBe(200);

    const after = await body<CollectionDetailPayload>(
      await call(`/api/groups/${groupId}/collections/${collectionId}`, { cookie: owner.cookie }),
    );
    expect(after.recipes.map((recipe) => recipe.id)).toEqual([c.id, a.id, b.id]);

    const positions = await db
      .select()
      .from(collectionRecipes)
      .where(eq(collectionRecipes.collectionId, collectionId))
      .orderBy(asc(collectionRecipes.position));
    expect(positions.map((row) => row.position)).toEqual([0, 1, 2]);
    expect(positions.map((row) => row.recipeId)).toEqual([c.id, a.id, b.id]);
  });

  test("PUT appends idempotently, DELETE removes, counts stay correct", async () => {
    const { owner, member, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId, { tags: [] });
    const other = await createRecipe(owner, groupId, { title: "Nachtisch", tags: [] });
    const collectionId = (
      await body<CollectionPayload>(
        await call(`/api/groups/${groupId}/collections`, {
          method: "POST",
          cookie: owner.cookie,
          body: { name: "Favoriten" },
        }),
      )
    ).collection.id;

    const path = `/api/groups/${groupId}/collections/${collectionId}/recipes/${recipe.id}`;
    expect((await call(path, { method: "PUT", cookie: member.cookie })).status).toBe(204);
    expect((await call(path, { method: "PUT", cookie: member.cookie })).status).toBe(204);
    expect(
      (
        await call(`/api/groups/${groupId}/collections/${collectionId}/recipes/${other.id}`, {
          method: "PUT",
          cookie: owner.cookie,
        })
      ).status,
    ).toBe(204);

    const list = await body<{ items: Array<{ id: string; recipeCount?: number }> }>(
      await call(`/api/groups/${groupId}/collections`, { cookie: owner.cookie }),
    );
    expect(list.items.find((item) => item.id === collectionId)?.recipeCount).toBe(2);

    const rows = await db
      .select()
      .from(collectionRecipes)
      .where(eq(collectionRecipes.collectionId, collectionId))
      .orderBy(asc(collectionRecipes.position));
    expect(rows.map((row) => row.position)).toEqual([0, 1]);

    expect((await call(path, { method: "DELETE", cookie: member.cookie })).status).toBe(204);
    // removing twice is fine
    expect((await call(path, { method: "DELETE", cookie: member.cookie })).status).toBe(204);

    const detail = await body<CollectionDetailPayload>(
      await call(`/api/groups/${groupId}/collections/${collectionId}`, { cookie: owner.cookie }),
    );
    expect(detail.recipes.map((item) => item.id)).toEqual([other.id]);
  });

  test("recipes and collections of other groups are rejected", async () => {
    const first = await setupGroup();
    const second = await setupGroup();
    const foreign = await createRecipe(second.owner, second.groupId, { tags: [] });

    const response = await call(`/api/groups/${first.groupId}/collections`, {
      method: "POST",
      cookie: first.owner.cookie,
      body: { name: "Fremd", recipeIds: [foreign.id] },
    });
    expect(response.status).toBe(404);

    const collectionId = (
      await body<CollectionPayload>(
        await call(`/api/groups/${first.groupId}/collections`, {
          method: "POST",
          cookie: first.owner.cookie,
          body: { name: "Eigen" },
        }),
      )
    ).collection.id;
    expect(
      (
        await call(
          `/api/groups/${first.groupId}/collections/${collectionId}/recipes/${foreign.id}`,
          { method: "PUT", cookie: first.owner.cookie },
        )
      ).status,
    ).toBe(404);
  });

  test("only the creator or an admin deletes a collection", async () => {
    const { owner, member, groupId } = await setupGroup();
    const mine = (
      await body<CollectionPayload>(
        await call(`/api/groups/${groupId}/collections`, {
          method: "POST",
          cookie: member.cookie,
          body: { name: "Meins" },
        }),
      )
    ).collection.id;
    const theirs = (
      await body<CollectionPayload>(
        await call(`/api/groups/${groupId}/collections`, {
          method: "POST",
          cookie: owner.cookie,
          body: { name: "Ihres" },
        }),
      )
    ).collection.id;

    expect(
      (
        await call(`/api/groups/${groupId}/collections/${theirs}`, {
          method: "DELETE",
          cookie: member.cookie,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`/api/groups/${groupId}/collections/${mine}`, {
          method: "DELETE",
          cookie: member.cookie,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await call(`/api/groups/${groupId}/collections/${theirs}`, {
          method: "DELETE",
          cookie: owner.cookie,
        })
      ).status,
    ).toBe(204);
  });
});

describe("servings scaler", () => {
  test("scales quantities from the stored servings and keeps a Prise a Prise", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId);

    const response = await call(
      `/api/groups/${groupId}/recipes/${recipe.id}/scale?servings=4`,
      { cookie: owner.cookie },
    );
    expect(response.status).toBe(200);
    const scaled = await body<{
      factor: number;
      servingsAmount: number;
      servingsUnit: string | null;
      ingredients: Array<{ name: string; quantity: number | null; quantityMax: number | null; raw: string }>;
    }>(response);

    expect(scaled.factor).toBe(2);
    expect(scaled.servingsAmount).toBe(4);
    expect(scaled.servingsUnit).toBe("Portionen");
    const byName = new Map(scaled.ingredients.map((item) => [item.name, item]));
    expect(byName.get("Zucchini")?.quantity).toBe(1000);
    expect(byName.get("Möhren")?.quantity).toBe(4);
    expect(byName.get("Möhren")?.quantityMax).toBe(6);
    expect(byName.get("Muskatnuss")?.quantity).toBe(1);
    // raw keeps the original amount (provenance)
    expect(byName.get("Zucchini")?.raw).toBe("500 g Zucchini");
  });

  test("a recipe without servings cannot be scaled (422) and servings=0 is rejected", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId, { servingsAmount: null, tags: [] });

    const missing = await call(`/api/groups/${groupId}/recipes/${recipe.id}/scale?servings=4`, {
      cookie: owner.cookie,
    });
    expect(missing.status).toBe(422);
    expect((await body<ErrorPayload>(missing)).error.code).toBe("validation_failed");

    const zero = await call(`/api/groups/${groupId}/recipes/${recipe.id}/scale?servings=0`, {
      cookie: owner.cookie,
    });
    expect(zero.status).toBe(422);
  });
});

describe("recipe image upload", () => {
  const PNG = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );

  test("stores the file under a uuid name and sets imageUrl", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId, { tags: [] });

    const form = new FormData();
    form.append("file", new File([PNG], "handy-foto.png", { type: "image/png" }));
    const response = await app.request(
      `/api/groups/${groupId}/recipes/${recipe.id}/image`,
      { method: "POST", headers: { Cookie: owner.cookie }, body: form },
    );
    expect(response.status).toBe(200);
    const upload = await body<{ url: string; filename: string; mimeType: string; size: number }>(
      response,
    );
    expect(upload.mimeType).toBe("image/png");
    expect(upload.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(upload.filename).not.toContain("handy-foto");
    expect(upload.size).toBe(PNG.byteLength);
    expect(upload.url.endsWith(`/uploads/${upload.filename}`)).toBe(true);

    const detail = (
      await body<RecipeDetailPayload>(
        await call(`/api/groups/${groupId}/recipes/${recipe.id}`, { cookie: owner.cookie }),
      )
    ).recipe;
    expect(detail.imageUrl).toBe(upload.url);

    await unlink(join(env.uploadDir, upload.filename));
  });

  test("rejects a non-image with 415", async () => {
    const { owner, groupId } = await setupGroup();
    const recipe = await createRecipe(owner, groupId, { tags: [] });
    const form = new FormData();
    form.append("file", new File([new TextEncoder().encode("kein Bild")], "notes.txt", {
      type: "image/png",
    }));
    const response = await app.request(
      `/api/groups/${groupId}/recipes/${recipe.id}/image`,
      { method: "POST", headers: { Cookie: owner.cookie }, body: form },
    );
    expect(response.status).toBe(415);
    expect((await body<ErrorPayload>(response)).error.code).toBe("unsupported_media_type");
  });
});
