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
import { healthQuery } from "@/lib/queries";
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

/**
 * Whether THIS server offers PHOTO import (`features.ocrImport` on
 * `/api/health`). A deployment can be built without tesseract to stay small — see
 * IMPORT_OCR_ENABLED — and then those uploads answer 501, so the UI must not
 * offer them.
 *
 * UNKNOWN COUNTS AS UNAVAILABLE, deliberately. While the probe is in flight, or
 * when it failed (offline, or a server predating the field), this returns false:
 * briefly not showing a button that does work is self-correcting, whereas showing
 * one that cannot work sends the user through an upload to a 501. The answer only
 * changes on redeploy, so it is cached like a list and refetched rarely.
 */
export function useOcrImportAvailable(): boolean {
  const { data } = useQuery(healthQuery());
  return data?.features?.ocrImport === true;
}

/**
 * Whether THIS server offers PDF import (`features.pdfImport`).
 *
 * A SEPARATE ANSWER FROM {@link useOcrImportAvailable}, because the small build
 * runs photos and withholds PDFs — one core cannot OCR ten scanned pages inside
 * the server's 60 s deadline. Same unknown-is-unavailable bias, which also covers
 * a server old enough to predate the field: it advertises `ocrImport` alone, so
 * PDF import hides until it is upgraded. Self-correcting, and the safe direction.
 */
export function usePdfImportAvailable(): boolean {
  const { data } = useQuery(healthQuery());
  return data?.features?.pdfImport === true;
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
          // Keys, not `translate()` output: this error is thrown from a query
          // function and can be rendered much later, in a different locale.
          title: { key: "import.queries.draftNotFound.message" },
          hint: { key: "import.queries.draftNotFound.hint" },
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
