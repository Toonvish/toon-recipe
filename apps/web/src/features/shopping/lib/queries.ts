/**
 * TanStack Query hooks for shopping lists.
 *
 * The MUTATIONS here are thin: they only supply a mutation key and the variables. All
 * the behaviour — the request, the optimistic merge, the rollback, the cache commit —
 * is registered once in ./offline.ts via `setMutationDefaults`, because a mutation
 * restored from IndexedDB after an offline spell can only find its function by key.
 *
 * Every mutating hook therefore mints a `mutationId` at CALL time and passes it in the
 * variables. It must not be generated inside the mutation function: that re-runs on
 * replay, a fresh id would look like a new mutation to the API, and an "add" that had
 * already been applied would be applied twice.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateShoppingListRequest,
  ShoppingItemInput,
  ShoppingList,
  ShoppingListDetailResponse,
  UpdateShoppingItemRequest,
} from "@toon/shared";
import {
  createShoppingList,
  deleteShoppingCatalogEntry,
  deleteShoppingList,
  updateShoppingList,
} from "@/lib/api";
import { invalidate, shoppingListQuery, shoppingListsQuery } from "@/lib/queries";
import {
  SHOPPING_MUTATION_KEYS,
  type AddItemsVariables,
  type AddRecipeVariables,
  type AddSuggestionVariables,
  type ItemVariables,
  type UpdateItemVariables,
} from "./offline";

/** A fresh at-most-once token for one queued mutation. */
function newMutationId(): string {
  return crypto.randomUUID();
}

/* -------------------------------------------------------------------------- */
/* reads                                                                      */
/* -------------------------------------------------------------------------- */

/** All lists of the group, unwrapped to `ShoppingList[]`. */
export function useShoppingLists(groupId: string | null) {
  const options = shoppingListsQuery(groupId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== null,
    select: (response) => response.items,
  });
}

/** One list with its items and "Häufig gekauft" suggestions. */
export function useShoppingList(groupId: string | null, listId: string | null) {
  const options = shoppingListQuery(groupId ?? "", listId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== null && listId !== null,
  });
}

/* -------------------------------------------------------------------------- */
/* list-level mutations (online only — see the note in ./offline.ts)          */
/* -------------------------------------------------------------------------- */

export function useCreateShoppingList(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<ShoppingList, Error, CreateShoppingListRequest>({
    mutationFn: async (input) => (await createShoppingList(groupId ?? "", input)).list,
    onSuccess: async () => {
      if (groupId) await invalidate.shoppingLists(client, groupId);
    },
  });
}

export function useRenameShoppingList(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<ShoppingList, Error, { listId: string; name: string }>({
    mutationFn: async ({ listId, name }) =>
      (await updateShoppingList(groupId ?? "", listId, { name })).list,
    onSuccess: async (list) => {
      if (!groupId) return;
      await Promise.all([
        invalidate.shoppingLists(client, groupId),
        invalidate.shoppingList(client, groupId, list.id),
      ]);
    },
  });
}

export function useDeleteShoppingList(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (listId) => deleteShoppingList(groupId ?? "", listId),
    onSuccess: async (_result, listId) => {
      if (!groupId) return;
      client.removeQueries({ queryKey: ["toon", "group", groupId, "shopping-list", listId] });
      await invalidate.shoppingLists(client, groupId);
    },
  });
}

/* -------------------------------------------------------------------------- */
/* item mutations (offline-capable)                                           */
/* -------------------------------------------------------------------------- */

type Detail = ShoppingListDetailResponse;

/** Adds hand-entered lines. Merges into what is already on the list. */
export function useAddShoppingItems(groupId: string, listId: string) {
  const mutation = useMutation<Detail, Error, AddItemsVariables>({
    mutationKey: SHOPPING_MUTATION_KEYS.addItems,
  });
  return {
    ...mutation,
    add: (items: ShoppingItemInput[]) =>
      mutation.mutate({ groupId, listId, items, mutationId: newMutationId() }),
  };
}

