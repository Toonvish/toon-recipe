/**
 * Shopping-list items: add (with merging), edit, remove, check off, clear — plus
 * "put this recipe on the list, scaled to N portions".
 *
 * ## Merging is the whole story
 *
 * Adding never blindly inserts. Every incoming line is folded against what is already
 * on the list by `shoppingItemKey` from @toon/shared, so "200 g Mehl" twice becomes
 * one "400 g Mehl" line. The read-modify-write runs inside `withTransaction`, and the
 * UNIQUE index on `(list_id, merge_key)` is the backstop if two members ever race.
 *
 * ## Checking off is a DELETE, not a flag
 *
 * `checkShoppingItem` removes the row and bumps a `shopping_list_catalog` entry. The
 * item leaves the list and reappears under "Häufig gekauft", which is the Bring
 * behaviour the UI mimics. There is deliberately no `checked` column: a flag would
 * need a second "clear done" action, and the completed line would keep taking space in
 * a list you are reading one-handed in a supermarket.
 *
 * ## Everything returns the whole list
 *
 * Every function here answers with `getShoppingListDetail`. The web client replaces
 * its cache entry with that payload instead of patching it, which is what stops an
 * optimistic offline edit from drifting away from the server's version.
 */
import {
  SHOPPING_LIMITS,
  addAmounts,
  ingredientToShoppingItem,
  mergeNotes,
  mergeSourceIds,
  nameKey,
  normalizeUnit,
  recipeToShoppingItems,
  scaleIngredients,
  shoppingItemKey,
  type AddRecipeToShoppingListRequest,
  type AddShoppingItemsRequest,
  type ShoppingDraftItem,
  type ShoppingListDetailResponse,
  type UpdateShoppingItemRequest,
} from "@toon/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  recipeIngredients,
  shoppingListCatalog,
  shoppingListItems,
  shoppingLists,
} from "../../db/schema.ts";
import type { ShoppingListItemRow } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { type DbLike, nowMs, withTransaction } from "../groups/support.ts";
import { toIngredientRecord } from "../recipes/mappers.ts";
import { loadRecipeRow } from "../recipes/recipes.service.ts";
import { claimMutation, pruneMutationLedger } from "./idempotency.ts";
import { getShoppingListDetail, loadShoppingListRow } from "./lists.service.ts";

/* -------------------------------------------------------------------------- */
/* the merge engine                                                           */
/* -------------------------------------------------------------------------- */

/** Normalises an incoming line into the shape the merge works on. */
function toDraft(input: {
  name: string;
  quantity?: number | null | undefined;
  unit?: string | null | undefined;
  note?: string | null | undefined;
  sourceRecipeIds?: string[];
}): ShoppingDraftItem {
  const unit = input.unit?.trim();
  return {
    name: input.name.trim().slice(0, 300),
    quantity: typeof input.quantity === "number" ? input.quantity : null,
    unit: unit && unit.length > 0 ? normalizeUnit(unit) : null,
    note: input.note?.trim() ? input.note.trim().slice(0, 300) : null,
    sourceRecipeIds: input.sourceRecipeIds ?? [],
  };
}

/** Existing rows keyed by their merge key. */
async function loadItemsByKey(
  db: DbLike,
  listId: string,
): Promise<Map<string, ShoppingListItemRow>> {
  const rows = await db
    .select()
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .orderBy(asc(shoppingListItems.position));
  return new Map(rows.map((row) => [row.mergeKey, row]));
}

/** Highest position currently in use, or -1 for an empty list. */
async function maxPosition(db: DbLike, listId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number | null>`max(${shoppingListItems.position})` })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId));
  return Number(row?.value ?? -1);
}

/**
 * Folds `additions` into the list: merged into an existing row where the key matches,
 * appended at the end otherwise. Must run inside a transaction.
 *
 * Also records every added NAME in the catalog with `useCount` untouched, so a
 * hand-typed item becomes a suggestion for next time without pretending it was ever
 * bought — only {@link checkShoppingItem} increments the count.
 */
