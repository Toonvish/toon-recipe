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
import { useT } from "@/lib/i18n";
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
  const t = useT();
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
          <h1 className="font-display text-2xl font-semibold text-fg">{t("groups.tags.title")}</h1>
          <p className="text-sm text-fg-muted">{t("groups.tags.subtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>
          {t("groups.tags.create")}
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
          title={t("groups.tags.emptyTitle")}
          description={t("groups.tags.emptyDescription")}
          action={
            <Button onClick={() => setCreateOpen(true)} fullWidth leftIcon={<Plus className="size-4" />}>
              {t("groups.tags.create")}
            </Button>
          }
          secondaryAction={<AppLink to="/">{t("groups.tags.toRecipeList")}</AppLink>}
        />
      ) : (
        <Card padding="none">
          <ul className="flex flex-col divide-y divide-line">
            {(tags.data ?? []).map((tag) => (
              <li key={tag.id} className="flex items-center gap-3 p-3">
                <TagChip tag={tag} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                  {t("groups.count.recipes", { count: tag.recipeCount ?? 0 })}
                </span>
                <IconButton
                  label={t("groups.tags.editLabel", { name: tag.name })}
                  icon={<Pencil />}
                  size="sm"
                  onClick={() => setEditing(tag)}
                />
                {canDelete ? (
                  <IconButton
                    label={t("groups.tags.deleteLabel", { name: tag.name })}
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
        title={t("groups.tags.deleteConfirmTitle")}
        description={
          pendingDelete
            ? t("groups.tags.deleteConfirmDescription", {
                name: pendingDelete.name,
                count: pendingDelete.recipeCount ?? 0,
              })
            : undefined
        }
        confirmLabel={t("groups.common.delete")}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteTag.mutateAsync(pendingDelete.id);
            toast.success(t("groups.tags.deletedToast"), pendingDelete.name);
          } catch (error) {
            toast.fromError(error, t("groups.tags.deleteFailedToast"));
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
  const t = useT();
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
        toast.success(t("groups.tags.savedToast"), result.data.name);
      } else {
        await createTag.mutateAsync(result.data);
        toast.success(t("groups.tags.createdToast"), result.data.name);
      }
      onClose();
    } catch (error) {
      if (isApiError(error) && error.code === "tag_name_taken") {
        setErrors({ name: t("groups.tags.nameTakenError") });
        return;
      }
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tag ? t("groups.tags.editTitle") : t("groups.tags.createTitle")}
      size="sm"
    >
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
          placeholder={t("groups.tags.namePlaceholder")}
          error={errors.name}
          disabled={pending}
          autoFocus
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t("groups.tags.colorLegend")}</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor("")}
              aria-pressed={color === ""}
              aria-label={t("groups.tags.noColorAriaLabel")}
              className="tap flex items-center justify-center rounded-full border border-line bg-surface-2 px-3 text-sm text-fg-muted"
            >
              {color === "" ? <Check aria-hidden="true" className="size-4" /> : null}
              {t("groups.tags.noColor")}
            </button>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                aria-pressed={color.toLowerCase() === preset}
                aria-label={t("groups.tags.colorAriaLabel", { hex: preset })}
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
            label={t("groups.tags.customHexLabel")}
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
          <span className="text-sm text-fg-muted">{t("groups.tags.previewLabel")}</span>
          <TagChip
            tag={{
              name: name.trim().length > 0 ? name : t("groups.tags.previewName"),
              color: color || null,
            }}
          />
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
            {t("groups.common.cancel")}
          </Button>
          <Button type="submit" loading={pending} fullWidth>
            {tag ? t("groups.common.save") : t("groups.common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { TagsPage };
