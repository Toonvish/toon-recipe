/**
 * RecipeEditPage — edits an existing recipe with the same `RecipeForm`.
 *
 * `ingredients`/`steps`/`tags`/`collectionIds` are replace-all in a PATCH, which is
 * exactly what the form produces, so the whole payload can be sent as-is.
 * A picked photo is uploaded first and its URL wins over a manually typed one.
 */
import { useMemo } from "react";
import type { RecipeDetail } from "@toon/shared";
import { ErrorState, LoadingBlock, buttonClasses } from "@/components/ui";
import { useToast } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useActiveGroup, useCurrentUser } from "@/lib/session";
import { useTags } from "@/features/tags/lib/queries";
import { useCollections } from "@/features/collections/lib/queries";
import { AppLink, useAppNavigate, useRouteParam } from "./lib/nav";
import { canModifyOwn } from "./lib/permissions";
import { recipeToForm } from "./lib/formState";
import { useRecipe, useUpdateRecipe, useUploadRecipeImage } from "./lib/queries";
import { RecipeForm, type RecipeFormSubmit } from "./components/RecipeForm";

export default function RecipeEditPage() {
  const t = useT();
  const recipeId = useRouteParam("recipeId");
  const { groupId, role } = useActiveGroup();
  const user = useCurrentUser();
  const navigate = useAppNavigate();
  const toast = useToast();

  const query = useRecipe(groupId, recipeId);
  const loaded = query.data;
  const tags = useTags(groupId);
  const collections = useCollections(groupId);
  const updateRecipe = useUpdateRecipe(groupId, recipeId);
  const uploadImage = useUploadRecipeImage(groupId);

  const initialValues = useMemo(() => (loaded ? recipeToForm(loaded) : null), [loaded]);

  if (query.isPending) return <LoadingBlock label={t("recipes.detail.loading")} />;

  if (query.isError || !loaded || !initialValues) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <AppLink to="/" className={buttonClasses({ variant: "secondary" })}>
            {t("recipes.action.backToList")}
          </AppLink>
        }
      />
    );
  }

  // Non-optional alias so the async submit handler closes over a narrowed value.
  const recipe: RecipeDetail = loaded;

  // The API rejects this too (403) — showing it early avoids a pointless form.
  if (!canModifyOwn(role, user.id, recipe.createdBy)) {
    return (
      <ErrorState
        title={t("recipes.edit.forbidden.title")}
        description={t("recipes.edit.forbidden.description")}
        action={
          <AppLink
            to="/recipes/$recipeId"
            params={{ recipeId: recipe.id }}
            className={buttonClasses({ variant: "secondary" })}
          >
            {t("recipes.action.backToRecipe")}
          </AppLink>
        }
      />
    );
  }

  const pending = updateRecipe.isPending || uploadImage.isPending;

  async function submit({ payload, file }: RecipeFormSubmit) {
    let imageUrl = payload.imageUrl ?? null;

    if (file) {
      try {
        const upload = await uploadImage.mutateAsync({ recipeId: recipe.id, file });
        imageUrl = upload.url;
      } catch (error) {
        toast.fromError(error, t("recipes.edit.photoUploadFailedToast"));
        return;
      }
    }

    await updateRecipe.mutateAsync({ ...payload, imageUrl });
    toast.success(t("recipes.edit.savedToast"));
    navigate({ to: "/recipes/$recipeId", params: { recipeId: recipe.id }, replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">{t("recipes.edit.title")}</h1>
        <p className="truncate text-sm text-fg-muted">{recipe.title}</p>
      </div>
      <RecipeForm
        initialValues={initialValues}
        availableTags={tags.data ?? []}
        availableCollections={collections.data ?? []}
        onSubmit={submit}
        onCancel={() =>
          navigate({ to: "/recipes/$recipeId", params: { recipeId: recipe.id } })
        }
        submitLabel={t("recipes.edit.submit")}
        pending={pending}
        error={updateRecipe.error}
      />
    </div>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { RecipeEditPage };