async function applyAdditions(
  tx: DbLike,
  listId: string,
  additions: readonly ShoppingDraftItem[],
): Promise<void> {
  if (additions.length === 0) return;

  const existing = await loadItemsByKey(tx, listId);
  let position = await maxPosition(tx, listId);
  const timestamp = nowMs();

  for (const addition of additions) {
    if (addition.name.length === 0) continue;
    const key = shoppingItemKey(addition.name, addition.unit);
    const current = existing.get(key);

    if (current) {
      const summed = addAmounts(
        { quantity: current.quantity, unit: current.unit },
        { quantity: addition.quantity, unit: addition.unit },
      );
      const merged: ShoppingListItemRow = {
        ...current,
        // A same-key pair is always addable (the key contains the unit bucket); if it
        // somehow is not, keep the amount already on the list rather than lose it.
        quantity: summed ? summed.quantity : current.quantity,
        unit: summed ? summed.unit : current.unit,
        note: mergeNotes(current.note, addition.note),
        sourceRecipeIds: mergeSourceIds(
          Array.isArray(current.sourceRecipeIds) ? current.sourceRecipeIds : [],
          addition.sourceRecipeIds,
        ),
        updatedAt: timestamp,
      };
      await tx
        .update(shoppingListItems)
        .set({
          quantity: merged.quantity,
          unit: merged.unit,
          note: merged.note,
          sourceRecipeIds: merged.sourceRecipeIds,
          updatedAt: timestamp,
        })
        .where(eq(shoppingListItems.id, current.id));
      existing.set(key, merged);
    } else {
      if (existing.size >= SHOPPING_LIMITS.itemsPerList) {
        throw ApiError.conflict(
          "shopping_list_full",
          `Diese Einkaufsliste ist voll (max. ${SHOPPING_LIMITS.itemsPerList} Positionen)`,
        );
      }
      position += 1;
      const row: ShoppingListItemRow = {
        id: crypto.randomUUID(),
        listId,
        name: addition.name,
        mergeKey: key,
        quantity: addition.quantity,
        unit: addition.unit,
        note: addition.note,
        position,
        sourceRecipeIds: addition.sourceRecipeIds,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await tx.insert(shoppingListItems).values(row);
      existing.set(key, row);
    }

    await touchCatalog(tx, listId, addition.name, addition.unit, { bought: false });
  }

  await tx
    .update(shoppingLists)
    .set({ updatedAt: timestamp })
    .where(eq(shoppingLists.id, listId));
}

/* -------------------------------------------------------------------------- */
/* "Häufig gekauft"                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Upserts a catalog entry.
 *
 * `bought: true` (a check-off) increments `useCount`, which is what ranks the
 * suggestions. `bought: false` (a plain add) only refreshes `lastUsedAt` and the
 * remembered unit, so typing something and deleting it again never inflates the
 * ranking.
 */
async function touchCatalog(
  tx: DbLike,
  listId: string,
  name: string,
  unit: string | null,
  options: { bought: boolean },
): Promise<void> {
  const trimmed = name.trim().slice(0, 300);
  if (trimmed.length === 0) return;
  const key = nameKey(trimmed);
  if (key.length === 0) return;
  const timestamp = nowMs();

  await tx
    .insert(shoppingListCatalog)
    .values({
      id: crypto.randomUUID(),
      listId,
      name: trimmed,
      nameKey: key,
      unit,
      useCount: options.bought ? 1 : 0,
      lastUsedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [shoppingListCatalog.listId, shoppingListCatalog.nameKey],
      set: {
        // Keep the spelling the group last used, so "Möhren" does not turn into "mohren".
        name: trimmed,
        unit,
        lastUsedAt: timestamp,
        useCount: options.bought
          ? sql`${shoppingListCatalog.useCount} + 1`
          : sql`${shoppingListCatalog.useCount}`,
      },
    });

  await pruneCatalog(tx, listId);
}

/**
 * Caps the catalog per list, dropping the least useful entries (lowest use count,
 * then oldest). Without this, a group that types a lot would grow an unbounded table
 * whose only consumer shows 24 rows.
 */
async function pruneCatalog(tx: DbLike, listId: string): Promise<void> {
  const rows = await tx
    .select({ id: shoppingListCatalog.id })
    .from(shoppingListCatalog)
    .where(eq(shoppingListCatalog.listId, listId))
    .orderBy(asc(shoppingListCatalog.useCount), asc(shoppingListCatalog.lastUsedAt));
  const excess = rows.length - SHOPPING_LIMITS.catalogPerList;
  if (excess <= 0) return;
  for (const row of rows.slice(0, excess)) {
    await tx.delete(shoppingListCatalog).where(eq(shoppingListCatalog.id, row.id));
  }
}

/** Removes one suggestion ("nicht mehr vorschlagen"). Idempotent. */
export async function deleteCatalogEntry(
  db: DbLike,
  groupId: string,
  listId: string,
  entryId: string,
): Promise<void> {
  await loadShoppingListRow(db, groupId, listId);
  await db
    .delete(shoppingListCatalog)
    .where(and(eq(shoppingListCatalog.id, entryId), eq(shoppingListCatalog.listId, listId)));
}

/* -------------------------------------------------------------------------- */
/* public operations                                                          */
/* -------------------------------------------------------------------------- */

/** Adds one or more hand-entered lines, merging into what is already there. */
export async function addShoppingItems(
  db: Database,
  groupId: string,
  listId: string,
  input: AddShoppingItemsRequest,
): Promise<ShoppingListDetailResponse> {
  await loadShoppingListRow(db, groupId, listId);

  await withTransaction(db, async (tx) => {
    if (!(await claimMutation(tx, listId, input.mutationId))) return;
    await applyAdditions(tx, listId, input.items.map((item) => toDraft(item)));
  });
  await pruneMutationLedger(db);

  return getShoppingListDetail(db, groupId, listId);
}

/**
 * Puts a recipe's ingredients on the list, scaled to `servings`.
 *
 * Scaling uses the SAME `scaleIngredients` as `GET /recipes/:id/scale` and the detail
 * screen, with `keepNonScalingUnits` so a Prise stays a Prise. The recipe id is
 * recorded on every resulting line, so the list can show where "400 g Mehl" came from
 * even after the lines merged.
 *
 * A recipe with no `servingsAmount` cannot be scaled — there is nothing to scale FROM.
 * `servings` is then ignored rather than guessed at, and the amounts land as written.
 *
 * `input.ingredientIds` selects a subset. Filtering happens BEFORE scaling, so the
 * factor is unaffected by what was deselected. An id that no longer belongs to this
 * recipe is ignored, and a selection that matches nothing is a no-op rather than an
 * error — a queued offline request must not fail because the recipe changed meanwhile.
 */
export async function addRecipeToShoppingList(
  db: Database,
  groupId: string,
  listId: string,
  input: AddRecipeToShoppingListRequest,
): Promise<ShoppingListDetailResponse> {
  await loadShoppingListRow(db, groupId, listId);
  const recipe = await loadRecipeRow(db, groupId, input.recipeId);
  const ingredientRows = await db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipe.id))
    .orderBy(asc(recipeIngredients.position));
  const selected = input.ingredientIds === undefined ? undefined : new Set(input.ingredientIds);
  const ingredients = ingredientRows
    .filter((row) => selected === undefined || selected.has(row.id))
    .map(toIngredientRecord);

  const base = recipe.servingsAmount;
  const target = input.servings;
  const factor =
    typeof base === "number" && base > 0 && typeof target === "number" && target > 0
      ? target / base
      : 1;

  const scaled =
    factor === 1
      ? ingredients
      : scaleIngredients(ingredients, factor, { keepNonScalingUnits: true });
  const additions = recipeToShoppingItems(scaled, recipe.id);

  await withTransaction(db, async (tx) => {
    if (!(await claimMutation(tx, listId, input.mutationId))) return;
    await applyAdditions(tx, listId, additions);
  });
  await pruneMutationLedger(db);

  return getShoppingListDetail(db, groupId, listId);
}

