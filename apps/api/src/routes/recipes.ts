/**
 * OWNER: recipes agent.
 *
 * Mounted at /api/groups/:groupId (see src/index.ts), so the paths declared here
 * are relative: "/recipes", "/recipes/:recipeId", "/tags", "/collections", ...
 *
 * Auth: `requireSession()` + `requireGroupRole("member")` run as router-level
 * middleware for EVERY route below, so no handler ever checks membership itself.
 * The two routes that need more (delete a tag) add `requireGroupRole("admin")`
 * on top; author-or-admin rules for recipes/collections live in the services.
 *
 * Endpoint contract: docs/API.md (sections "Recipes", "Tags", "Collections").
 */
import { zValidator } from "@hono/zod-validator";
import {
  CreateCollectionRequestSchema,
  CreateRecipeRequestSchema,
  CreateTagRequestSchema,
  RecipeListQuerySchema,
  ScaleRecipeQuerySchema,
  UpdateCollectionRequestSchema,
  UpdateRecipeRequestSchema,
  UpdateTagRequestSchema,
} from "@toon/shared";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { created, json, noContent, parseCsvParam } from "../lib/http.ts";
import type { AppEnv } from "../lib/types.ts";
import { requireMembership, requireUser } from "../lib/types.ts";
import { requireGroupRole, requireSession, requireVerifiedEmail } from "../services/groups/access.ts";
import { keepOnlySentKeys, onValidationError } from "../services/groups/validation.ts";
import {
  addRecipeToCollection,
  createCollection,
  deleteCollection,
  getCollectionDetail,
  listCollections,
  removeRecipeFromCollection,
  updateCollection,
} from "../services/recipes/collections.service.ts";
import {
  createRecipe,
  deleteRecipe,
  getRecipeDetail,
  listRecipes,
  scaleRecipe,
  setRecipeImage,
  updateRecipe,
} from "../services/recipes/recipes.service.ts";
import { createTag, deleteTag, listTags, updateTag } from "../services/recipes/tags.service.ts";
import { storeUploadedImage } from "../services/recipes/uploads.ts";

export const recipeRoutes = new Hono<AppEnv>();

// Session + membership for every recipe/tag/collection route of this group.
recipeRoutes.use("*", requireSession());
recipeRoutes.use("*", requireGroupRole("member"));
// ...and a confirmed address for every WRITE among them (GETs pass through, so
// an unconfirmed account still reads the whole group). Mounted once so a route
// added below is gated by default — see middleware/verifiedEmail.ts.
recipeRoutes.use("*", requireVerifiedEmail());

/* -------------------------------------------------------------------------- */
/* recipes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /recipes — search + filter + sort, paginated with `limit`/`offset`
 * (defaults 24/0, `limit` max 100). Returns the lightweight card shape.
 */
recipeRoutes.get(
  "/recipes",
  zValidator("query", RecipeListQuerySchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const query = c.req.valid("query");
    return json(c, await listRecipes(db, membership.groupId, query, parseCsvParam(query.tags)));
  },
);

/** POST /recipes — create with nested ingredients/steps/tag names/collections. */
recipeRoutes.post(
  "/recipes",
  zValidator("json", CreateRecipeRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const user = requireUser(c);
    const recipe = await createRecipe(db, membership.groupId, user.id, c.req.valid("json"));
    return created(c, { recipe }, `/api/groups/${membership.groupId}/recipes/${recipe.id}`);
  },
);

/** GET /recipes/:recipeId — full detail incl. children, tags and author. */
recipeRoutes.get("/recipes/:recipeId", async (c) => {
  const membership = requireMembership(c);
  return json(c, {
    recipe: await getRecipeDetail(db, membership.groupId, c.req.param("recipeId")),
  });
});

/** PATCH /recipes/:recipeId — author or admin; child arrays are replace-all. */
recipeRoutes.patch(
  "/recipes/:recipeId",
  zValidator("json", UpdateRecipeRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    // Absent child arrays must stay untouched — see keepOnlySentKeys().
    const input = keepOnlySentKeys(c.req.valid("json"), await c.req.json(), [
      "ingredients",
      "steps",
      "tags",
      "collectionIds",
    ]);
    const recipe = await updateRecipe(db, membership, c.req.param("recipeId"), input);
    return json(c, { recipe });
  },
);

/** DELETE /recipes/:recipeId — author or admin. */
recipeRoutes.delete("/recipes/:recipeId", async (c) => {
  const membership = requireMembership(c);
  await deleteRecipe(db, membership, c.req.param("recipeId"));
  return noContent(c);
});

