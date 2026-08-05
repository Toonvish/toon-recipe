/**
 * ShoppingListsPage — the group's shopping lists ("Einkaufslisten").
 *
 * Several named lists per group, because one household shops in more than one place:
 * "Rewe", "Drogerie", "Getränkemarkt".
 *
 * Creating, renaming and deleting a list needs a connection (see the note in
 * lib/offline.ts), so this screen — unlike the list detail — really is read-only
 * offline, and says so.
 */
import { useState } from "react";
import { ListPlus, Pencil, ShoppingBasket, Trash2 } from "lucide-react";
import { CreateShoppingListRequestSchema, type ShoppingList } from "@toon/shared";
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
  useToast,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useActiveGroup, useSession } from "@/lib/session";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { AppLink } from "@/features/recipes/lib/nav";
import {
  useCreateShoppingList,
  useDeleteShoppingList,
  useRenameShoppingList,
  useShoppingLists,
} from "./lib/queries";

export default function ShoppingListsPage() {
  const t = useT();
  const { groupId } = useActiveGroup();
  const { isOnline } = useSession();
  const lists = useShoppingLists(groupId);

  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<ShoppingList | null>(null);
  const [deleting, setDeleting] = useState<ShoppingList | null>(null);

  const items = lists.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg">
            {t("shopping.lists.heading")}
          </h1>
          <p className="text-sm text-fg-muted">{t("shopping.lists.subtitle")}</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          leftIcon={<ListPlus className="size-4" />}
          disabled={!isOnline}
          title={isOnline ? undefined : t("shopping.lists.offlineHint")}
        >
          {t("shopping.lists.create")}
        </Button>
      </header>

      {lists.isPending ? (
        <ul className="flex flex-col gap-3">
          {[0, 1].map((index) => (
            <li key={index}>
              <Card className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </Card>
            </li>
          ))}
        </ul>
      ) : lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBasket />}
          title={t("shopping.lists.empty.title")}
          description={t("shopping.lists.empty.description")}
          action={
            <Button onClick={() => setCreateOpen(true)} fullWidth disabled={!isOnline}>
              {t("shopping.lists.empty.action")}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((list) => (
            <li key={list.id} className="relative">
              <AppLink
                to="/shopping/$listId"
                params={{ listId: list.id }}
                className="flex min-h-[4.5rem] items-center gap-3 rounded-card border border-line bg-surface py-3 pr-24 pl-4 text-fg shadow-card transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
                  <ShoppingBasket aria-hidden="true" className="size-5" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-display truncate text-lg font-semibold">{list.name}</span>
                  <span className="text-sm text-fg-muted">
                    {list.itemCount === 0
                      ? t("shopping.list.empty")
                      : t("shopping.list.itemCount", { count: list.itemCount ?? 0 })}
                  </span>
                </span>
              </AppLink>
              <span className="absolute inset-y-0 right-2 flex items-center gap-1">
                <IconButton
                  label={t("shopping.lists.rename")}
                  variant="ghost"
                  icon={<Pencil />}
                  disabled={!isOnline}
                  onClick={() => setRenaming(list)}
                />
                <IconButton
                  label={t("shopping.lists.delete")}
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={!isOnline}
                  onClick={() => setDeleting(list)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      <CreateListDialog open={createOpen} onClose={() => setCreateOpen(false)} groupId={groupId} />
      <RenameListDialog list={renaming} onClose={() => setRenaming(null)} groupId={groupId} />
      <DeleteListDialog list={deleting} onClose={() => setDeleting(null)} groupId={groupId} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* dialogs                                                                    */
/* -------------------------------------------------------------------------- */

function CreateListDialog({
  open,
  onClose,
  groupId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string | null;
}) {
  const t = useT();
  const toast = useToast();
  const create = useCreateShoppingList(groupId);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const close = () => {
    setName("");
    setErrors({});
    onClose();
  };

  const submit = () => {
    const result = validate(CreateShoppingListRequestSchema, { name });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    create.mutate(result.data, {
      onSuccess: (list) => {
        toast.success(t("shopping.create.success", { name: list.name }));
        close();
      },
      onError: (error) => setErrors(apiFieldErrors(error)),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("shopping.create.title")}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("shopping.action.cancel")}
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {t("shopping.action.create")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          label={t("shopping.list.name.label")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("shopping.list.name.placeholder")}
          error={errors.name}
          autoFocus
        />
      </form>
    </Dialog>
  );
}

function RenameListDialog({
  list,
  onClose,
  groupId,
}: {
  list: ShoppingList | null;
  onClose: () => void;
  groupId: string | null;
}) {
  const t = useT();
  const rename = useRenameShoppingList(groupId);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Seeded from the row each time the dialog opens.
  const open = list !== null;
  const currentName = list?.name ?? "";
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (open && seededFor !== list.id) {
    setSeededFor(list.id);
    setName(currentName);
    setErrors({});
  }

  const submit = () => {
    if (!list) return;
    const result = validate(CreateShoppingListRequestSchema, { name });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    rename.mutate(
      { listId: list.id, name: result.data.name },
      { onSuccess: onClose, onError: (error) => setErrors(apiFieldErrors(error)) },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("shopping.rename.title")}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("shopping.action.cancel")}
          </Button>
          <Button onClick={submit} loading={rename.isPending}>
            {t("shopping.action.save")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          label={t("shopping.list.name.label")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          autoFocus
        />
      </form>
    </Dialog>
  );
}

function DeleteListDialog({
  list,
  onClose,
  groupId,
}: {
  list: ShoppingList | null;
  onClose: () => void;
  groupId: string | null;
}) {
  const t = useT();
  const toast = useToast();
  const remove = useDeleteShoppingList(groupId);

  return (
    <ConfirmDialog
      open={list !== null}
      onClose={onClose}
      title={t("shopping.delete.title")}
      description={
        list
          ? t("shopping.delete.confirmDescription", {
              name: list.name,
              itemCount: t("shopping.list.itemCount", { count: list.itemCount ?? 0 }),
            })
          : ""
      }
      confirmLabel={t("shopping.action.delete")}
      destructive
      onConfirm={async () => {
        if (!list) return;
        try {
          await remove.mutateAsync(list.id);
          toast.success(t("shopping.delete.success", { name: list.name }));
        } catch (error) {
          toast.error(t("shopping.delete.error"), errorMessage(error));
          // Rethrow so ConfirmDialog keeps itself open on failure.
          throw error;
        }
      }}
    />
  );
}
