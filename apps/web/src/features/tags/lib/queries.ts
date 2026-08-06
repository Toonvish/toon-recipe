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

/**
 * Renaming or deleting a tag changes what every recipe CARD shows, so the recipe
 * list has to go too — creating one does not, which is why `useCreateTag` above
 * invalidates less.
 */
function invalidateTagsAndRecipes(
  client: ReturnType<typeof useQueryClient>,
  groupId: string,
): Promise<unknown> {
  return Promise.all([invalidate.tags(client, groupId), invalidate.recipes(client, groupId)]);
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
      await invalidateTagsAndRecipes(client, groupId);
    },
  });
}

export function useDeleteTag(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (tagId) => deleteTag(groupId ?? "", tagId),
    onSuccess: async () => {
      if (!groupId) return;
      await invalidateTagsAndRecipes(client, groupId);
    },
  });
}
