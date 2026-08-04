/**
 * Shopping lists ("Einkaufslisten").
 *
 * Mounted at /api/groups/:groupId/shopping-lists (see src/index.ts), BEFORE the
 * catch-all recipes router — same reason imports is mounted before it.
 *
 * Auth: `requireSession()` + `requireGroupRole("member")` as router-level middleware,
 * so no handler checks membership itself. `requireGroupRole` resolves the group from
 * `:groupId`, which every path here carries. Deleting a whole list additionally
 * requires creator-or-admin, enforced in the service.
 *
 * ## Every mutation answers with the WHOLE list
 *
 * Not with the changed item. The web client replaces its cache entry with the payload
 * instead of patching it, which is what keeps an optimistic offline edit from drifting
 * away from the server — and merging means one added line can change a different one.
 *
 * Endpoint contract: docs/API.md ("Shopping lists").
 */
import { zValidator } from "@hono/zod-validator";
import {
  AddRecipeToShoppingListRequestSchema,
  AddShoppingItemsRequestSchema,
  CheckShoppingItemRequestSchema,
  CreateShoppingListRequestSchema,
  UpdateShoppingItemRequestSchema,
  UpdateShoppingListRequestSchema,
} from "@toon/shared";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { created, json, noContent } from "../lib/http.ts";
import type { AppEnv } from "../lib/types.ts";
import { requireMembership, requireUser } from "../lib/types.ts";
import { requireGroupRole, requireSession } from "../services/groups/access.ts";
import { onValidationError } from "../services/groups/validation.ts";
import {
  addCatalogEntryToList,
  addRecipeToShoppingList,
  addShoppingItems,
  checkShoppingItem,
  clearShoppingList,
  deleteCatalogEntry,
  deleteShoppingItem,
  updateShoppingItem,
} from "../services/shopping/items.service.ts";
import {
  createShoppingList,
  deleteShoppingList,
  getShoppingListDetail,
  listShoppingLists,
  updateShoppingList,
} from "../services/shopping/lists.service.ts";

export const shoppingRoutes = new Hono<AppEnv>();

shoppingRoutes.use("*", requireSession());
shoppingRoutes.use("*", requireGroupRole("member"));

/* -------------------------------------------------------------------------- */
/* lists                                                                      */
/* -------------------------------------------------------------------------- */

/** GET / — all lists of the group with their open-item counts. */
shoppingRoutes.get("/", async (c) => {
  const membership = requireMembership(c);
  return json(c, { items: await listShoppingLists(db, membership.groupId) });
});

/** POST / — create a named list. */
shoppingRoutes.post(
  "/",
  zValidator("json", CreateShoppingListRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const user = requireUser(c);
    const list = await createShoppingList(db, membership.groupId, user.id, c.req.valid("json"));
    return created(
      c,
      { list },
      `/api/groups/${membership.groupId}/shopping-lists/${list.id}`,
    );
  },
);

/** GET /:listId — list + open items + "Häufig gekauft" suggestions. */
shoppingRoutes.get("/:listId", async (c) => {
  const membership = requireMembership(c);
  return json(c, await getShoppingListDetail(db, membership.groupId, c.req.param("listId")));
});

/** PATCH /:listId — rename. Any member: the list is shared property. */
shoppingRoutes.patch(
  "/:listId",
  zValidator("json", UpdateShoppingListRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const list = await updateShoppingList(
      db,
      membership.groupId,
      c.req.param("listId"),
      c.req.valid("json"),
    );
    return json(c, { list });
  },
);

/** DELETE /:listId — creator or admin+; items, catalog and ledger cascade. */
shoppingRoutes.delete("/:listId", async (c) => {
  const membership = requireMembership(c);
  await deleteShoppingList(db, membership, c.req.param("listId"));
  return noContent(c);
});

