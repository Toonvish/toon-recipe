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
import { plural } from "@/lib/format";
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

  if (query.isPending) return <LoadingBlock label="Sammlung wird geladen …" />;

  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <AppLink to="/collections" className={buttonClasses({ variant: "secondary" })}>
            Zu den Sammlungen
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
    setStatus(`Rezept an Position ${target + 1} verschoben.`);
    reorder.mutate(
      { collectionId: collection.id, recipeIds: next.map((recipe) => recipe.id) },
      {
        onError: (error) => {
          toast.fromError(error, "Reihenfolge konnte nicht gespeichert werden");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <AppLink to="/collections" className="text-sm text-fg-muted hover:text-fg">
          ← Alle Sammlungen
        </AppLink>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-fg">{collection.name}</h1>
            {collection.description ? (
              <p className="mt-1 text-fg-muted">{collection.description}</p>
            ) : null}
            <p className="mt-1 text-sm text-fg-subtle">
              {plural(order.length, "Rezept", "Rezepte")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setAddOpen(true)}
              leftIcon={<ListPlus className="size-4" />}
            >
              Rezepte hinzufügen
            </Button>
            <IconButton
              label="Sammlung bearbeiten"
              icon={<Pencil />}
              variant="surface"
              onClick={() => setEditOpen(true)}
            />
            <IconButton
              label="Sammlung löschen"
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
          title="Diese Sammlung ist leer"
          description="Füge Rezepte hinzu, um sie hier in deiner gewünschten Reihenfolge zu sehen."
          action={
            <Button onClick={() => setAddOpen(true)} fullWidth leftIcon={<ListPlus className="size-4" />}>
              Rezepte hinzufügen
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
                <Card padding="sm" className="flex items-center gap-3">
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
                  <div className="min-w-0 flex-1">
                    <AppLink
                      to="/recipes/$recipeId"
                      params={{ recipeId: recipe.id }}
                      className="block truncate font-medium text-fg hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {recipe.title}
                    </AppLink>
                    {time ? <p className="text-sm text-fg-muted">{time}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={`${recipe.title} nach oben`}
                      icon={<ArrowUp />}
                      size="sm"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || reorder.isPending}
                    />
                    <IconButton
                      label={`${recipe.title} nach unten`}
                      icon={<ArrowDown />}
                      size="sm"
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1 || reorder.isPending}
                    />
                    <IconButton
                      label={`${recipe.title} aus Sammlung entfernen`}
                      icon={<X />}
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        try {
                          await removeRecipe.mutateAsync({
                            collectionId: collection.id,
                            recipeId: recipe.id,
                          });
                          setStatus(`${recipe.title} entfernt.`);
                        } catch (error) {
                          toast.fromError(error, "Entfernen fehlgeschlagen");
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
        title="Sammlung löschen?"
        description={`„${collection.name}“ wird gelöscht. Die Rezepte selbst bleiben erhalten.`}
        confirmLabel="Löschen"
        onConfirm={async () => {
          try {
            await deleteCollection.mutateAsync(collection.id);
            toast.success("Sammlung gelöscht");
            navigate({ to: "/collections", replace: true });
          } catch (error) {
            toast.fromError(error, "Löschen fehlgeschlagen");
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
      toast.success("Sammlung gespeichert");
      setErrors({});
      onClose();
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Sammlung bearbeiten" size="sm">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {errors._form ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors._form}
          </p>
        ) : null}
        <Input
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          disabled={updateCollection.isPending}
        />
        <Textarea
          label="Beschreibung"
          optional
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          disabled={updateCollection.isPending}
        />
        <div className="mt-1 flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} fullWidth>
            Abbrechen
          </Button>
          <Button
            type="submit"
            loading={updateCollection.isPending}
            fullWidth
            leftIcon={<Save className="size-4" />}
          >
            Speichern
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
      title="Rezepte hinzufügen"
      description="Suche ein Rezept und tippe darauf, um es an das Ende der Sammlung zu setzen."
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          label="Suche"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Titel oder Zutat …"
          autoComplete="off"
        />

        {list.isPending ? (
          <LoadingBlock label="Rezepte werden geladen …" />
        ) : list.isError ? (
          <ErrorState inline error={list.error} onRetry={() => void list.refetch()} />
        ) : recipes.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">Keine Rezepte gefunden.</p>
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
                        toast.success("Hinzugefügt", recipe.title);
                      } catch (error) {
                        toast.fromError(error, "Hinzufügen fehlgeschlagen");
                      }
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-1 py-2 text-left hover:bg-surface-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-fg">{recipe.title}</span>
                    {already ? (
                      <span className="inline-flex items-center gap-1 text-sm text-success">
                        <Check aria-hidden="true" className="size-4" />
                        Enthalten
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
          Fertig
        </Button>
      </div>
    </Dialog>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { CollectionDetailPage };
