/**
 * TanStack Query wiring: one key factory, ready-made `queryOptions` for every read
 * endpoint and invalidation helpers. Other feature agents should import from here
 * instead of inventing their own keys, otherwise cache invalidation breaks.
 *
 * Key layout (hierarchical on purpose, so a prefix invalidates a whole subtree):
 *   ["toon","me"]
 *   ["toon","groups"]
 *   ["toon","group",groupId]                       <- everything group-scoped
 *   ["toon","group",groupId,"recipes",filters]
 *   ["toon","group",groupId,"recipe",recipeId]
 *   ["toon","cards"]                               <- user-owned, no group segment
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type {
  ImportDraftListQuery,
  MealPlanRangeQuery,
  PaginationQuery,
  RecipeListQuery,
} from "@toon/shared";
import {
  fetchCards,
  fetchCollection,
  fetchCollections,
  fetchGroup,
  fetchGroupInvites,
  fetchGroupMembers,
  fetchGroups,
  fetchHealth,
  fetchImportDraft,
  fetchImportDrafts,
  fetchInvitePreview,
  fetchMe,
  fetchOAuthProviders,
  fetchPlanRange,
  fetchPlanShoppingPreview,
  fetchRecipe,
  fetchRecipes,
  fetchScaledRecipe,
  fetchSessions,
  fetchShoppingBoughtHistory,
  fetchShoppingCatalogPage,
  fetchShoppingList,
  fetchShoppingLists,
  fetchTags,
  isApiError,
  type ShoppingBoughtHistoryQuery,
  type ShoppingCatalogPageQuery,
} from "./api";

/* -------------------------------------------------------------------------- */
/* cache policy                                                               */
/* -------------------------------------------------------------------------- */

export const STALE_TIME = {
  /** Session/bootstrap: cheap, but should feel instant after navigation. */
  session: 60_000,
  /** Lists that change when someone in the group edits something. */
  list: 30_000,
  /** Single entities. */
  detail: 60_000,
  /** Rarely changing metadata (tags, collections). */
  meta: 5 * 60_000,
} as const;

/**
 * Retry policy: never retry a 4xx (the user must change something), retry
 * network/5xx twice with backoff.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.isClientError) return false;
  return failureCount < 2;
}

export const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, 8000);

/* -------------------------------------------------------------------------- */
/* keys                                                                       */
/* -------------------------------------------------------------------------- */

/** Stable, order-independent serialisation of a list filter object. */
function filterKey(filters: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!filters) return {};
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

const ROOT = "toon" as const;

