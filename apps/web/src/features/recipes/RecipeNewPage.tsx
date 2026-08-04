/**
 * RecipeNewPage — creates a recipe with `RecipeForm`.
 *
 * The image upload endpoint needs an existing recipe id, so a picked photo is uploaded
 * right after the recipe was created and the recipe is then patched with the returned
 * URL. A failing upload does NOT fail the whole save — the recipe is kept and the user
 * gets a toast telling them to try the photo again.
 */
import { useMemo } from "react";
import { Button, ErrorState } from "@/components/ui";
import { useToast } from "@/components/ui";
import { useActiveGroup } from "@/lib/session";
import { useTags } from "@/features/tags/lib/queries";
import { useCollections } from "@/features/collections/lib/queries";
import { AppLink, useAppNavigate } from "./lib/nav";
import { emptyRecipeForm } from "./lib/formState";
import { useCreateRecipe, useUpdateRecipe, useUploadRecipeImage } from "./lib/queries";
import { RecipeForm, type RecipeFormSubmit } from "./components/RecipeForm";

export default function RecipeNewPage() {
  const { groupId } = useActiveGroup();
  const navigate = useAppNavigate();
  const toast = useToast();

  const tags = useTags(groupId);
  const collections = useCollections(groupId);
  const createRecipe = useCreateRecipe(groupId);
  const uploadImage = useUploadRecipeImage(groupId);
  // No id is bound here — it is passed per call, because the recipe only exists
  // after `createRecipe` resolved (React state would still be stale at that point).
  const patchRecipe = useUpdateRecipe(groupId);

  const initialValues = useMemo(() => emptyRecipeForm(), []);
  const pending = createRecipe.isPending || uploadImage.isPending || patchRecipe.isPending;

  async function submit({ payload, file }: RecipeFormSubmit) {
    const recipe = await createRecipe.mutateAsync(payload);

    if (file) {
      try {
        const upload = await uploadImage.mutateAsync({ recipeId: recipe.id, file });
        await patchRecipe.mutateAsync({ recipeId: recipe.id, imageUrl: upload.url });
      } catch (error) {
        toast.fromError(
          error,
          "Rezept gespeichert, das Foto konnte aber nicht hochgeladen werden",
        );
        navigate({ to: "/recipes/$recipeId", params: { recipeId: recipe.id }, replace: true });
        return;
      }
    }

    toast.success("Rezept angelegt", recipe.title);
    navigate({ to: "/recipes/$recipeId", params: { recipeId: recipe.id }, replace: true });
  }

  if (groupId === null) {
    return (
      <ErrorState
        title="Keine aktive Gruppe"
        description="Wähle oben eine Gruppe aus oder lege eine neue an, um Rezepte zu speichern."
        action={
          <AppLink to="/groups">
            <Button variant="secondary">Zu den Gruppen</Button>
          </AppLink>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-fg">Neues Rezept</h1>
      <RecipeForm
        initialValues={initialValues}
        availableTags={tags.data ?? []}
        availableCollections={collections.data ?? []}
        onSubmit={submit}
        onCancel={() => navigate({ to: "/" })}
        submitLabel="Rezept speichern"
        pending={pending}
        error={createRecipe.error ?? patchRecipe.error}
        imageHint="Wird direkt nach dem Speichern hochgeladen."
      />
    </div>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { RecipeNewPage };
