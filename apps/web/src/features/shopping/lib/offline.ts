/**
 * Offline-editable shopping lists.
 *
 * This module is imported for its SIDE EFFECT from src/app.tsx and registers one
 * mutation default per shopping operation. Everything below exists to make one thing
 * work: ticking items off in a supermarket basement with no signal, and having the
 * result reach the server later without the list being wrong in between.
 *
 * ## How the four pieces fit together
 *
 * 1. **`networkMode: "offlineFirst"`** — the mutation is ATTEMPTED even when the
 *    browser reports offline. If the request fails because there is no network, the
 *    mutation is PAUSED instead of failed, and TanStack keeps it in the mutation cache.
 * 2. **`onMutate` writes the answer the server would have given.** The optimistic
 *    update runs the SAME merge algebra the API runs (`@toon/shared`), so "200 g Mehl"
 *    added to an existing 200 g line shows 400 g immediately and does not jump when the
 *    real response lands.
 * 3. **Paused mutations are persisted** (`shouldPersistMutation` in lib/persist.ts) and
 *    replayed by `resumePausedMutations()` after the cache is restored. That is why
 *    every operation is registered HERE with `setMutationDefaults` rather than passed
 *    inline to `useMutation`: a dehydrated mutation keeps its variables but cannot keep
 *    a function, so the replay looks the `mutationFn` up by mutation key.
 * 4. **A `mutationId` travels with every queued write.** Generated once when the
 *    mutation is fired (never in `mutationFn`, which re-runs on replay), it lets the
 *    API apply each mutation at most once. Without it, a request that reached the
 *    server but lost its response would be applied twice on replay — and because items
 *    MERGE, that is a silently doubled amount, not a visible duplicate.
 *
 * ## Ordering
 *
 * `resumePausedMutations()` replays in the order the mutations were made, which matters:
 * "add Milch" then "check Milch off" must not arrive the other way round. Everything
 * here therefore stays on the default serial resume — do not make these mutations
 * concurrent.
 *
 * ## What is deliberately NOT offline
 *
 * Creating, renaming and deleting a LIST. Those are rare, they are not what you do
 * while shopping, and a list created offline would need a client-side id that every
 * queued item mutation then has to be rewritten to point at. Online-only keeps the
 * whole queue addressing server ids.
 */