/** The raw item row on this list, or a 404. */
async function loadItemRow(
  db: DbLike,
  listId: string,
  itemId: string,
): Promise<ShoppingListItemRow> {
  const [row] = await db
    .select()
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Position nicht gefunden");
  return row;
}

/**
 * Edits one line. Changing `name` or `unit` can move it into another line's bucket;
 * the row is then deleted and its amount folded into that line, so the response can
 * legitimately contain one item fewer than the request implied.
 */
export async function updateShoppingItem(
  db: Database,
  groupId: string,
  listId: string,
  itemId: string,
  input: UpdateShoppingItemRequest,
): Promise<ShoppingListDetailResponse> {
  await loadShoppingListRow(db, groupId, listId);
  const row = await loadItemRow(db, listId, itemId);

  const name = input.name ?? row.name;
  const unit =
    input.unit === undefined
      ? row.unit
      : input.unit === null || input.unit.trim().length === 0
        ? null
        : normalizeUnit(input.unit);
  const quantity = input.quantity === undefined ? row.quantity : (input.quantity ?? null);
  const note =
    input.note === undefined ? row.note : input.note && input.note.length > 0 ? input.note : null;

  const nextKey = shoppingItemKey(name, unit);
  const timestamp = nowMs();

  await withTransaction(db, async (tx) => {
    if (nextKey !== row.mergeKey) {
      const collision = (await loadItemsByKey(tx, listId)).get(nextKey);
      if (collision && collision.id !== row.id) {
        // The edit turned this line into one that already exists: drop this row and
        // add its amount to the other, rather than failing on the UNIQUE index.
        await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, row.id));
        await applyAdditions(tx, listId, [
          {
            name,
            quantity,
            unit,
            note,
            sourceRecipeIds: Array.isArray(row.sourceRecipeIds) ? row.sourceRecipeIds : [],
          },
        ]);
        return;
      }
    }

    await tx
      .update(shoppingListItems)
      .set({ name, mergeKey: nextKey, quantity, unit, note, updatedAt: timestamp })
      .where(eq(shoppingListItems.id, row.id));
    await touchCatalog(tx, listId, name, unit, { bought: false });
    await tx.update(shoppingLists).set({ updatedAt: timestamp }).where(eq(shoppingLists.id, listId));
  });

  return getShoppingListDetail(db, groupId, listId);
}

