/**
 * CollectionDetailPage — the recipes of one collection in their stored order, with
 * add/remove and touch-friendly reordering (up/down buttons, never drag & drop).
 *
 * Reordering is optimistic in the local list and then persisted by
 * `useReorderCollectionRecipes`, which has to re-add all memberships because the API has
 * no "set position" endpoint (see the comment there).
 */
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ListPlus,
  Pencil,
  Save,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { UpdateCollectionRequestSchema, type RecipeListItem } from "@toon/shared";
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingBlock,
  Textarea,
  buttonClasses,
} from "@/components/ui";
import { useToast } from "@/components/ui";
import { thumbnailUrl } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { useActiveGroup } from "@/lib/session";
import { AppLink, useAppNavigate, useRouteParam } from "@/features/recipes/lib/nav";
import { moveItem, useDebouncedValue } from "@/features/recipes/lib/hooks";
import { optionalMinutes } from "@/features/recipes/lib/format";
import { useRecipeList, flattenPages } from "@/features/recipes/lib/queries";
import {
  useAddRecipeToCollection,
  useCollection,
  useDeleteCollection,
  useRemoveRecipeFromCollection,
  useReorderCollectionRecipes,
  useUpdateCollection,
} from "./lib/queries";

export default function CollectionDetailPage() {
  const t = useT();
  const collectionId = useRouteParam("collectionId");
  const { groupId } = useActiveGroup();
  const navigate = useAppNavigate();
  const toast = useToast();

  const query = useCollection(groupId, collectionId);
  const removeRecipe = useRemoveRecipeFromCollection(groupId);
  const reorder = useReorderCollectionRecipes(groupId);
  const deleteCollection = useDeleteCollection(groupId);

  const [order, setOrder] = useState<RecipeListItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState("");

  // Mirror the server order locally so up/down feels instant.
  useEffect(() => {
    if (query.data) setOrder(query.data.recipes);
  }, [query.data]);

  if (query.isPending) return <LoadingBlock label={t("groups.collectionDetail.loading")} />;

  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <AppLink to="/collections" className={buttonClasses({ variant: "secondary" })}>
            {t("groups.collectionDetail.backToList")}
          </AppLink>
        }
      />
    );
  }

  const { collection } = query.data;

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = moveItem(order, index, target);
    setOrder(next);
    setStatus(t("groups.collectionDetail.movedStatus", { position: target + 1 }));
    reorder.mutate(
      { collectionId: collection.id, recipeIds: next.map((recipe) => recipe.id) },
      {
        onError: (error) => {
          toast.fromError(error, t("groups.collectionDetail.reorderFailedToast"));
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <AppLink to="/collections" className="text-sm text-fg-muted hover:text-fg">
          {t("groups.collectionDetail.backLink")}
        </AppLink>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-fg">{collection.name}</h1>
            {collection.description ? (
              <p className="mt-1 text-fg-muted">{collection.description}</p>
            ) : null}
            <p className="mt-1 text-sm text-fg-subtle">
              {t("groups.count.recipes", { count: order.length })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setAddOpen(true)}
              leftIcon={<ListPlus className="size-4" />}
            >
              {t("groups.collectionDetail.addRecipes")}
            </Button>
            <IconButton
              label={t("groups.collectionDetail.editLabel")}
              icon={<Pencil />}
              variant="surface"
              onClick={() => setEditOpen(true)}
            />
            <IconButton
              label={t("groups.collectionDetail.deleteLabel")}
              icon={<Trash2 />}
              variant="danger"
              onClick={() => setConfirmDelete(true)}
            />
          </div>
        </div>
      </header>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {order.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed />}
          title={t("groups.collectionDetail.emptyTitle")}
          description={t("groups.collectionDetail.emptyDescription")}
          action={
            <Button onClick={() => setAddOpen(true)} fullWidth leftIcon={<ListPlus className="size-4" />}>
              {t("groups.collectionDetail.addRecipes")}
            </Button>
          }
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {order.map((recipe, index) => {
            const image = thumbnailUrl(recipe);
            // Same fallback as RecipeCard, so a legacy row without totalMinutes
            // does not show a time in the list and nothing here.
            const time = optionalMinutes(
              recipe.totalMinutes ?? recipe.cookMinutes ?? recipe.prepMinutes,
            );
            return (
              <li key={recipe.id}>
                {/*
                  Below `sm` the three reorder controls take 116px of a 390px phone and
                  the title was left with ~100px, truncating after a handful of letters.
                  So the phone layout is a grid whose action row sits UNDERNEATH, and only
                  from `sm` does everything share one line. `minmax(0,1fr)` for the text
                  track, never a bare `1fr`.
                */}
                <Card
                  padding="sm"
                  className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:flex"
                >
                  <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-fg-subtle">
                    {index + 1}
                  </span>
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className="size-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-subtle">
                      <UtensilsCrossed aria-hidden="true" className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 sm:flex-1">
                    <AppLink
                      to="/recipes/$recipeId"
                      params={{ recipeId: recipe.id }}
                      className="block font-medium text-fg hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring line-clamp-2 sm:truncate sm:line-clamp-none"
                    >
                      {recipe.title}
                    </AppLink>
                    {time ? <p className="text-sm text-fg-muted">{time}</p> : null}
                  </div>
                  <div className="col-span-3 flex shrink-0 items-center justify-end gap-1 sm:col-span-1">
                    <IconButton
                      label={t("groups.collectionDetail.moveUpLabel", { title: recipe.title })}
                      icon={<ArrowUp />}
                      size="sm"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || reorder.isPending}
                    />
                    <IconButton
                      label={t("groups.collectionDetail.moveDownLabel", { title: recipe.title })}
                      icon={<ArrowDown />}
                      size="sm"
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1 || reorder.isPending}
                    />
                    <IconButton
                      label={t("groups.collectionDetail.removeLabel", { title: recipe.title })}
                      icon={<X />}
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        try {
                          await removeRecipe.mutateAsync({
                            collectionId: collection.id,
                            recipeId: recipe.id,
                          });
                          setStatus(t("groups.collectionDetail.removedStatus", { title: recipe.title }));
                        } catch (error) {
                          toast.fromError(error, t("groups.collectionDetail.removeFailedToast"));
                        }
                      }}
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <EditCollectionDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        collectionId={collection.id}
        name={collection.name}
        description={collection.description ?? ""}
      />

      <AddRecipesDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        collectionId={collection.id}
        existingIds={order.map((recipe) => recipe.id)}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        destructive
        title={t("groups.collectionDetail.deleteConfirmTitle")}
        description={t("groups.collectionDetail.deleteConfirmDescription", {
          name: collection.name,
        })}
        confirmLabel={t("groups.common.delete")}
        onConfirm={async () => {
          try {
            await deleteCollection.mutateAsync(collection.id);
            toast.success(t("groups.collectionDetail.deletedToast"));
            navigate({ to: "/collections", replace: true });
          } catch (error) {
            toast.fromError(error, t("groups.collectionDetail.deleteFailedToast"));
            throw error;
          }
        }}
      />
    </div>
  );
}

function EditCollectionDialog({
  open,
  onClose,
  collectionId,
  name: initialName,
  description: initialDescription,
}: {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  name: string;
  description: string;
}) {
  const t = useT();
  const { groupId } = useActiveGroup();
  const updateCollection = useUpdateCollection(groupId);
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
  }, [initialName, initialDescription, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(UpdateCollectionRequestSchema, {
      name,
      description: description.trim().length > 0 ? description : null,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      await updateCollection.mutateAsync({ collectionId, ...result.data });
      toast.success(t("groups.collectionDetail.savedToast"));
      setErrors({});
      onClose();
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("groups.collectionDetail.editTitle")} size="sm">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {errors._form ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors._form}
          </p>
        ) : null}
        <Input
          label={t("groups.common.name")}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          disabled={updateCollection.isPending}
        />
        <Textarea
          label={t("groups.common.description")}
          optional
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          disabled={updateCollection.isPending}
        />
        <div className="mt-1 flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} fullWidth>
            {t("groups.common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={updateCollection.isPending}
            fullWidth
            leftIcon={<Save className="size-4" />}
          >
            {t("groups.common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AddRecipesDialog({
  open,
  onClose,
  collectionId,
  existingIds,
}: {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  existingIds: readonly string[];
}) {
  const t = useT();
  const { groupId } = useActiveGroup();
  const addRecipe = useAddRecipeToCollection(groupId);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  // Only query while the dialog is actually open.
  const list = useRecipeList(open ? groupId : null, { q: debounced, sort: "title", limit: 50 });
  const recipes = flattenPages(list.data);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("groups.collectionDetail.addDialogTitle")}
      description={t("groups.collectionDetail.addDialogDescription")}
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          label={t("groups.collectionDetail.searchLabel")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("groups.collectionDetail.searchPlaceholder")}
          autoComplete="off"
        />

        {list.isPending ? (
          <LoadingBlock label={t("groups.collectionDetail.loadingRecipes")} />
        ) : list.isError ? (
          <ErrorState inline error={list.error} onRetry={() => void list.refetch()} />
        ) : recipes.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">
            {t("groups.collectionDetail.noRecipesFound")}
          </p>
        ) : (
          <ul className="flex max-h-[50vh] flex-col divide-y divide-line overflow-y-auto">
            {recipes.map((recipe) => {
              const already = existingIds.includes(recipe.id);
              return (
                <li key={recipe.id}>
                  <button
                    type="button"
                    disabled={already || addRecipe.isPending}
                    onClick={async () => {
                      try {
                        await addRecipe.mutateAsync({ collectionId, recipeId: recipe.id });
                        toast.success(t("groups.collectionDetail.addedToast"), recipe.title);
                      } catch (error) {
                        toast.fromError(error, t("groups.collectionDetail.addFailedToast"));
                      }
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-1 py-2 text-left hover:bg-surface-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-fg">{recipe.title}</span>
                    {already ? (
                      <span className="inline-flex items-center gap-1 text-sm text-success">
                        <Check aria-hidden="true" className="size-4" />
                        {t("groups.collectionDetail.included")}
                      </span>
                    ) : (
                      <ListPlus aria-hidden="true" className="size-4 text-fg-subtle" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="secondary" onClick={onClose} fullWidth>
          {t("groups.collectionDetail.done")}
        </Button>
      </div>
    </Dialog>
  );
}

/** Named export as well, for the feature barrel; the router imports the default. */
export { CollectionDetailPage };