export const queryKeys = {
  all: [ROOT] as const,
  health: () => [ROOT, "health"] as const,
  me: () => [ROOT, "me"] as const,
  sessions: () => [ROOT, "sessions"] as const,
  oauthProviders: () => [ROOT, "oauth-providers"] as const,
  groups: () => [ROOT, "groups"] as const,
  invitePreview: (token: string) => [ROOT, "invite", token] as const,

  /** Prefix for EVERY piece of data belonging to one group. */
  group: (groupId: string) => [ROOT, "group", groupId] as const,
  groupDetail: (groupId: string) => [ROOT, "group", groupId, "detail"] as const,
  groupMembers: (groupId: string) => [ROOT, "group", groupId, "members"] as const,
  groupInvites: (groupId: string, query?: Partial<PaginationQuery>) =>
    [ROOT, "group", groupId, "invites", filterKey(query)] as const,

  recipes: (groupId: string, query?: Partial<RecipeListQuery>) =>
    [ROOT, "group", groupId, "recipes", filterKey(query)] as const,
  recipesRoot: (groupId: string) => [ROOT, "group", groupId, "recipes"] as const,
  recipe: (groupId: string, recipeId: string) =>
    [ROOT, "group", groupId, "recipe", recipeId] as const,
  recipeScale: (groupId: string, recipeId: string, servings: number) =>
    [ROOT, "group", groupId, "recipe", recipeId, "scale", servings] as const,

  tags: (groupId: string) => [ROOT, "group", groupId, "tags"] as const,
  collections: (groupId: string) => [ROOT, "group", groupId, "collections"] as const,
  collection: (groupId: string, collectionId: string) =>
    [ROOT, "group", groupId, "collection", collectionId] as const,

  importDrafts: (groupId: string, query?: Partial<ImportDraftListQuery>) =>
    [ROOT, "group", groupId, "imports", filterKey(query)] as const,
  importDraftsRoot: (groupId: string) => [ROOT, "group", groupId, "imports"] as const,
  importDraft: (groupId: string, draftId: string) =>
    [ROOT, "group", groupId, "import", draftId] as const,

  /**
   * Saved cards. NOT under `group` — a card belongs to the user, so it must stay
   * in the cache when the active group is switched (and the per-user namespacing
   * of the persisted blob is what keeps it off a shared phone's other account).
   */
  cards: () => [ROOT, "cards"] as const,

  shoppingLists: (groupId: string) => [ROOT, "group", groupId, "shopping-lists"] as const,
  shoppingList: (groupId: string, listId: string) =>
    [ROOT, "group", groupId, "shopping-list", listId] as const,

  /**
   * The meal planner. `planRoot` is the prefix `invalidateAfterPlanMutation`
   * invalidates — every range fetched for the group hangs off it, so moving an
   * entry between two ranges refreshes both without knowing which ones are mounted.
   */
  planRoot: (groupId: string) => [ROOT, "group", groupId, "plan"] as const,
  plan: (groupId: string, range: { from: string; to: string }) =>
    [ROOT, "group", groupId, "plan", filterKey(range)] as const,

  /**
   * "From this week's plan" (the shopping list's own read of the planner) — segment
   * `"plan-shopping"` on purpose, distinct from `"plan"`: R24 persists the planner's
   * own range reads but NOT this one, since its only affordance is an online-only
   * bulk add and a restored diff would draw an `Add` button that cannot run.
   */
  planShopping: (groupId: string, listId: string) =>
    [ROOT, "group", groupId, "plan-shopping", listId] as const,

  /**
   * The cross-list "Bought today" / history feed. Segment `"shopping-bought"` is
   * what `PERSISTED_GROUP_SEGMENTS` (lib/persist.ts) allow-lists — it sits on the
   * already-offline `/shopping` screen, so leaving it unpersisted would be a
   * spinner that never resolves.
   */
  boughtHistory: (groupId: string, query?: ShoppingBoughtHistoryQuery) =>
    [ROOT, "group", groupId, "shopping-bought", filterKey(query)] as const,

  /**
   * The full "Häufig gekauft" sheet (`Show all`). Segment `"shopping-catalog"` is
   * deliberately NOT on the persist allow-list — a sheet opened on demand, not the
   * always-visible chip row (which comes from the list detail payload instead).
   */
  catalogPage: (groupId: string, listId: string, query?: ShoppingCatalogPageQuery) =>
    [ROOT, "group", groupId, "shopping-catalog", listId, filterKey(query)] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* query options                                                              */
/* -------------------------------------------------------------------------- */

export const healthQuery = () =>
  queryOptions({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => fetchHealth({ signal }),
    staleTime: STALE_TIME.list,
  });

/** Bootstrap query. Returns `null` when nobody is logged in (401 is not an error). */
export const meQuery = () =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: async ({ signal }) => {
      try {
        return await fetchMe({ signal });
      } catch (error) {
        if (isApiError(error) && error.isUnauthorized) return null;
        throw error;
      }
    },
    staleTime: STALE_TIME.session,
    retry: shouldRetry,
    retryDelay,
  });

export const sessionsQuery = () =>
  queryOptions({
    queryKey: queryKeys.sessions(),
    queryFn: ({ signal }) => fetchSessions({ signal }),
    staleTime: STALE_TIME.list,
  });

/**
 * Which OAuth providers this deployment configured, and which the current user
 * linked. Works without a session (the login screen needs it to hide dead
 * buttons), so 401 must not bubble up as an error.
 */
export const oauthProvidersQuery = () =>
  queryOptions({
    queryKey: queryKeys.oauthProviders(),
    queryFn: ({ signal }) => fetchOAuthProviders({ signal }),
    staleTime: STALE_TIME.list,
  });

export const groupsQuery = () =>
  queryOptions({
    queryKey: queryKeys.groups(),
    queryFn: ({ signal }) => fetchGroups({ signal }),
    staleTime: STALE_TIME.list,
  });

export const invitePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: queryKeys.invitePreview(token),
    queryFn: ({ signal }) => fetchInvitePreview(token, { signal }),
    staleTime: STALE_TIME.detail,
    retry: false,
  });

export const groupQuery = (groupId: string) =>
  queryOptions({
    queryKey: queryKeys.groupDetail(groupId),
    queryFn: ({ signal }) => fetchGroup(groupId, { signal }),
    staleTime: STALE_TIME.detail,
  });

export const groupMembersQuery = (groupId: string) =>
  queryOptions({
    queryKey: queryKeys.groupMembers(groupId),
    queryFn: ({ signal }) => fetchGroupMembers(groupId, { signal }),
    staleTime: STALE_TIME.list,
  });

