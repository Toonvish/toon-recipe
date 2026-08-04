/** TanStack Query hooks for group tags. Keys come from `@/lib/queries`. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTagRequest, Tag, UpdateTagRequest } from "@toon/shared";
import { createTag, deleteTag, updateTag } from "@/lib/api";
import { invalidate, tagsQuery } from "@/lib/queries";

/** Tag list of the active group, unwrapped to `Tag[]`. */
export function useTags(groupId: string | null) {
  const options = tagsQuery(groupId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== null,
    select: (response) => response.items,
  });
}

export function useCreateTag(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<Tag, Error, CreateTagRequest>({
    mutationFn: async (input) => {
      const response = await createTag(groupId ?? "", input);
      return response.tag;
    },
    onSuccess: async () => {
      if (groupId) await invalidate.tags(client, groupId);
    },
  });
}

export interface UpdateTagInput extends UpdateTagRequest {
  tagId: string;
}

export function useUpdateTag(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<Tag, Error, UpdateTagInput>({
    mutationFn: async ({ tagId, ...patch }) => {
      const response = await updateTag(groupId ?? "", tagId, patch);
      return response.tag;
    },
    onSuccess: async () => {
      if (!groupId) return;
      await Promise.all([invalidate.tags(client, groupId), invalidate.recipes(client, groupId)]);
    },
  });
}

export function useDeleteTag(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (tagId) => deleteTag(groupId ?? "", tagId),
    onSuccess: async () => {
      if (!groupId) return;
      await Promise.all([invalidate.tags(client, groupId), invalidate.recipes(client, groupId)]);
    },
  });
}