import type { QueryClient } from "@tanstack/react-query";
import {
  mergeShoppingItems,
  nameKey,
  normalizeUnit,
  shoppingItemKey,
  type AddRecipeToShoppingListRequest,
  type ShoppingItem,
  type ShoppingItemInput,
  type ShoppingListDetailResponse,
  type UpdateShoppingItemRequest,
} from "@toon/shared";
import {
  addRecipeToShoppingList,
  addShoppingCatalogEntry,
  addShoppingItems,
  checkShoppingItem,
  clearShoppingList,
  deleteShoppingItem,
  updateShoppingItem,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { queryClient } from "@/lib/query-client";

/* -------------------------------------------------------------------------- */
/* mutation keys                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mutation keys are `["toon","shopping",<operation>]`. The `"shopping"` segment is what
 * `shouldPersistMutation` allow-lists, so a new operation is queued offline the moment
 * it is registered here — and NOT persisted if it is defined inline somewhere else.
 */
export const SHOPPING_MUTATION_KEYS = {
  addItems: ["toon", "shopping", "add-items"] as const,
  updateItem: ["toon", "shopping", "update-item"] as const,
  removeItem: ["toon", "shopping", "remove-item"] as const,
  check: ["toon", "shopping", "check"] as const,
  clear: ["toon", "shopping", "clear"] as const,
  addRecipe: ["toon", "shopping", "add-recipe"] as const,
  addSuggestion: ["toon", "shopping", "add-suggestion"] as const,
} as const;

/** Variables every shopping mutation carries. */
interface ShoppingTarget {
  groupId: string;
  listId: string;
  /** Client-generated, stable across replays — the API's at-most-once token. */
  mutationId: string;
}

export interface AddItemsVariables extends ShoppingTarget {
  items: ShoppingItemInput[];
}
export interface ItemVariables extends ShoppingTarget {
  itemId: string;
}
export interface UpdateItemVariables extends ItemVariables {
  patch: UpdateShoppingItemRequest;
}
export interface AddRecipeVariables extends ShoppingTarget {
  recipeId: string;
  servings?: number | undefined;
}
export interface AddSuggestionVariables extends ShoppingTarget {
  entryId: string;
  /** Only for the optimistic update; the server reads the name from its own row. */
  name: string;
}

/* -------------------------------------------------------------------------- */
/* optimistic cache surgery                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A placeholder id for a line that does not exist on the server yet.
 * Recognisable so the UI can disable per-item actions that need a real id.
 */
export function isPendingItemId(id: string): boolean {
  return id.startsWith("pending:");
}

/** Applies `change` to the cached detail payload, if there is one. */
function patchCache(
  client: QueryClient,
  groupId: string,
  listId: string,
  change: (current: ShoppingListDetailResponse) => ShoppingListDetailResponse,
): ShoppingListDetailResponse | undefined {
  const key = queryKeys.shoppingList(groupId, listId);
  const current = client.getQueryData<ShoppingListDetailResponse>(key);
  if (!current) return undefined;
  const next = change(current);
  client.setQueryData(key, next);
  return current;
}

/**
 * Rolls the cache back to a snapshot taken in `onMutate`, then asks the server for the
 * truth.
 *
 * The refetch is not belt-and-braces, it is load-bearing. Snapshots are per-mutation, so
 * with several edits in flight, rolling back the FIRST one to fail also discards the
 * optimistic changes of the ones after it — the classic optimistic-update trap. Letting
 * the server's answer land afterwards is what converges the list again. Offline the
 * refetch simply fails and the restored snapshot stands, which is the right outcome
 * there.
 */
function rollbackCache(
  client: QueryClient,
  groupId: string,
  listId: string,
  snapshot: ShoppingListDetailResponse | undefined,
): void {
  if (snapshot) client.setQueryData(queryKeys.shoppingList(groupId, listId), snapshot);
  void client.invalidateQueries({ queryKey: queryKeys.shoppingList(groupId, listId) });
}

/**
 * Optimistically merges `additions` into the cached list with the SAME algebra the
 * server uses, so the number the user sees offline is the number that survives.
 *
 * Lines that merge into an existing item keep that item's real id. Genuinely new lines
 * get a `pending:` id (see {@link isPendingItemId}) until the server answers.
 */
function mergeIntoCache(
  current: ShoppingListDetailResponse,
  additions: ShoppingItemInput[],
  sourceRecipeIds: string[] = [],
): ShoppingListDetailResponse {
  const timestamp = new Date().toISOString();
  const drafts = additions.map((item) => ({
    name: item.name.trim(),
    quantity: typeof item.quantity === "number" ? item.quantity : null,
    unit: item.unit?.trim() ? normalizeUnit(item.unit) : null,
    note: item.note?.trim() ? item.note.trim() : null,
    sourceRecipeIds,
  }));

  const merged = mergeShoppingItems(
    current.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      note: item.note,
      sourceRecipeIds: item.sourceRecipeIds,
      existing: item,
    })),
    drafts,
  );

  const items: ShoppingItem[] = merged.map((entry, index) => {
    const existing = "existing" in entry ? (entry.existing as ShoppingItem) : undefined;
    if (existing) {
      return {
        ...existing,
        quantity: entry.quantity,
        unit: entry.unit,
        note: entry.note,
        sourceRecipeIds: entry.sourceRecipeIds,
        updatedAt: timestamp,
      };
    }
    return {
      id: `pending:${shoppingItemKey(entry.name, entry.unit)}`,
      listId: current.list.id,
      name: entry.name,
      quantity: entry.quantity,
      unit: entry.unit,
      note: entry.note,
      position: index,
      sourceRecipeIds: entry.sourceRecipeIds,
      // Titles are only known to the server; the line shows its provenance after sync.
      sources: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  // Anything now on the list must stop being suggested, exactly as the server does.
  const onList = new Set(items.map((item) => nameKey(item.name)));
  return {
    list: { ...current.list, itemCount: items.length, updatedAt: timestamp },
    items,
    catalog: current.catalog.filter((entry) => !onList.has(nameKey(entry.name))),
  };
}

/** Removes a line from the cached list. Used by both check-off and delete. */
function removeFromCache(
  current: ShoppingListDetailResponse,
  itemId: string,
  options: { asBought: boolean },
): ShoppingListDetailResponse {
  const removed = current.items.find((item) => item.id === itemId);
  const items = current.items.filter((item) => item.id !== itemId);
  const timestamp = new Date().toISOString();

  // A checked item reappears under "Häufig gekauft" immediately, so the offline screen
  // looks like the online one. useCount is only an optimistic guess; the next server
  // response replaces the whole payload with the real ranking.
  let catalog = current.catalog;
  if (options.asBought && removed) {
    const key = nameKey(removed.name);
    const known = catalog.find((entry) => nameKey(entry.name) === key);
    catalog = known
      ? catalog.map((entry) =>
          entry.id === known.id
            ? { ...entry, useCount: entry.useCount + 1, lastUsedAt: timestamp, unit: removed.unit }
            : entry,
        )
      : [
          {
            id: `pending:${key}`,
            listId: current.list.id,
            name: removed.name,
            unit: removed.unit,
            useCount: 1,
            lastUsedAt: timestamp,
          },
          ...catalog,
        ];
  }

  return {
    list: { ...current.list, itemCount: items.length, updatedAt: timestamp },
    items,
    catalog,
  };
}

/* -------------------------------------------------------------------------- */
/* registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Registers every shopping mutation on `client`.
 *
 * Called once at module load for the app's client, and callable again in a test with a
 * throwaway client. Idempotent — re-registering a key replaces its defaults.
 */
export function registerShoppingMutationDefaults(client: QueryClient): void {
  const shared = {
    networkMode: "offlineFirst",
    // Retry once so a flaky connection is not immediately a red toast; a genuinely
    // offline mutation is PAUSED rather than retried, so this does not fight the queue.
    retry: 1,
  } as const;

  /** Replaces the cached list with the server's answer — never patches it. */
  const commit = (data: ShoppingListDetailResponse, variables: ShoppingTarget) => {
    client.setQueryData(queryKeys.shoppingList(variables.groupId, variables.listId), data);
    // The overview shows per-list item counts, so it is stale after every write.
    void client.invalidateQueries({ queryKey: queryKeys.shoppingLists(variables.groupId) });
  };

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.addItems, {
    ...shared,
    mutationFn: (variables: AddItemsVariables) =>
      addShoppingItems(variables.groupId, variables.listId, {
        items: variables.items,
        mutationId: variables.mutationId,
      }),
    onMutate: (variables: AddItemsVariables) =>
      patchCache(client, variables.groupId, variables.listId, (current) =>
        mergeIntoCache(current, variables.items),
      ),
    onError: (_error, variables: AddItemsVariables, snapshot) =>
      rollbackCache(client, variables.groupId, variables.listId, snapshot as never),
    onSuccess: commit,
  });

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.addRecipe, {
    ...shared,
    mutationFn: (variables: AddRecipeVariables) => {
      const body: AddRecipeToShoppingListRequest = {
        recipeId: variables.recipeId,
        mutationId: variables.mutationId,
        ...(variables.servings === undefined ? {} : { servings: variables.servings }),
      };
      return addRecipeToShoppingList(variables.groupId, variables.listId, body);
    },
    // No optimistic update: the ingredient rows are not necessarily in the cache (the
    // recipe may never have been opened), and inventing them would show amounts that
    // then change. The list simply updates when the server answers.
    onSuccess: commit,
  });

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.updateItem, {
    ...shared,
    mutationFn: (variables: UpdateItemVariables) =>
      updateShoppingItem(variables.groupId, variables.listId, variables.itemId, variables.patch),
    onMutate: (variables: UpdateItemVariables) =>
      patchCache(client, variables.groupId, variables.listId, (current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === variables.itemId
            ? {
                ...item,
                ...(variables.patch.name === undefined ? {} : { name: variables.patch.name }),
                ...(variables.patch.quantity === undefined
                  ? {}
                  : { quantity: variables.patch.quantity ?? null }),
                ...(variables.patch.unit === undefined
                  ? {}
                  : { unit: variables.patch.unit ? normalizeUnit(variables.patch.unit) : null }),
                ...(variables.patch.note === undefined
                  ? {}
                  : { note: variables.patch.note ?? null }),
              }
            : item,
        ),
      })),
    onError: (_error, variables: UpdateItemVariables, snapshot) =>
      rollbackCache(client, variables.groupId, variables.listId, snapshot as never),
    onSuccess: commit,
  });

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.check, {
    ...shared,
    mutationFn: (variables: ItemVariables) =>
      checkShoppingItem(variables.groupId, variables.listId, variables.itemId, {
        mutationId: variables.mutationId,
      }),
    onMutate: (variables: ItemVariables) =>
      patchCache(client, variables.groupId, variables.listId, (current) =>
        removeFromCache(current, variables.itemId, { asBought: true }),
      ),
    onError: (_error, variables: ItemVariables, snapshot) =>
      rollbackCache(client, variables.groupId, variables.listId, snapshot as never),
    onSuccess: commit,
  });

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.removeItem, {
    ...shared,
    mutationFn: (variables: ItemVariables) =>
      deleteShoppingItem(variables.groupId, variables.listId, variables.itemId),
    onMutate: (variables: ItemVariables) =>
      patchCache(client, variables.groupId, variables.listId, (current) =>
        removeFromCache(current, variables.itemId, { asBought: false }),
      ),
    onError: (_error, variables: ItemVariables, snapshot) =>
      rollbackCache(client, variables.groupId, variables.listId, snapshot as never),
    onSuccess: commit,
  });

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.clear, {
    ...shared,
    // `mutationId` is carried in the variables for a uniform shape but deliberately not
    // sent: "delete every row on this list" is already idempotent, so a replay needs no
    // ledger entry — and spending one would only shorten the ledger's useful window.
    mutationFn: (variables: ShoppingTarget) =>
      clearShoppingList(variables.groupId, variables.listId),
    onMutate: (variables: ShoppingTarget) =>
      patchCache(client, variables.groupId, variables.listId, (current) => ({
        ...current,
        list: { ...current.list, itemCount: 0 },
        items: [],
      })),
    onError: (_error, variables: ShoppingTarget, snapshot) =>
      rollbackCache(client, variables.groupId, variables.listId, snapshot as never),
    onSuccess: commit,
  });

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.addSuggestion, {
    ...shared,
    mutationFn: (variables: AddSuggestionVariables) =>
      addShoppingCatalogEntry(variables.groupId, variables.listId, variables.entryId, {
        mutationId: variables.mutationId,
      }),
    // A suggestion goes back on the list without an amount, matching the API.
    onMutate: (variables: AddSuggestionVariables) =>
      patchCache(client, variables.groupId, variables.listId, (current) =>
        mergeIntoCache(current, [{ name: variables.name }]),
      ),
    onError: (_error, variables: AddSuggestionVariables, snapshot) =>
      rollbackCache(client, variables.groupId, variables.listId, snapshot as never),
    onSuccess: commit,
  });
}

registerShoppingMutationDefaults(queryClient);
