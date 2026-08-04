/**
 * Recipe mutations + the infinite list query.
 *
 * Read queries reuse the shell's `queryOptions` factories and key layout from
 * `@/lib/queries` so cache invalidation stays consistent across features.
 * The list endpoint is paginated (`{items,total,limit,offset}`), which `queryOptions`
 * cannot express, so the infinite variant is built here on the SAME key prefix.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateRecipeRequest,
  Difficulty,
  RecipeDetail,
  RecipeListItem,
  RecipeListResponse,
  RecipeSort,
  UpdateRecipeRequest,
  UploadResponse,
} from "@toon/shared";
import { createRecipe, deleteRecipe, fetchRecipes, updateRecipe, uploadRecipeImage } from "@/lib/api";
import {
  invalidate,
  invalidateAfterRecipeMutation,
  queryKeys,
  recipeQuery,
  recipeScaleQuery,
  STALE_TIME,
} from "@/lib/queries";

export const RECIPE_PAGE_SIZE = 24;

/** UI-side filter state of the recipe list screen. */
export interface RecipeListFilters {
  q?: string;
  /** Tag ids — sent to the API as a comma-separated list; a recipe must carry all. */
  tagIds?: readonly string[];
  collectionId?: string;
  maxMinutes?: number;
  difficulty?: Difficulty;
  sort?: RecipeSort;
  limit?: number;
}

/** Filters in the wire shape the API and the query key expect. */
function toQuery(filters: RecipeListFilters) {
  return {
    q: filters.q && filters.q.trim().length > 0 ? filters.q.trim() : undefined,
    tags: filters.tagIds && filters.tagIds.length > 0 ? [...filters.tagIds].sort().join(",") : undefined,
    collectionId: filters.collectionId,
    maxMinutes: filters.maxMinutes,
    difficulty: filters.difficulty,
    sort: filters.sort ?? ("newest" as RecipeSort),
    limit: filters.limit ?? RECIPE_PAGE_SIZE,
  };
}

export type RecipePage = RecipeListResponse;

/**
 * Paginated recipe list ("Mehr laden" advances `offset`).
 * The key is the shell's `queryKeys.recipes(groupId, filters)`, so
 * `invalidate.recipes(qc, groupId)` refreshes it.
 */
export function useRecipeList(groupId: string | null, filters: RecipeListFilters) {
  const wire = toQuery(filters);
  return useInfiniteQuery<RecipePage, Error, { pages: RecipePage[] }, readonly unknown[], number>({
    queryKey: groupId ? queryKeys.recipes(groupId, wire) : ["toon", "recipes", "disabled"],
    enabled: groupId !== null,
    staleTime: STALE_TIME.list,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchRecipes(groupId ?? "", { ...wire, offset: pageParam }, { signal }),
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.items.length;
      return next < lastPage.total ? next : undefined;
    },
  });
}

/** Flattens the infinite-query pages into one list. */
export function flattenPages(data: { pages: RecipePage[] } | undefined): RecipeListItem[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page.items);
}

export function totalCount(data: { pages: RecipePage[] } | undefined): number {
  return data?.pages[0]?.total ?? 0;
}

/** Recipe detail. Unwraps `{ recipe }` so screens deal with `RecipeDetail`. */
export function useRecipe(groupId: string | null, recipeId: string | undefined) {
  const options = recipeQuery(groupId ?? "", recipeId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== null && recipeId !== undefined && recipeId.length > 0,
    select: (response) => response.recipe,
  });
}

/**
 * Server-side scaler. The detail screen scales locally with `scaleIngredients` for the
 * live stepper (no round-trip per tap); this hook is used where the server's rounding is
 * authoritative, e.g. before copying a scaled list.
 */