export const groupInvitesQuery = (groupId: string, query: Partial<PaginationQuery> = {}) =>
  queryOptions({
    queryKey: queryKeys.groupInvites(groupId, query),
    queryFn: ({ signal }) => fetchGroupInvites(groupId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

export const recipesQuery = (groupId: string, query: Partial<RecipeListQuery> = {}) =>
  queryOptions({
    queryKey: queryKeys.recipes(groupId, query),
    queryFn: ({ signal }) => fetchRecipes(groupId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

export const recipeQuery = (groupId: string, recipeId: string) =>
  queryOptions({
    queryKey: queryKeys.recipe(groupId, recipeId),
    queryFn: ({ signal }) => fetchRecipe(groupId, recipeId, { signal }),
    staleTime: STALE_TIME.detail,
  });

export const recipeScaleQuery = (groupId: string, recipeId: string, servings: number) =>
  queryOptions({
    queryKey: queryKeys.recipeScale(groupId, recipeId, servings),
    queryFn: ({ signal }) => fetchScaledRecipe(groupId, recipeId, servings, { signal }),
    staleTime: STALE_TIME.detail,
  });

export const tagsQuery = (groupId: string) =>
  queryOptions({
    queryKey: queryKeys.tags(groupId),
    queryFn: ({ signal }) => fetchTags(groupId, { signal }),
    staleTime: STALE_TIME.meta,
  });

export const collectionsQuery = (groupId: string) =>
  queryOptions({
    queryKey: queryKeys.collections(groupId),
    queryFn: ({ signal }) => fetchCollections(groupId, { signal }),
    staleTime: STALE_TIME.meta,
  });

export const collectionQuery = (groupId: string, collectionId: string) =>
  queryOptions({
    queryKey: queryKeys.collection(groupId, collectionId),
    queryFn: ({ signal }) => fetchCollection(groupId, collectionId, { signal }),
    staleTime: STALE_TIME.detail,
  });

export const importDraftsQuery = (
  groupId: string,
  query: Partial<ImportDraftListQuery> = {},
) =>
  queryOptions({
    queryKey: queryKeys.importDrafts(groupId, query),
    queryFn: ({ signal }) => fetchImportDrafts(groupId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

export const importDraftQuery = (groupId: string, draftId: string) =>
  queryOptions({
    queryKey: queryKeys.importDraft(groupId, draftId),
    queryFn: ({ signal }) => fetchImportDraft(groupId, draftId, { signal }),
    /** A draft is edited locally; don't fight the form with background refetches. */
    staleTime: Infinity,
  });

/**
 * The user's saved cards.
 *
 * `networkMode: "offlineFirst"` for the same reason the shopping list has it: the
 * screen this feeds is used at a till, where the phone may have no signal at all,
 * and the persisted copy is the whole point of saving a card in the app. Writes
 * are online-only (see features/cards/lib/queries.ts) — only reading works offline.
 */
export const cardsQuery = () =>
  queryOptions({
    queryKey: queryKeys.cards(),
    queryFn: ({ signal }) => fetchCards({ signal }),
    staleTime: STALE_TIME.meta,
    networkMode: "offlineFirst",
  });

export const shoppingListsQuery = (groupId: string) =>
  queryOptions({
    queryKey: queryKeys.shoppingLists(groupId),
    queryFn: ({ signal }) => fetchShoppingLists(groupId, { signal }),
    staleTime: STALE_TIME.list,
  });

/**
 * One shopping list with its items and suggestions.
 *
 * `networkMode: "offlineFirst"` so a cold start in a supermarket basement renders the
 * persisted copy instead of sitting in `pending` forever — the mutations that go with
 * it queue the same way (features/shopping/lib/offline.ts).
 *
 * `staleTime: 0`: a shared list is the one thing in this app another person changes
 * while you are looking at it, so every remount refetches.
 */
export const shoppingListQuery = (groupId: string, listId: string) =>
  queryOptions({
    queryKey: queryKeys.shoppingList(groupId, listId),
    queryFn: ({ signal }) => fetchShoppingList(groupId, listId, { signal }),
    staleTime: 0,
    networkMode: "offlineFirst",
  });

/**
 * A week (or other bounded range) of the meal planner. `offlineFirst`, same reason
 * as the shopping list: the library's week strip is on a screen that has to survive
 * a cold start with no signal.
 */
export const planQuery = (groupId: string, range: MealPlanRangeQuery) =>
  queryOptions({
    queryKey: queryKeys.plan(groupId, range),
    queryFn: ({ signal }) => fetchPlanRange(groupId, range, { signal }),
    staleTime: STALE_TIME.list,
    networkMode: "offlineFirst",
  });

/**
 * "From this week's plan" — a server-computed diff against ONE list. Deliberately
 * the default (online) network mode, not `offlineFirst`: its only affordance is a
 * bulk add that cannot run offline anyway (R24), so there is nothing useful to
 * restore from a stale copy.
 */
export const planShoppingQuery = (groupId: string, listId: string, range: { from: string; to: string }) =>
  queryOptions({
    queryKey: queryKeys.planShopping(groupId, listId),
    queryFn: ({ signal }) => fetchPlanShoppingPreview(groupId, listId, range, { signal }),
    staleTime: STALE_TIME.list,
  });

/** The cross-list "Bought today" / history feed — the overview panel and `/shopping/history`. */
export const boughtHistoryQuery = (groupId: string, query: ShoppingBoughtHistoryQuery = {}) =>
  queryOptions({
    queryKey: queryKeys.boughtHistory(groupId, query),
    queryFn: ({ signal }) => fetchShoppingBoughtHistory(groupId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

/** The full "Häufig gekauft" sheet (`Show all`). */
export const catalogPageQuery = (
  groupId: string,
  listId: string,
  query: ShoppingCatalogPageQuery = {},
) =>
  queryOptions({
    queryKey: queryKeys.catalogPage(groupId, listId, query),
    queryFn: ({ signal }) => fetchShoppingCatalogPage(groupId, listId, query, { signal }),
    staleTime: STALE_TIME.list,
  });

/* -------------------------------------------------------------------------- */
/* invalidation helpers                                                       */
/* -------------------------------------------------------------------------- */

export const invalidate = {
  everything: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.all }),
  me: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.me() }),
  sessions: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.sessions() }),
  oauthProviders: (qc: QueryClient) =>
    qc.invalidateQueries({ queryKey: queryKeys.oauthProviders() }),
  groups: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.groups() }),
  /** Everything inside one group (recipes, tags, collections, drafts, members). */
  group: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
  members: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.groupMembers(groupId) }),
  invites: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "group", groupId, "invites"] }),
  recipes: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.recipesRoot(groupId) }),
  recipe: (qc: QueryClient, groupId: string, recipeId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.recipe(groupId, recipeId) }),
  tags: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.tags(groupId) }),
  collections: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.collections(groupId) }),
  collection: (qc: QueryClient, groupId: string, collectionId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.collection(groupId, collectionId) }),
  importDrafts: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.importDraftsRoot(groupId) }),
  importDraft: (qc: QueryClient, groupId: string, draftId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.importDraft(groupId, draftId) }),
  cards: (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.cards() }),
  shoppingLists: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.shoppingLists(groupId) }),
  shoppingList: (qc: QueryClient, groupId: string, listId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.shoppingList(groupId, listId) }),
  /** Every range fetched for the group — a prefix, so any mounted week refetches. */
  planRoot: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.planRoot(groupId) }),
  planShopping: (qc: QueryClient, groupId: string, listId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.planShopping(groupId, listId) }),
  boughtHistory: (qc: QueryClient, groupId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "group", groupId, "shopping-bought"] }),
  catalogPage: (qc: QueryClient, groupId: string, listId: string) =>
    qc.invalidateQueries({ queryKey: [ROOT, "group", groupId, "shopping-catalog", listId] }),
} as const;

