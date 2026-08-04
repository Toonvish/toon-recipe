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
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type {
  ImportDraftListQuery,
  PaginationQuery,
  RecipeListQuery,
} from "@toon/shared";
import {
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
  fetchRecipe,
  fetchRecipes,
  fetchScaledRecipe,
  fetchSessions,
  fetchTags,
  isApiError,
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
} as const;

/**
 * After creating/updating/deleting a recipe: refresh the lists, the recipe itself
 * and the tag/collection counts that depend on it.
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
    recipeId ? invalidate.recipe(qc, groupId, recipeId) : Promise.resolve(),
  ]);
}