/* -------------------------------------------------------------------------- */
/* items                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * POST /:listId/items — add hand-entered lines. Merges into existing lines by name +
 * unit, so posting "200 g Mehl" onto a list that already has 200 g yields one 400 g
 * line. Pass `mutationId` to make an offline replay safe.
 */
shoppingRoutes.post(
  "/:listId/items",
  zValidator("json", AddShoppingItemsRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    return json(
      c,
      await addShoppingItems(db, membership.groupId, c.req.param("listId"), c.req.valid("json")),
    );
  },
);

/** DELETE /:listId/items — empty the list. Nothing counts as bought. */
shoppingRoutes.delete("/:listId/items", async (c) => {
  const membership = requireMembership(c);
  return json(c, await clearShoppingList(db, membership.groupId, c.req.param("listId")));
});

/** PATCH /:listId/items/:itemId — edit amount/unit/name/note. */
shoppingRoutes.patch(
  "/:listId/items/:itemId",
  zValidator("json", UpdateShoppingItemRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    return json(
      c,
      await updateShoppingItem(
        db,
        membership.groupId,
        c.req.param("listId"),
        c.req.param("itemId"),
        c.req.valid("json"),
      ),
    );
  },
);

/** DELETE /:listId/items/:itemId — remove without counting it as bought. Idempotent. */
shoppingRoutes.delete("/:listId/items/:itemId", async (c) => {
  const membership = requireMembership(c);
  return json(
    c,
    await deleteShoppingItem(
      db,
      membership.groupId,
      c.req.param("listId"),
      c.req.param("itemId"),
    ),
  );
});

/**
 * POST /:listId/items/:itemId/check — check off.
 *
 * The item leaves the list and its "Häufig gekauft" entry is bumped. Idempotent by
 * construction (a checked item is gone), so a replay is harmless even without a
 * `mutationId`. The body is optional so the client can send `{}`.
 */
shoppingRoutes.post(
  "/:listId/items/:itemId/check",
  zValidator("json", CheckShoppingItemRequestSchema.optional(), onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    return json(
      c,
      await checkShoppingItem(
        db,
        membership.groupId,
        c.req.param("listId"),
        c.req.param("itemId"),
        c.req.valid("json")?.mutationId,
      ),
    );
  },
);

/* -------------------------------------------------------------------------- */
/* recipes -> list                                                            */
/* -------------------------------------------------------------------------- */

/**
 * POST /:listId/recipes — put a recipe on the list, scaled to `servings`.
 *
 * Scaling uses the same `scaleIngredients` as the recipe screen, so the amounts match
 * what the cook saw. Omit `servings` to take the recipe's own portion count.
 */
shoppingRoutes.post(
  "/:listId/recipes",
  zValidator("json", AddRecipeToShoppingListRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    return json(
      c,
      await addRecipeToShoppingList(
        db,
        membership.groupId,
        c.req.param("listId"),
        c.req.valid("json"),
      ),
    );
  },
);

/* -------------------------------------------------------------------------- */
/* "Häufig gekauft"                                                           */
/* -------------------------------------------------------------------------- */

/** POST /:listId/catalog/:entryId — re-add a suggestion, without an amount. */
shoppingRoutes.post(
  "/:listId/catalog/:entryId",
  zValidator("json", CheckShoppingItemRequestSchema.optional(), onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    return json(
      c,
      await addCatalogEntryToList(
        db,
        membership.groupId,
        c.req.param("listId"),
        c.req.param("entryId"),
        c.req.valid("json")?.mutationId,
      ),
    );
  },
);

/** DELETE /:listId/catalog/:entryId — "nicht mehr vorschlagen". Idempotent. */
shoppingRoutes.delete("/:listId/catalog/:entryId", async (c) => {
  const membership = requireMembership(c);
  await deleteCatalogEntry(
    db,
    membership.groupId,
    c.req.param("listId"),
    c.req.param("entryId"),
  );
  return noContent(c);
});

export default shoppingRoutes;