/**
 * After creating/updating/deleting a recipe: refresh the lists, the recipe itself
 * and the tag/collection counts that depend on it.
 *
 * `invalidate.me` is in this `Promise.all` because the sidebar and the group
 * switcher read `recipeCount` off `["toon","me"]` (there is no
 * `GET …/summary` endpoint — R23), so without it the count sticks at yesterday's
 * number after every new recipe.
 */
export async function invalidateAfterRecipeMutation(
  qc: QueryClient,
  groupId: string,
  recipeId?: string,
): Promise<void> {
  await Promise.all([
    invalidate.recipes(qc, groupId),
    invalidate.tags(qc, groupId),
    invalidate.collections(qc, groupId),
    invalidate.groups(qc),
    invalidate.me(qc),
    recipeId ? invalidate.recipe(qc, groupId, recipeId) : Promise.resolve(),
  ]);
}

/**
 * After creating/moving/deleting a plan entry: refresh every mounted range for the
 * group (`planRoot` is a prefix) and the shopping list's own "from this week's
 * plan" diff, which is stale the moment a recipe is added to or removed from the
 * week. Does NOT touch `invalidate.recipes` — planning a recipe does not change the
 * recipe itself, only the week it sits in.
 */
export async function invalidateAfterPlanMutation(qc: QueryClient, groupId: string): Promise<void> {
  await Promise.all([
    invalidate.planRoot(qc, groupId),
    qc.invalidateQueries({ queryKey: [ROOT, "group", groupId, "plan-shopping"] }),
  ]);
}