export function useScaledRecipe(
  groupId: string | null,
  recipeId: string | undefined,
  servings: number | undefined,
  enabled = true,
) {
  const options = recipeScaleQuery(groupId ?? "", recipeId ?? "", servings ?? 1);
  return useQuery({
    ...options,
    enabled:
      enabled &&
      groupId !== null &&
      recipeId !== undefined &&
      typeof servings === "number" &&
      servings > 0,
  });
}

export function useCreateRecipe(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<RecipeDetail, Error, CreateRecipeRequest>({
    mutationFn: async (input) => {
      const response = await createRecipe(groupId ?? "", input);
      return response.recipe;
    },
    onSuccess: async (recipe) => {
      if (!groupId) return;
      client.setQueryData(queryKeys.recipe(groupId, recipe.id), { recipe });
      await invalidateAfterRecipeMutation(client, groupId, recipe.id);
    },
  });
}

export interface UpdateRecipeInput extends UpdateRecipeRequest {
  /**
   * Overrides the id bound when the hook was created. Needed right after a create,
   * where the new id is not in React state yet.
   */
  recipeId?: string;
}

export function useUpdateRecipe(groupId: string | null, recipeId?: string) {
  const client = useQueryClient();
  return useMutation<RecipeDetail, Error, UpdateRecipeInput>({
    mutationFn: async ({ recipeId: override, ...patch }) => {
      const target = override ?? recipeId;
      if (!target) throw new Error("useUpdateRecipe: keine recipeId übergeben.");
      const response = await updateRecipe(groupId ?? "", target, patch);
      return response.recipe;
    },
    onSuccess: async (recipe) => {
      if (!groupId) return;
      client.setQueryData(queryKeys.recipe(groupId, recipe.id), { recipe });
      await invalidateAfterRecipeMutation(client, groupId, recipe.id);
    },
  });
}

export function useDeleteRecipe(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (recipeId) => deleteRecipe(groupId ?? "", recipeId),
    onSuccess: async (_result, recipeId) => {
      if (!groupId) return;
      client.removeQueries({ queryKey: queryKeys.recipe(groupId, recipeId) });
      await invalidateAfterRecipeMutation(client, groupId);
    },
  });
}

export interface UploadRecipeImageInput {
  recipeId: string;
  file: File;
}

export function useUploadRecipeImage(groupId: string | null) {
  const client = useQueryClient();
  return useMutation<UploadResponse, Error, UploadRecipeImageInput>({
    mutationFn: ({ recipeId, file }) => uploadRecipeImage(groupId ?? "", recipeId, file),
    onSuccess: async (_result, { recipeId }) => {
      if (!groupId) return;
      await Promise.all([
        invalidate.recipe(client, groupId, recipeId),
        invalidate.recipes(client, groupId),
      ]);
    },
  });
}

/** Payload for "Duplizieren" — everything except identity and timestamps. */
export function duplicatePayload(recipe: RecipeDetail): CreateRecipeRequest {
  return {
    title: `${recipe.title} (Kopie)`,
    description: recipe.description ?? null,
    imageUrl: recipe.imageUrl ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
    sourceName: recipe.sourceName ?? null,
    servingsAmount: recipe.servingsAmount ?? null,
    servingsUnit: recipe.servingsUnit ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    totalMinutes: recipe.totalMinutes ?? null,
    difficulty: recipe.difficulty ?? null,
    rating: recipe.rating ?? null,
    notes: recipe.notes ?? null,
    language: recipe.language ?? null,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      position: index,
      section: ingredient.section ?? null,
      quantity: ingredient.quantity ?? null,
      quantityMax: ingredient.quantityMax ?? null,
      unit: ingredient.unit ?? null,
      name: ingredient.name,
      note: ingredient.note ?? null,
      raw: ingredient.raw,
    })),
    steps: recipe.steps.map((step, index) => ({
      position: index,
      section: step.section ?? null,
      text: step.text,
    })),
    tags: recipe.tags.map((tag) => tag.name),
    collectionIds: [...recipe.collectionIds],
  };
}
