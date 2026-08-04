/**
 * Collections ("Kochbücher"): CRUD plus ordered recipe membership.
 *
 * REORDER: there is no extra endpoint — `PATCH /collections/:id` with
 * `recipeIds` is replace-all and re-numbers `position` to 0..n-1 in array order
 * inside ONE transaction, which is exactly a reorder (and also an add/remove).
 * `PUT/DELETE .../recipes/:recipeId` append/remove a single recipe.
 */
import type {
  Collection,
  CollectionDetailResponse,
  CreateCollectionRequest,
  UpdateCollectionRequest,
} from "@toon/shared";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { collectionRecipes, collections, recipes } from "../../db/schema.ts";
import type { CollectionRow } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import type { Membership } from "../../lib/types.ts";
import { assertRole } from "../groups/membership.ts";
import { type DbLike, nowMs, unique, withTransaction } from "../groups/support.ts";
import { toCollection } from "./mappers.ts";
import { buildRecipeListItems, loadRecipeRow } from "./recipes.service.ts";

/** All collections of a group with their recipe count — ONE grouped query. */
export async function listCollections(db: DbLike, groupId: string): Promise<Collection[]> {
  const rows = await db
    .select({ collection: collections, recipeCount: count(collectionRecipes.recipeId) })
    .from(collections)
    .leftJoin(collectionRecipes, eq(collectionRecipes.collectionId, collections.id))
    .where(eq(collections.groupId, groupId))
    .groupBy(collections.id)
    .orderBy(asc(collections.name));
  return rows.map((row) => toCollection(row.collection, Number(row.recipeCount)));
}

/** The raw collection row inside the group or a 404. */
export async function loadCollectionRow(
  db: DbLike,
  groupId: string,
  collectionId: string,
): Promise<CollectionRow> {
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.groupId, groupId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Sammlung nicht gefunden");
  return row;
}

/** Number of recipes in one collection. */
async function collectionRecipeCount(db: DbLike, collectionId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.collectionId, collectionId));
  return Number(row?.value ?? 0);
}

/** Rejects recipe ids that do not belong to the group (404). */
async function assertRecipesInGroup(
  db: DbLike,
  groupId: string,
  recipeIds: readonly string[],
): Promise<void> {
  if (recipeIds.length === 0) return;
  const rows = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.groupId, groupId), inArray(recipes.id, [...recipeIds])));
  if (rows.length !== recipeIds.length) throw ApiError.notFound("Rezept nicht gefunden");
}

/** Writes the membership rows with contiguous positions (0..n-1). */
async function writeMembership(
  tx: DbLike,
  collectionId: string,
  recipeIds: readonly string[],
): Promise<void> {
  await tx.delete(collectionRecipes).where(eq(collectionRecipes.collectionId, collectionId));
  if (recipeIds.length === 0) return;
  const timestamp = nowMs();
  await tx.insert(collectionRecipes).values(
    recipeIds.map((recipeId, index) => ({
      collectionId,
      recipeId,
      position: index,
      addedAt: timestamp,
    })),
  );
}

/** Creates a collection, optionally pre-filled with recipes in array order. */
export async function createCollection(
  db: Database,
  groupId: string,
  userId: string,
  input: CreateCollectionRequest,
): Promise<Collection> {
  const recipeIds = unique([...input.recipeIds]);
  await assertRecipesInGroup(db, groupId, recipeIds);

  const row: CollectionRow = {
    id: crypto.randomUUID(),
    groupId,
    name: input.name,
    description: input.description ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    createdBy: userId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  await withTransaction(db, async (tx) => {
    await tx.insert(collections).values(row);
    await writeMembership(tx, row.id, recipeIds);
  });

  return toCollection(row, recipeIds.length);
}

/** Collection + its recipes in `position` order (list shape, no children). */
export async function getCollectionDetail(
  db: DbLike,
  groupId: string,
  collectionId: string,
): Promise<CollectionDetailResponse> {
  const row = await loadCollectionRow(db, groupId, collectionId);
  const rows = await db
    .select({ recipe: recipes })
    .from(collectionRecipes)
    .innerJoin(recipes, eq(recipes.id, collectionRecipes.recipeId))
    .where(eq(collectionRecipes.collectionId, collectionId))
    .orderBy(asc(collectionRecipes.position), asc(collectionRecipes.addedAt));

  const items = await buildRecipeListItems(
    db,
    rows.map((entry) => entry.recipe),
  );
  return { collection: toCollection(row, items.length), recipes: items };
}

/**
 * Updates a collection. When `recipeIds` is present it REPLACES the membership
 * and renumbers positions — this is the reorder path, one transaction.
 */
export async function updateCollection(
  db: Database,
  groupId: string,
  collectionId: string,
  input: UpdateCollectionRequest,
): Promise<Collection> {
  const row = await loadCollectionRow(db, groupId, collectionId);

  const patch: Partial<CollectionRow> = { updatedAt: nowMs() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.coverImageUrl !== undefined) patch.coverImageUrl = input.coverImageUrl ?? null;

  const recipeIds = input.recipeIds === undefined ? undefined : unique([...input.recipeIds]);
  if (recipeIds) await assertRecipesInGroup(db, groupId, recipeIds);

  await withTransaction(db, async (tx) => {
    await tx.update(collections).set(patch).where(eq(collections.id, collectionId));
    if (recipeIds) await writeMembership(tx, collectionId, recipeIds);
  });

  const total = recipeIds ? recipeIds.length : await collectionRecipeCount(db, collectionId);
  return toCollection({ ...row, ...patch }, total);
}

/** Deletes a collection (creator or admin+); the links cascade. */
export async function deleteCollection(
  db: DbLike,
  membership: Membership,
  collectionId: string,
): Promise<void> {
  const row = await loadCollectionRow(db, membership.groupId, collectionId);
  if (row.createdBy !== membership.userId) assertRole(membership, "admin");
  await db.delete(collections).where(eq(collections.id, collectionId));
}

/** Appends a recipe to a collection. Idempotent (PUT). */
export async function addRecipeToCollection(
  db: DbLike,
  groupId: string,
  collectionId: string,
  recipeId: string,
): Promise<void> {
  await loadCollectionRow(db, groupId, collectionId);
  await loadRecipeRow(db, groupId, recipeId);

  const [existing] = await db
    .select({ recipeId: collectionRecipes.recipeId })
    .from(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.recipeId, recipeId),
      ),
    )
    .limit(1);
  if (existing) return;

  const [max] = await db
    .select({ value: sql<number | null>`max(${collectionRecipes.position})` })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.collectionId, collectionId));

  await db.insert(collectionRecipes).values({
    collectionId,
    recipeId,
    position: Number(max?.value ?? -1) + 1,
    addedAt: nowMs(),
  });
}

/** Removes a recipe from a collection (idempotent). */
export async function removeRecipeFromCollection(
  db: DbLike,
  groupId: string,
  collectionId: string,
  recipeId: string,
): Promise<void> {
  await loadCollectionRow(db, groupId, collectionId);
  await db
    .delete(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.recipeId, recipeId),
      ),
    );
}
