/**
 * CollectionsPage — list and create collections ("Sammlungen") of the active group.
 */
import { useState } from "react";
import { FolderPlus, Library, Plus } from "lucide-react";
import { CreateCollectionRequestSchema } from "@toon/shared";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/ui";
import { plural } from "@/lib/format";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { useActiveGroup } from "@/lib/session";
import { AppLink } from "@/features/recipes/lib/nav";
import { useCollections, useCreateCollection } from "./lib/queries";

export default function CollectionsPage() {
  const { groupId } = useActiveGroup();
  const collections = useCollections(groupId);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg">Sammlungen</h1>
          <p className="text-sm text-fg-muted">
            Bündle Rezepte thematisch, z. B. „Weihnachten“ oder „Meal Prep“.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>
          Sammlung anlegen
        </Button>
      </header>

      {collections.isPending ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <li key={index}>
              <Card padding="md" className="flex flex-col gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </Card>
            </li>
          ))}
        </ul>
      ) : collections.isError ? (
        <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
      ) : (collections.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Library />}
          title="Noch keine Sammlungen"
          description="Eine Sammlung ist eine geordnete Liste von Rezepten — perfekt für Menüs oder Wochenpläne."
          action={
            <Button
              onClick={() => setCreateOpen(true)}
              fullWidth
              leftIcon={<FolderPlus className="size-4" />}
            >
              Erste Sammlung anlegen
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(collections.data ?? []).map((collection) => (
            <li key={collection.id} className="flex">
              <AppLink
                to="/collections/$collectionId"
                params={{ collectionId: collection.id }}
                className="flex w-full flex-col gap-1 rounded-card border border-line bg-surface p-4 text-fg shadow-card transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="font-display text-lg font-semibold">{collection.name}</span>
                {collection.description ? (
                  <span className="line-clamp-2 text-sm text-fg-muted">
                    {collection.description}
                  </span>
                ) : null}
                <span className="mt-auto pt-2 text-sm text-fg-subtle">
                  {plural(collection.recipeCount ?? 0, "Rezept", "Rezepte")}
                </span>
              </AppLink>
            </li>
          ))}
        </ul>
      )}

      <CreateCollectionDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateCollectionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { groupId } = useActiveGroup();
  const createCollection = useCreateCollection(groupId);
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function close() {
    setName("");
    setDescription("");
    setErrors({});
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(CreateCollectionRequestSchema, {
      name,
      description: description.trim().length > 0 ? description : null,
      recipeIds: [],
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const collection = await createCollection.mutateAsync(result.data);
      toast.success("Sammlung angelegt", collection.name);
      close();
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Neue Sammlung" size="sm">
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
          placeholder="Weihnachtsbäckerei"
          error={errors.name}
          disabled={createCollection.isPending}
          autoFocus
        />
        <Textarea
          label="Beschreibung"
          optional
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          disabled={createCollection.isPending}
        />
        <div className="mt-1 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            fullWidth
            disabled={createCollection.isPending}
          >
            Abbrechen
          </Button>
          <Button type="submit" loading={createCollection.isPending} fullWidth>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { CollectionsPage };
