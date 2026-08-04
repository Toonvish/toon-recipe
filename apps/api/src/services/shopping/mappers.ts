/**
 * Row -> contract mappers for shopping lists, items and catalog entries.
 */
import type {
  ShoppingCatalogEntry,
  ShoppingItem,
  ShoppingItemSource,
  ShoppingList,
} from "@toon/shared";
import type {
  ShoppingListCatalogRow,
  ShoppingListItemRow,
  ShoppingListRow,
} from "../../db/schema.ts";
import { toIso } from "../../lib/http.ts";

export function toShoppingList(row: ShoppingListRow, itemCount?: number): ShoppingList {
  const list: ShoppingList = {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
  return itemCount === undefined ? list : { ...list, itemCount };
}

/**
 * `titles` maps recipe id -> title for the recipes still present in the group.
 *
 * An id with no entry is kept in `sourceRecipeIds` but omitted from `sources`: the
 * provenance is still true ("this came from a recipe") while the UI has nothing to
 * link to. That is why the column is not a FK — a deleted recipe must not take the
 * shopping item with it.
 */
export function toShoppingItem(
  row: ShoppingListItemRow,
  titles: ReadonlyMap<string, string>,
): ShoppingItem {
  const sourceRecipeIds = Array.isArray(row.sourceRecipeIds) ? row.sourceRecipeIds : [];
  const sources: ShoppingItemSource[] = [];
  for (const id of sourceRecipeIds) {
    const title = titles.get(id);
    if (title !== undefined) sources.push({ id, title });
  }
  return {
    id: row.id,
    listId: row.listId,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    note: row.note,
    position: row.position,
    sourceRecipeIds,
    sources,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toShoppingCatalogEntry(row: ShoppingListCatalogRow): ShoppingCatalogEntry {
  return {
    id: row.id,
    listId: row.listId,
    name: row.name,
    unit: row.unit,
    useCount: row.useCount,
    lastUsedAt: toIso(row.lastUsedAt),
  };
}