/** Puts a recipe on the list, scaled to `servings`. */
export function useAddRecipeToShoppingList() {
  const mutation = useMutation<Detail, Error, AddRecipeVariables>({
    mutationKey: SHOPPING_MUTATION_KEYS.addRecipe,
  });
  return {
    ...mutation,
    addRecipe: (input: {
      groupId: string;
      listId: string;
      recipeId: string;
      servings?: number | undefined;
    }) => mutation.mutateAsync({ ...input, mutationId: newMutationId() }),
  };
}

export function useUpdateShoppingItem(groupId: string, listId: string) {
  const mutation = useMutation<Detail, Error, UpdateItemVariables>({
    mutationKey: SHOPPING_MUTATION_KEYS.updateItem,
  });
  return {
    ...mutation,
    update: (itemId: string, patch: UpdateShoppingItemRequest) =>
      mutation.mutate({ groupId, listId, itemId, patch, mutationId: newMutationId() }),
  };
}

/** Checks a line off: it leaves the list and shows up under "Häufig gekauft". */
export function useCheckShoppingItem(groupId: string, listId: string) {
  const mutation = useMutation<Detail, Error, ItemVariables>({
    mutationKey: SHOPPING_MUTATION_KEYS.check,
  });
  return {
    ...mutation,
    check: (itemId: string) =>
      mutation.mutate({ groupId, listId, itemId, mutationId: newMutationId() }),
  };
}

/** Removes a line WITHOUT counting it as bought. */
export function useRemoveShoppingItem(groupId: string, listId: string) {
  const mutation = useMutation<Detail, Error, ItemVariables>({
    mutationKey: SHOPPING_MUTATION_KEYS.removeItem,
  });
  return {
    ...mutation,
    remove: (itemId: string) =>
      mutation.mutate({ groupId, listId, itemId, mutationId: newMutationId() }),
  };
}

export function useClearShoppingList(groupId: string, listId: string) {
  const mutation = useMutation<Detail, Error, { groupId: string; listId: string; mutationId: string }>(
    { mutationKey: SHOPPING_MUTATION_KEYS.clear },
  );
  return {
    ...mutation,
    clear: () => mutation.mutate({ groupId, listId, mutationId: newMutationId() }),
  };
}

/** Re-adds a suggestion, deliberately without an amount. */
export function useAddShoppingSuggestion(groupId: string, listId: string) {
  const mutation = useMutation<Detail, Error, AddSuggestionVariables>({
    mutationKey: SHOPPING_MUTATION_KEYS.addSuggestion,
  });
  return {
    ...mutation,
    addSuggestion: (entryId: string, name: string) =>
      mutation.mutate({ groupId, listId, entryId, name, mutationId: newMutationId() }),
  };
}

/**
 * "Nicht mehr vorschlagen". Online only and intentionally so: dismissing a suggestion
 * is housekeeping, not shopping, and a queued dismissal replayed days later could
 * remove an entry the group has since started using again.
 */
export function useDismissShoppingSuggestion(groupId: string, listId: string) {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (entryId) => deleteShoppingCatalogEntry(groupId, listId, entryId),
    onMutate: (entryId) => {
      const key = ["toon", "group", groupId, "shopping-list", listId] as const;
      const snapshot = client.getQueryData<Detail>(key);
      if (snapshot) {
        client.setQueryData(key, {
          ...snapshot,
          catalog: snapshot.catalog.filter((entry) => entry.id !== entryId),
        });
      }
      return snapshot;
    },
    onError: (_error, _entryId, snapshot) => {
      if (snapshot) {
        client.setQueryData(["toon", "group", groupId, "shopping-list", listId], snapshot);
      }
    },
    onSuccess: async () => {
      await invalidate.shoppingList(client, groupId, listId);
    },
  });
}