/**
 * Removes a line WITHOUT counting it as bought — the "war doch nichts" case.
 * Idempotent: an unknown id is a no-op, because an offline queue may replay it.
 */
export async function deleteShoppingItem(
  db: DbLike,
  groupId: string,
  listId: string,
  itemId: string,
): Promise<ShoppingListDetailResponse> {
  await loadShoppingListRow(db, groupId, listId);
  await db
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)));
  await db.update(shoppingLists).set({ updatedAt: nowMs() }).where(eq(shoppingLists.id, listId));
  return getShoppingListDetail(db, groupId, listId);
}

/**
 * Checks a line off: it LEAVES the list and its catalog entry is bumped, so it shows
 * up under "Häufig gekauft" for a one-tap re-add.
 *
 * Idempotent by construction — an already-checked item is simply gone, and a replayed
 * check finds nothing to do. It therefore needs no `mutationId` to be safe, though one
 * is accepted so the client can queue every mutation the same way.
 */
export async function checkShoppingItem(
  db: Database,
  groupId: string,
  listId: string,
  itemId: string,
  mutationId?: string,
): Promise<ShoppingListDetailResponse> {
  await loadShoppingListRow(db, groupId, listId);

  await withTransaction(db, async (tx) => {
    if (!(await claimMutation(tx, listId, mutationId))) return;
    const [row] = await tx
      .select()
      .from(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .limit(1);
    if (!row) return;

    await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, row.id));
    await touchCatalog(tx, listId, row.name, row.unit, { bought: true });
    await tx.update(shoppingLists).set({ updatedAt: nowMs() }).where(eq(shoppingLists.id, listId));
  });
  await pruneMutationLedger(db);

  return getShoppingListDetail(db, groupId, listId);
}

/**
 * Empties the list.
 *
 * Nothing is counted as bought: "alles löschen" is a correction, not a shopping trip.
 * The catalog is untouched, so the suggestions survive — which is exactly what makes
 * clearing safe to offer.
 */
export async function clearShoppingList(
  db: DbLike,
  groupId: string,
  listId: string,
): Promise<ShoppingListDetailResponse> {
  await loadShoppingListRow(db, groupId, listId);
  await db.delete(shoppingListItems).where(eq(shoppingListItems.listId, listId));
  await db.update(shoppingLists).set({ updatedAt: nowMs() }).where(eq(shoppingLists.id, listId));
  return getShoppingListDetail(db, groupId, listId);
}

/**
 * Re-adds a suggestion to the list with no amount.
 *
 * No quantity on purpose: "Milch" from the suggestions means "we need milk again", and
 * inventing the amount from the last trip would be a guess the shopper then has to
 * check. The remembered unit is not applied either, for the same reason.
 */
export async function addCatalogEntryToList(
  db: Database,
  groupId: string,
  listId: string,
  entryId: string,
  mutationId?: string,
): Promise<ShoppingListDetailResponse> {
  await loadShoppingListRow(db, groupId, listId);
  const [entry] = await db
    .select()
    .from(shoppingListCatalog)
    .where(and(eq(shoppingListCatalog.id, entryId), eq(shoppingListCatalog.listId, listId)))
    .limit(1);
  if (!entry) throw ApiError.notFound("Vorschlag nicht gefunden");

  await withTransaction(db, async (tx) => {
    if (!(await claimMutation(tx, listId, mutationId))) return;
    await applyAdditions(tx, listId, [toDraft({ name: entry.name })]);
  });
  await pruneMutationLedger(db);

  return getShoppingListDetail(db, groupId, listId);
}

export { ingredientToShoppingItem };
