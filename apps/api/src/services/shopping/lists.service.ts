/**
 * Shopping lists ("Einkaufslisten"): CRUD plus the one payload the detail screen and
 * every mutation return.
 *
 * A list belongs to a GROUP (locked decision 1), so every flatmate sees and edits the
 * same lines. Names are unique per group, case-insensitively and German-folded, the
 * same rule tags use.
 */
import {
  SHOPPING_LIMITS,
  nameKey,
  type CreateShoppingListRequest,
  type ShoppingList,
  type ShoppingListDetailResponse,
  type UpdateShoppingListRequest,
} from "@toon/shared";
import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import {
  recipes,
  shoppingListCatalog,
  shoppingListItems,
  shoppingLists,
} from "../../db/schema.ts";
import type { ShoppingListRow } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import type { Membership } from "../../lib/types.ts";
import { assertRole } from "../groups/membership.ts";
import { type DbLike, eqFolded, foldText, nowMs } from "../groups/support.ts";
import { toShoppingCatalogEntry, toShoppingItem, toShoppingList } from "./mappers.ts";

/** All lists of a group with their open-item counts — ONE grouped query. */
export async function listShoppingLists(db: DbLike, groupId: string): Promise<ShoppingList[]> {
  const rows = await db
    .select({ list: shoppingLists, itemCount: count(shoppingListItems.id) })
    .from(shoppingLists)
    .leftJoin(shoppingListItems, eq(shoppingListItems.listId, shoppingLists.id))
    .where(eq(shoppingLists.groupId, groupId))
    .groupBy(shoppingLists.id)
    .orderBy(asc(shoppingLists.name));
  return rows.map((row) => toShoppingList(row.list, Number(row.itemCount)));
}

/** The raw list row inside the group, or a 404 that never leaks other groups. */
export async function loadShoppingListRow(
  db: DbLike,
  groupId: string,
  listId: string,
): Promise<ShoppingListRow> {
  const [row] = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, listId), eq(shoppingLists.groupId, groupId)))
    .limit(1);
  if (!row) throw ApiError.notFound("server.shopping.listNotFound");
  return row;
}

/** Rejects a name already used in this group (folded), as 409. */
async function assertNameFree(
  db: DbLike,
  groupId: string,
  name: string,
  exceptListId?: string,
): Promise<void> {
  const conditions = [eq(shoppingLists.groupId, groupId), eqFolded(shoppingLists.name, name)];
  if (exceptListId) conditions.push(ne(shoppingLists.id, exceptListId));
  const clash = await db
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(and(...conditions))
    .limit(1);
  if (clash.length > 0) {
    throw ApiError.conflict("shopping_list_name_taken", "server.shopping.listNameTaken");
  }
}

export async function createShoppingList(
  db: DbLike,
  groupId: string,
  userId: string,
  input: CreateShoppingListRequest,
): Promise<ShoppingList> {
  const [existing] = await db
    .select({ value: count() })
    .from(shoppingLists)
    .where(eq(shoppingLists.groupId, groupId));
  if (Number(existing?.value ?? 0) >= SHOPPING_LIMITS.listsPerGroup) {
    throw ApiError.conflict("too_many_shopping_lists", {
      key: "server.shopping.tooManyLists",
      values: { max: SHOPPING_LIMITS.listsPerGroup },
    });
  }
  await assertNameFree(db, groupId, input.name);

  const row: ShoppingListRow = {
    id: crypto.randomUUID(),
    groupId,
    name: input.name,
    createdBy: userId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await db.insert(shoppingLists).values(row);
  return toShoppingList(row, 0);
}

/** Renames a list. Any member may rename — the list is shared property. */
export async function updateShoppingList(
  db: DbLike,
  groupId: string,
  listId: string,
  input: UpdateShoppingListRequest,
): Promise<ShoppingList> {
  const row = await loadShoppingListRow(db, groupId, listId);
  if (foldText(input.name) !== foldText(row.name)) {
    await assertNameFree(db, groupId, input.name, listId);
  }

  const patch = { name: input.name, updatedAt: nowMs() };
  await db.update(shoppingLists).set(patch).where(eq(shoppingLists.id, listId));
  return toShoppingList({ ...row, ...patch }, await countListItems(db, listId));
}

/**
 * Deletes a list; items, catalog and ledger entries cascade.
 * Creator or admin+, matching collections — a shared list is not something one member
 * should be able to throw away on everyone else's behalf.
 */
export async function deleteShoppingList(
  db: DbLike,
  membership: Membership,
  listId: string,
): Promise<void> {
  const row = await loadShoppingListRow(db, membership.groupId, listId);
  if (row.createdBy !== membership.userId) assertRole(membership, "admin");
  await db.delete(shoppingLists).where(eq(shoppingLists.id, listId));
}

/** Number of open lines on a list. */
export async function countListItems(db: DbLike, listId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId));
  return Number(row?.value ?? 0);
}

/* -------------------------------------------------------------------------- */
/* the detail payload                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The whole screen in one response: list, open items in `position` order, and the
 * "Häufig gekauft" suggestions.
 *
 * EVERY mutating endpoint returns this too. That is deliberate: the web client
 * replaces its cache entry wholesale instead of patching it, so an optimistic offline
 * edit is corrected by the next server answer and cannot drift.
 *
 * Suggestions EXCLUDE anything currently on the list — offering "Milch" while Milch is
 * two rows above is noise, and tapping it would just merge into the existing line.
 */
export async function getShoppingListDetail(
  db: DbLike,
  groupId: string,
  listId: string,
): Promise<ShoppingListDetailResponse> {
  const row = await loadShoppingListRow(db, groupId, listId);

  const itemRows = await db
    .select()
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .orderBy(asc(shoppingListItems.position), asc(shoppingListItems.createdAt));

  // Resolve provenance titles in ONE query, restricted to the group so an id from
  // somewhere else could never surface a foreign recipe title.
  const sourceIds = [
    ...new Set(itemRows.flatMap((item) => (Array.isArray(item.sourceRecipeIds) ? item.sourceRecipeIds : []))),
  ];
  const titles = new Map<string, string>();
  if (sourceIds.length > 0) {
    const recipeRows = await db
      .select({ id: recipes.id, title: recipes.title })
      .from(recipes)
      .where(and(eq(recipes.groupId, groupId), inArray(recipes.id, sourceIds)));
    for (const recipe of recipeRows) titles.set(recipe.id, recipe.title);
  }

  // Compare on the NAME key, not the merge key: "Milch" already on the list in litres
  // must also hide the suggestion, even though the units differ.
  const onList = new Set(itemRows.map((item) => nameKey(item.name)));
  const catalogRows = await db
    .select()
    .from(shoppingListCatalog)
    .where(eq(shoppingListCatalog.listId, listId))
    .orderBy(desc(shoppingListCatalog.useCount), desc(shoppingListCatalog.lastUsedAt))
    // Over-fetch, because the filter below removes an unknown number of rows.
    .limit(SHOPPING_LIMITS.catalogSuggestions * 3);

  return {
    list: toShoppingList(row, itemRows.length),
    items: itemRows.map((item) => toShoppingItem(item, titles)),
    catalog: catalogRows
      .filter((entry) => !onList.has(entry.nameKey))
      .slice(0, SHOPPING_LIMITS.catalogSuggestions)
      .map(toShoppingCatalogEntry),
  };
}
