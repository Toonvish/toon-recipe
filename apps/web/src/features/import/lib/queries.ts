/**
 * TanStack Query bindings for the import feature. Query keys live here so the
 * pages never build keys inline.
 */
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type {
  CommitImportDraftRequest,
  CommitImportDraftResponse,
  ImportDraft,
  ImportDraftStatus,
  ParsedRecipe,
  Tag,
} from "@toon/shared";
import {
  commitDraft,
  deleteDraft,
  getDraft,
  isImportApiError,
  listDrafts,
  listGroupTags,
  patchDraft,
  ImportApiError,
} from "./importApi";

export const importKeys = {
  all: ["import"] as const,
  drafts: (groupId: string, status?: ImportDraftStatus) => ["import", "drafts", groupId, status ?? "all"] as const,
  draft: (draftId: string) => ["import", "draft", draftId] as const,
  tags: (groupId: string) => ["import", "tags", groupId] as const,
};

/** 401/403/404/422 are permanent — retrying them only delays the message. */
function retryPolicy(failureCount: number, error: unknown): boolean {
  if (isImportApiError(error) && !error.retryable) return false;
  return failureCount < 2;
}

export function useDraftList(
  groupId: string | undefined,
  status: ImportDraftStatus | undefined = "pending",
  limit = 20,
): UseQueryResult<{ items: ImportDraft[]; total: number }, unknown> {
  return useQuery({
    queryKey: importKeys.drafts(groupId ?? "none", status),
    enabled: typeof groupId === "string" && groupId.length > 0,
    retry: retryPolicy,
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      const response = await listDrafts(groupId!, { status, limit }, signal);
      return { items: response.items, total: response.total };
    },
  });
}

export interface ResolvedDraft {
  draft: ImportDraft;
  /** Group the draft actually lives in — may differ from the active group. */
  groupId: string;
}

/**
 * Loads a draft. The draft id alone is not enough for the API (endpoints are
 * group-scoped), so we try the active group first and then the user's other
 * groups. That makes a shared link or a stale active-group selection work
 * instead of showing a bogus 404.
 */
export function useDraft(
  draftId: string | undefined,
  candidateGroupIds: readonly string[],
): UseQueryResult<ResolvedDraft, unknown> {
  return useQuery({
    queryKey: [...importKeys.draft(draftId ?? "none"), candidateGroupIds.join(",")],
    enabled: typeof draftId === "string" && draftId.length > 0 && candidateGroupIds.length > 0,
    retry: retryPolicy,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      let lastError: unknown;
      for (const groupId of candidateGroupIds) {
        try {
          const draft = await getDraft(groupId, draftId!, signal);
          return { draft, groupId };
        } catch (error) {
          if (isImportApiError(error) && (error.kind === "not_found" || error.kind === "forbidden")) {
            lastError = error;
            continue;
          }
          throw error;
        }
      }
      throw (
        lastError ??
        new ImportApiError({
          kind: "not_found",
          code: "not_found",
          status: 404,
          message: "Entwurf nicht gefunden",
          hint: "Dieser Import-Entwurf existiert in keiner deiner Gruppen.",
          retryable: false,
        })
      );
    },
  });
}

export function useGroupTags(groupId: string | undefined): UseQueryResult<Tag[], unknown> {
  return useQuery({
    queryKey: importKeys.tags(groupId ?? "none"),
    enabled: typeof groupId === "string" && groupId.length > 0,
    retry: retryPolicy,
    staleTime: 60_000,
    queryFn: ({ signal }) => listGroupTags(groupId!, signal),
  });
}

export interface SaveDraftInput {
  groupId: string;
  draftId: string;
  parsed: ParsedRecipe;
  status?: ImportDraft["status"];
}

export function useSaveDraft(): UseMutationResult<ImportDraft, unknown, SaveDraftInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, draftId, parsed, status }: SaveDraftInput) =>
      patchDraft(groupId, draftId, status === undefined ? { parsed } : { parsed, status }),
    onSuccess: (draft) => {
      queryClient.setQueriesData<ResolvedDraft>({ queryKey: importKeys.draft(draft.id) }, (previous) =>
        previous === undefined ? previous : { ...previous, draft },
      );
    },
  });
}

export interface CommitDraftInput extends CommitImportDraftRequest {
  groupId: string;
  draftId: string;
}

export function useCommitDraft(): UseMutationResult<CommitImportDraftResponse, unknown, CommitDraftInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, draftId, ...body }: CommitDraftInput) => commitDraft(groupId, draftId, body),
    onSuccess: (_response, variables) => {
      void queryClient.invalidateQueries({ queryKey: importKeys.drafts(variables.groupId, "pending") });
      void queryClient.invalidateQueries({ queryKey: importKeys.all });
      // The shell owns the recipe query keys, so invalidate by shape instead of
      // importing them (keeps this feature decoupled from src/lib/queries.ts).
      void queryClient.invalidateQueries({
        predicate: (query) => JSON.stringify(query.queryKey).toLowerCase().includes("recipe"),
      });
    },
  });
}

export interface DeleteDraftInput {
  groupId: string;
  draftId: string;
}

export function useDeleteDraft(): UseMutationResult<void, unknown, DeleteDraftInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, draftId }: DeleteDraftInput) => deleteDraft(groupId, draftId),
    onSuccess: (_result, variables) => {
      queryClient.removeQueries({ queryKey: importKeys.draft(variables.draftId) });
      void queryClient.invalidateQueries({ queryKey: importKeys.drafts(variables.groupId, "pending") });
      void queryClient.invalidateQueries({ queryKey: importKeys.all });
    },
  });
}