/** POST /recipes/:recipeId/image — multipart `file`, max 15 MB, type sniffed. */
recipeRoutes.post("/recipes/:recipeId/image", async (c) => {
  const membership = requireMembership(c);
  const recipeId = c.req.param("recipeId");
  const upload = await storeUploadedImage(await c.req.formData());
  await setRecipeImage(db, membership.groupId, recipeId, upload.url);
  return json(c, upload);
});

/**
 * GET /recipes/:recipeId/scale?servings=n — server-side scaler.
 * The web app ALSO scales locally with `scaleIngredients` from @toon/shared for
 * instant feedback; both use the same pure function, so results are identical.
 */
recipeRoutes.get(
  "/recipes/:recipeId/scale",
  zValidator("query", ScaleRecipeQuerySchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const { servings } = c.req.valid("query");
    return json(
      c,
      await scaleRecipe(db, membership.groupId, c.req.param("recipeId"), servings),
    );
  },
);

/* -------------------------------------------------------------------------- */
/* tags                                                                       */
/* -------------------------------------------------------------------------- */

/** GET /tags — group tags with usage counts. */
recipeRoutes.get("/tags", async (c) => {
  const membership = requireMembership(c);
  return json(c, { items: await listTags(db, membership.groupId) });
});

/** POST /tags */
recipeRoutes.post("/tags", zValidator("json", CreateTagRequestSchema, onValidationError), async (c) => {
  const membership = requireMembership(c);
  const tag = await createTag(db, membership.groupId, c.req.valid("json"));
  return created(c, { tag });
});

/** PATCH /tags/:tagId — rename/recolor. */
recipeRoutes.patch(
  "/tags/:tagId",
  zValidator("json", UpdateTagRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const tag = await updateTag(db, membership.groupId, c.req.param("tagId"), c.req.valid("json"));
    return json(c, { tag });
  },
);

/** DELETE /tags/:tagId — admin+; recipe links cascade. */
recipeRoutes.delete("/tags/:tagId", requireGroupRole("admin"), async (c) => {
  const membership = requireMembership(c);
  await deleteTag(db, membership.groupId, c.req.param("tagId"));
  return noContent(c);
});

/* -------------------------------------------------------------------------- */
/* collections                                                                */
/* -------------------------------------------------------------------------- */

/** GET /collections — with recipe counts. */
recipeRoutes.get("/collections", async (c) => {
  const membership = requireMembership(c);
  return json(c, { items: await listCollections(db, membership.groupId) });
});

/** POST /collections — optionally pre-filled with recipeIds (array order). */
recipeRoutes.post(
  "/collections",
  zValidator("json", CreateCollectionRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const user = requireUser(c);
    const collection = await createCollection(
      db,
      membership.groupId,
      user.id,
      c.req.valid("json"),
    );
    return created(c, { collection });
  },
);

/** GET /collections/:collectionId — collection + recipes in `position` order. */
recipeRoutes.get("/collections/:collectionId", async (c) => {
  const membership = requireMembership(c);
  return json(c, await getCollectionDetail(db, membership.groupId, c.req.param("collectionId")));
});

/**
 * PATCH /collections/:collectionId — metadata and/or `recipeIds`.
 * Passing `recipeIds` replaces the membership and renumbers positions 0..n-1 in
 * one transaction, which is how the UI reorders a collection.
 */
recipeRoutes.patch(
  "/collections/:collectionId",
  zValidator("json", UpdateCollectionRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    // `recipeIds` only replaces the membership when it was actually sent.
    const input = keepOnlySentKeys(c.req.valid("json"), await c.req.json(), ["recipeIds"]);
    const collection = await updateCollection(
      db,
      membership.groupId,
      c.req.param("collectionId"),
      input,
    );
    return json(c, { collection });
  },
);

/** DELETE /collections/:collectionId — creator or admin. */
recipeRoutes.delete("/collections/:collectionId", async (c) => {
  const membership = requireMembership(c);
  await deleteCollection(db, membership, c.req.param("collectionId"));
  return noContent(c);
});

/** PUT /collections/:collectionId/recipes/:recipeId — append (idempotent). */
recipeRoutes.put("/collections/:collectionId/recipes/:recipeId", async (c) => {
  const membership = requireMembership(c);
  await addRecipeToCollection(
    db,
    membership.groupId,
    c.req.param("collectionId"),
    c.req.param("recipeId"),
  );
  return noContent(c);
});

/** DELETE /collections/:collectionId/recipes/:recipeId — remove (idempotent). */
recipeRoutes.delete("/collections/:collectionId/recipes/:recipeId", async (c) => {
  const membership = requireMembership(c);
  await removeRecipeFromCollection(
    db,
    membership.groupId,
    c.req.param("collectionId"),
    c.req.param("recipeId"),
  );
  return noContent(c);
});

export default recipeRoutes;
