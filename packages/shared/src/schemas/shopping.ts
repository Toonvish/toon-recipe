/**
 * Shopping lists ("Einkaufslisten") — wire contract.
 *
 * Shape notes that the rest of the app depends on:
 *
 *  - A list belongs to a GROUP, like every other piece of content. Several named
 *    lists per group are supported ("Rewe", "Drogerie").
 *  - Checking an item off DELETES it and bumps a catalog entry instead of setting a
 *    flag, which is why there is no `checked` field anywhere. The catalog is the
 *    "Häufig gekauft" row (see `ShoppingCatalogEntry`).
 *  - Every mutating request may carry a client-generated `mutationId`. The API
 *    remembers applied ids per list, so a mutation replayed after an offline spell
 *    cannot add the same ingredients twice. See services/shopping/idempotency.ts.
 */
import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.ts";

/** Upper bounds, mirrored by the UI so a phone never sends a doomed request. */
export const SHOPPING_LIMITS = {
  listsPerGroup: 30,
  itemsPerList: 500,
  itemsPerRequest: 200,
  catalogPerList: 200,
  /** How many "Häufig gekauft" suggestions a list detail returns. */
  catalogSuggestions: 24,
} as const;

/**
 * Idempotency token for a mutation the client may have to replay.
 * A uuid so it cannot collide across devices.
 */
export const MutationIdSchema = z.uuid();

/* --------------------------------- entities ------------------------------- */

export const ShoppingListSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  name: z.string(),
  createdBy: IdSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  /** Present in listings and after a mutation. */
  itemCount: z.number().int().nonnegative().optional(),
});
export type ShoppingList = z.infer<typeof ShoppingListSchema>;

/** A recipe that contributed to an item, resolved for display. */
export const ShoppingItemSourceSchema = z.object({
  id: IdSchema,
  title: z.string(),
});
export type ShoppingItemSource = z.infer<typeof ShoppingItemSourceSchema>;

export const ShoppingItemSchema = z.object({
  id: IdSchema,
  listId: IdSchema,
  name: z.string(),
  /** null means "no amount given" — never render it as 0. */
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
  position: z.number().int().nonnegative(),
  /**
   * Recipes this line was merged from. Ids whose recipe was deleted are kept here but
   * absent from `sources`, so provenance survives a deletion without a dangling link.
   */
  sourceRecipeIds: z.array(IdSchema),
  sources: z.array(ShoppingItemSourceSchema),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type ShoppingItem = z.infer<typeof ShoppingItemSchema>;

/**
 * One "Häufig gekauft" entry: something that has been on this list before.
 * `useCount` counts CHECK-OFFS, not adds — it ranks what actually gets bought.
 */
export const ShoppingCatalogEntrySchema = z.object({
  id: IdSchema,
  listId: IdSchema,
  name: z.string(),
  unit: z.string().nullable(),
  useCount: z.number().int().nonnegative(),
  lastUsedAt: IsoDateSchema,
});
export type ShoppingCatalogEntry = z.infer<typeof ShoppingCatalogEntrySchema>;

/* --------------------------------- requests ------------------------------- */

export const CreateShoppingListRequestSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
});
export type CreateShoppingListRequest = z.infer<typeof CreateShoppingListRequestSchema>;

export const UpdateShoppingListRequestSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
});
export type UpdateShoppingListRequest = z.infer<typeof UpdateShoppingListRequestSchema>;

/**
 * One line to add. The client parses free text with `parseIngredientLine` from
 * @toon/shared before sending, so "500g Mehl" arrives as
 * `{ name: "Mehl", quantity: 500, unit: "g" }`.
 */
export const ShoppingItemInputSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(300),
  quantity: z.number().nonnegative().max(1_000_000).nullish(),
  unit: z.string().trim().max(40).nullish(),
  note: z.string().trim().max(300).nullish(),
});
export type ShoppingItemInput = z.infer<typeof ShoppingItemInputSchema>;

export const AddShoppingItemsRequestSchema = z.object({
  items: z.array(ShoppingItemInputSchema).min(1).max(SHOPPING_LIMITS.itemsPerRequest),
  mutationId: MutationIdSchema.optional(),
});
export type AddShoppingItemsRequest = z.infer<typeof AddShoppingItemsRequestSchema>;

/**
 * Edit one line. Absent keys stay untouched; an explicit `null` clears the field.
 * Changing `name`/`unit` can move the line into another item's merge bucket — the
 * API then folds them together, so the response may contain FEWER items than before.
 */
export const UpdateShoppingItemRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    quantity: z.number().nonnegative().max(1_000_000).nullish(),
    unit: z.string().trim().max(40).nullish(),
    note: z.string().trim().max(300).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "Keine Änderungen übergeben");
export type UpdateShoppingItemRequest = z.infer<typeof UpdateShoppingItemRequestSchema>;

/**
 * Put a recipe on the list, scaled to `servings`.
 *
 * `servings` is the TARGET portion count. Omit it to use the recipe's own
 * `servingsAmount` (factor 1). The API scales with the same `scaleIngredients` the
 * detail screen uses, so the amounts on the list match what the cook saw.
 */
export const AddRecipeToShoppingListRequestSchema = z.object({
  recipeId: IdSchema,
  servings: z.number().positive().max(1000).optional(),
  mutationId: MutationIdSchema.optional(),
});
export type AddRecipeToShoppingListRequest = z.infer<
  typeof AddRecipeToShoppingListRequestSchema
>;

/** Check off one item: it leaves the list and lands in "Häufig gekauft". */
export const CheckShoppingItemRequestSchema = z.object({
  mutationId: MutationIdSchema.optional(),
});
export type CheckShoppingItemRequest = z.infer<typeof CheckShoppingItemRequestSchema>;

/* -------------------------------- responses ------------------------------- */

export const ShoppingListResponseSchema = z.object({ list: ShoppingListSchema });
export type ShoppingListResponse = z.infer<typeof ShoppingListResponseSchema>;

export const ShoppingListListResponseSchema = z.object({
  items: z.array(ShoppingListSchema),
});
export type ShoppingListListResponse = z.infer<typeof ShoppingListListResponseSchema>;

/**
 * The whole screen in one payload: the list, its open items in `position` order and
 * the suggestions. Every mutation returns this shape too, so the client can replace
 * its cache entry instead of patching it — which is what keeps an offline replay from
 * drifting from the server.
 */
export const ShoppingListDetailResponseSchema = z.object({
  list: ShoppingListSchema,
  items: z.array(ShoppingItemSchema),
  catalog: z.array(ShoppingCatalogEntrySchema),
});
export type ShoppingListDetailResponse = z.infer<typeof ShoppingListDetailResponseSchema>;
