/**
 * TagsPage — manage the tags of the active group: create, rename, recolour, delete.
 * Deleting is admin-only (docs/API.md); the button is hidden otherwise and a 403 that
 * slips through is shown as a toast.
 */
import { useState } from "react";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { CreateTagRequestSchema, type Tag } from "@toon/shared";
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/ui";
import { plural } from "@/lib/format";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { useActiveGroup } from "@/lib/session";
import { isApiError } from "@/lib/api";
import { hasAtLeast } from "@/features/recipes/lib/permissions";
import { AppLink } from "@/features/recipes/lib/nav";
import { TagChip } from "./components/TagChip";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from "./lib/queries";

/** A small, food-appropriate default palette; users can type any hex value. */
const PRESET_COLORS = [
  "#c2532c",
  "#d99a24",
  "#5b8040",
  "#2f6f7d",
  "#6b4f9e",
  "#c0392b",
  "#8d7c67",
  "#3f6212",
] as const;

export default function TagsPage() {
  const { groupId, role } = useActiveGroup();
  const tags = useTags(groupId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const deleteTag = useDeleteTag(groupId);
  const toast = useToast();
  const canDelete = hasAtLeast(role, "admin");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg">Tags</h1>
          <p className="text-sm text-fg-muted">
            Tags gehören zur Gruppe und lassen sich in der Rezeptliste als Filter nutzen.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>
          Tag anlegen
        </Button>
      </header>

      {tags.isPending ? (
        <Card padding="md">
          <Skeleton lines={4} />
        </Card>
      ) : tags.isError ? (
        <ErrorState error={tags.error} onRetry={() => void tags.refetch()} />
      ) : (tags.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Tags />}
          title="Noch keine Tags"
          description="Tags entstehen automatisch, wenn du sie beim Anlegen eines Rezepts eintippst — oder du legst sie hier vorab an."
          action={
            <Button onClick={() => setCreateOpen(true)} fullWidth leftIcon={<Plus className="size-4" />}>
              Tag anlegen
            </Button>
          }
          secondaryAction={<AppLink to="/">Zur Rezeptliste</AppLink>}
        />
      ) : (
        <Card padding="none">
          <ul className="flex flex-col divide-y divide-line">
            {(tags.data ?? []).map((tag) => (
              <li key={tag.id} className="flex items-center gap-3 p-3">
                <TagChip tag={tag} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                  {plural(tag.recipeCount ?? 0, "Rezept", "Rezepte")}
                </span>
                <IconButton
                  label={`Tag ${tag.name} bearbeiten`}
                  icon={<Pencil />}
                  size="sm"
                  onClick={() => setEditing(tag)}
                />
                {canDelete ? (
                  <IconButton
                    label={`Tag ${tag.name} löschen`}
                    icon={<Trash2 />}
                    size="sm"
                    variant="danger"
                    onClick={() => setPendingDelete(tag)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TagDialog open={createOpen} onClose={() => setCreateOpen(false)} tag={null} />
      <TagDialog open={editing !== null} onClose={() => setEditing(null)} tag={editing} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        destructive
        title="Tag löschen?"
        description={
          pendingDelete
            ? `„${pendingDelete.name}“ wird von allen ${plural(pendingDelete.recipeCount ?? 0, "Rezept", "Rezepten")} entfernt. Die Rezepte selbst bleiben erhalten.`
            : undefined
        }
        confirmLabel="Löschen"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteTag.mutateAsync(pendingDelete.id);
            toast.success("Tag gelöscht", pendingDelete.name);
          } catch (error) {
            toast.fromError(error, "Löschen fehlgeschlagen");
            throw error;
          }
        }}
      />
    </div>
  );
}

/** Create + edit in one dialog: `tag === null` means "create". */
function TagDialog({
  open,
  onClose,
  tag,
}: {
  open: boolean;
  onClose: () => void;
  tag: Tag | null;
}) {
  const { groupId } = useActiveGroup();
  const createTag = useCreateTag(groupId);
  const updateTag = useUpdateTag(groupId);
  const toast = useToast();

  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  // Re-seed when a different tag is opened.
  const [seededFor, setSeededFor] = useState<string | null>(tag?.id ?? null);
  if (open && seededFor !== (tag?.id ?? null)) {
    setSeededFor(tag?.id ?? null);
    setName(tag?.name ?? "");
    setColor(tag?.color ?? "");
    setErrors({});
  }

  const pending = createTag.isPending || updateTag.isPending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(CreateTagRequestSchema, {
      name,
      ...(color.trim().length > 0 ? { color: color.trim() } : {}),
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      if (tag) {
        await updateTag.mutateAsync({ tagId: tag.id, ...result.data });
        toast.success("Tag gespeichert", result.data.name);
      } else {
        await createTag.mutateAsync(result.data);
        toast.success("Tag angelegt", result.data.name);
      }
      onClose();
    } catch (error) {
      if (isApiError(error) && error.code === "tag_name_taken") {
        setErrors({ name: "Diesen Tag gibt es in der Gruppe schon." });
        return;
      }
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tag ? "Tag bearbeiten" : "Neuer Tag"}
      size="sm"
    >
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
          placeholder="Vegetarisch"
          error={errors.name}
          disabled={pending}
          autoFocus
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">Farbe</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor("")}
              aria-pressed={color === ""}
              aria-label="Keine Farbe"
              className="tap flex items-center justify-center rounded-full border border-line bg-surface-2 px-3 text-sm text-fg-muted"
            >
              {color === "" ? <Check aria-hidden="true" className="size-4" /> : null}
              Standard
            </button>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                aria-pressed={color.toLowerCase() === preset}
                aria-label={`Farbe ${preset}`}
                style={{ backgroundColor: preset }}
                className="flex size-11 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {color.toLowerCase() === preset ? (
                  <Check aria-hidden="true" className="size-5" />
                ) : null}
              </button>
            ))}
          </div>
          <Input
            label="Eigener Hex-Wert"
            optional
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="#e11d48"
            error={errors.color}
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
          />
        </fieldset>

        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-muted">Vorschau:</span>
          <TagChip tag={{ name: name.trim().length > 0 ? name : "Beispiel", color: color || null }} />
        </div>

        <div className="mt-1 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            fullWidth
            disabled={pending}
            leftIcon={<X className="size-4" />}
          >
            Abbrechen
          </Button>
          <Button type="submit" loading={pending} fullWidth>
            {tag ? "Speichern" : "Anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { TagsPage };
