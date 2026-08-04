/** TanStack Query hooks for collections ("Sammlungen"). Keys come from `@/lib/queries`. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Collection, CreateCollectionRequest, UpdateCollectionRequest } from "@toon/shared";
import {
  addRecipeToCollection,
  createCollection,
  deleteCollection,
  removeRecipeFromCollection,
  updateCollection,
} from "@/lib/api";
import { collectionQuery, collectionsQuery, invalidate } from "@/lib/queries";

/** Collections of the active group, unwrapped to `Collection[]`. */
export function useCollections(groupId: string | null) {
  const options = collectionsQuery(groupId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== null,
    select: (response) => response.items,
  });
}

/** One collection plus its recipes. */
export function useCollection(groupId: string | null, collectionId: string | undefined) {
  const options = collectionQuery(groupId ?? "", collectionId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== null && collectionId !== undefined && collectionId.length > 0,
  });
}

export function useCreateCollection(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<Collection, Error, CreateCollectionRequest>({
    mutationFn: async (input) => {
      const response = await createCollection(groupId ?? "", input);
      return response.collection;
    },
    onSuccess: async () => {
      if (groupId) await invalidate.collections(client, groupId);
    },
  });
}

export interface UpdateCollectionInput extends UpdateCollectionRequest {
  collectionId: string;
}

export function useUpdateCollection(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<Collection, Error, UpdateCollectionInput>({
    mutationFn: async ({ collectionId, ...patch }) => {
      const response = await updateCollection(groupId ?? "", collectionId, patch);
      return response.collection;
    },
    onSuccess: async (collection) => {
      if (!groupId) return;
      await Promise.all([
        invalidate.collections(client, groupId),
        invalidate.collection(client, groupId, collection.id),
      ]);
    },
  });
}

export function useDeleteCollection(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (collectionId) => deleteCollection(groupId ?? "", collectionId),
    onSuccess: async (_result, collectionId) => {
      if (!groupId) return;
      await Promise.all([
        invalidate.collections(client, groupId),
        invalidate.collection(client, groupId, collectionId),
        invalidate.recipes(client, groupId),
      ]);
    },
  });
}

export interface CollectionRecipeInput {
  collectionId: string;
  recipeId: string;
}

/** PUT is idempotent per the contract, so "hinzufügen" can be fired repeatedly. */
export function useAddRecipeToCollection(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, CollectionRecipeInput>({
    mutationFn: ({ collectionId, recipeId }) =>
      addRecipeToCollection(groupId ?? "", collectionId, recipeId),
    onSuccess: async (_result, { collectionId, recipeId }) => {
      if (!groupId) return;
      await Promise.all([
        invalidate.collection(client, groupId, collectionId),
        invalidate.collections(client, groupId),
        invalidate.recipe(client, groupId, recipeId),
      ]);
    },
  });
}

export function useRemoveRecipeFromCollection(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, CollectionRecipeInput>({
    mutationFn: ({ collectionId, recipeId }) =>
      removeRecipeFromCollection(groupId ?? "", collectionId, recipeId),
    onSuccess: async (_result, { collectionId, recipeId }) => {
      if (!groupId) return;
      await Promise.all([
        invalidate.collection(client, groupId, collectionId),
        invalidate.collections(client, groupId),
        invalidate.recipe(client, groupId, recipeId),
      ]);
    },
  });
}

export interface ReorderCollectionInput {
  collectionId: string;
  /** The COMPLETE ordered list of recipe ids in the collection. */
  recipeIds: readonly string[];
}

/**
 * Reordering.
 *
 * CONTRACT GAP: there is no "set position" endpoint. `collection_recipes.position` is
 * assigned by the API on insert, so the only way for a client to express an order is to
 * remove every membership and re-add them in the desired sequence — hence `recipeIds`
 * must be the complete ordered list. Isolated here so a future dedicated endpoint
 * changes exactly one function.
 */
export function useReorderCollectionRecipes(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, ReorderCollectionInput>({
    mutationFn: async ({ collectionId, recipeIds }) => {
      const group = groupId ?? "";
      for (const recipeId of recipeIds) {
        await removeRecipeFromCollection(group, collectionId, recipeId);
      }
      for (const recipeId of recipeIds) {
        await addRecipeToCollection(group, collectionId, recipeId);
      }
    },
    // Always refetch: a partially applied reorder must never stay on screen.
    onSettled: async (_data, _error, { collectionId }) => {
      if (!groupId) return;
      await invalidate.collection(client, groupId, collectionId);
    },
  });
}
