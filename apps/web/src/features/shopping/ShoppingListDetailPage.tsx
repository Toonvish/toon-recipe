/**
 * ShoppingListDetailPage — the screen you actually hold in a supermarket.
 *
 * Design rules this screen follows, in priority order:
 *
 *  1. **One-handed and offline.** Every item is a large card whose whole surface checks
 *     it off, and every edit works with no signal: the mutations are queued and
 *     replayed (features/shopping/lib/offline.ts), so this screen never disables itself
 *     for being offline the way the rest of the app does.
 *     Below `sm` that card is a TILE in a two-column grid (`ShoppingItemTile`): a name
 *     in large type, one muted subtitle, no source and no buttons, with a long press
 *     opening `ItemDetailDialog` for the rest. From `sm` up it is the wider
 *     `ShoppingItemCard` row with its edit/remove buttons in place. The branch is JS
 *     (`useIsWideViewport`) and not `sm:hidden`, because rendering both would give every
 *     item two check-off buttons and read it twice to a screen reader.
 *  2. **Checked items LEAVE the list** and reappear as one-tap chips under "Häufig
 *     gekauft", so the list only ever shows what is still missing.
 *  3. **No optimistic flicker.** Adding merges locally with the same algebra the server
 *     uses, so "200 g Mehl" onto an existing 200 g line reads 400 g immediately and does
 *     not jump when the response lands.
 *
 * `useCanMutate()` is deliberately NOT used here — it reports false when offline, which
 * is the opposite of what this feature needs. Its OTHER half is used, though:
 * `useEmailVerificationBlock()` is the one condition under which this screen does go
 * read-only, because the server answers 403 to an unconfirmed account's writes and a
 * queued mutation that can never succeed would just fail again on every reconnect.
 */
import { useState } from "react";
import { CheckCheck, ChevronLeft, MailWarning, Trash2, WifiOff } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";
import type { ShoppingItem } from "@toon/shared";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Skeleton,
  useToast,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { useActiveGroup, useEmailVerificationBlock, useSession } from "@/lib/session";
import { useIsWideViewport } from "@/lib/viewport";
import { AppLink, useRouteParam } from "@/features/recipes/lib/nav";
import { AddItemBar } from "./components/AddItemBar";
import { EditItemDialog } from "./components/EditItemDialog";
import { FrequentlyUsed } from "./components/FrequentlyUsed";
import { ItemDetailDialog } from "./components/ItemDetailDialog";
import { ShoppingItemCard } from "./components/ShoppingItemCard";
import { ShoppingItemTile } from "./components/ShoppingItemTile";
import {
  useAddShoppingItems,
  useAddShoppingSuggestion,
  useCheckShoppingItem,
  useClearShoppingList,
  useDismissShoppingSuggestion,
  useRemoveShoppingItem,
  useShoppingList,
  useUpdateShoppingItem,
} from "./lib/queries";

export default function ShoppingListDetailPage() {
  const t = useT();
  const { groupId } = useActiveGroup();
  const { isOnline } = useSession();
  const unverified = useEmailVerificationBlock();
  const canMutate = unverified === undefined;
  const listId = useRouteParam("listId") ?? "";
  const toast = useToast();
  const wide = useIsWideViewport();

  const list = useShoppingList(groupId, listId);
  const add = useAddShoppingItems(groupId ?? "", listId);
  const check = useCheckShoppingItem(groupId ?? "", listId);
  const remove = useRemoveShoppingItem(groupId ?? "", listId);
  const update = useUpdateShoppingItem(groupId ?? "", listId);
  const clear = useClearShoppingList(groupId ?? "", listId);
  const suggestion = useAddShoppingSuggestion(groupId ?? "", listId);
  const dismiss = useDismissShoppingSuggestion(groupId ?? "", listId);

  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  /**
   * The tile whose long press opened the detail sheet (phones only). Held as an ID and
   * looked up again on every render, so the sheet follows a merge and closes itself
   * when the line leaves the list — a captured snapshot would keep rendering a row that
   * no longer exists.
   */
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  /** How many writes are still waiting to reach the server. */
  const queued = useIsMutating({ mutationKey: ["toon", "shopping"] });

  const detail = list.data;
  const items = detail?.items ?? [];
  const detailsItem = items.find((item) => item.id === detailsId) ?? null;

  if (list.isPending && !detail) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        {/* Same shape as the branch below, or the list visibly jumps when data lands. */}
        <div className={wide ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className={cn("w-full rounded-card", wide ? "h-18" : "h-24")} />
          ))}
        </div>
      </div>
    );
  }

  // A hard error with nothing cached. With a cached copy the list renders instead: it
  // is exactly the "no signal in the shop" case this screen exists for.
  if (list.isError && !detail) {
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  }
  if (!detail) return null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-4 flex flex-col gap-2">
        <AppLink
          to="/shopping"
          className="inline-flex w-fit items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("shopping.detail.backToLists")}
        </AppLink>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-display truncate text-2xl font-semibold text-fg">
              {detail.list.name}
            </h1>
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              {items.length === 0
                ? t("shopping.detail.allDone")
                : t("shopping.list.itemCount", { count: items.length })}
              {queued > 0 ? (
                <span className="inline-flex items-center gap-1 text-warning-soft-fg">
                  <WifiOff aria-hidden="true" className="size-3.5" />
                  {t("shopping.detail.queuedCount", { count: queued })}
                </span>
              ) : null}
            </p>
          </div>
          {items.length > 0 && canMutate ? (
            <IconButton
              label={t("shopping.detail.clearList")}
              variant="ghost"
              icon={<Trash2 />}
              onClick={() => setClearOpen(true)}
            />
          ) : null}
        </div>
      </header>

      {/* The unconfirmed-address notice wins over the offline one: offline is
          temporary and this screen keeps working through it, while the 403 does
          not resolve itself by finding a signal. */}
      {unverified !== undefined ? (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-soft-fg">
          <MailWarning aria-hidden="true" className="size-4 shrink-0" />
          {unverified}
        </p>
      ) : !isOnline ? (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-soft-fg">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          {t("shopping.detail.offlineBanner")}
        </p>
      ) : null}

      <div className="flex-1">
        {items.length === 0 ? (
          <EmptyState
            icon={<CheckCheck />}
            title={t("shopping.detail.empty.title")}
            description={
              detail.catalog.length > 0
                ? t("shopping.detail.empty.descriptionWithCatalog")
                : t("shopping.detail.empty.description")
            }
          />
        ) : wide ? (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <ShoppingItemCard
                key={item.id}
                item={item}
                canMutate={canMutate}
                onCheck={check.check}
                onRemove={remove.remove}
                onEdit={setEditing}
              />
            ))}
          </ul>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <ShoppingItemTile
                  key={item.id}
                  item={item}
                  canMutate={canMutate}
                  onCheck={check.check}
                  onOpenDetails={(target) => setDetailsId(target.id)}
                />
              ))}
            </ul>
            {/* The press-and-hold is the tile's only route to the amount, the note and
                the edit/remove actions, and nothing on the tile advertises it. */}
            <p className="mt-2 text-xs text-fg-muted">{t("shopping.item.longPressHint")}</p>
          </>
        )}

        <FrequentlyUsed
          entries={detail.catalog}
          canMutate={canMutate}
          onAdd={(entry) => suggestion.addSuggestion(entry.id, entry.name)}
          onDismiss={(entryId) =>
            dismiss.mutate(entryId, {
              onError: (error) =>
                toast.error(t("shopping.suggestion.dismissError"), errorMessage(error)),
            })
          }
        />
      </div>

      <AddItemBar onAdd={(newItems) => add.add(newItems)} disabled={!canMutate} />

      <ItemDetailDialog
        item={detailsItem}
        canMutate={canMutate}
        onClose={() => setDetailsId(null)}
        onCheck={check.check}
        onEdit={setEditing}
        onRemove={remove.remove}
      />

      <EditItemDialog
        item={editing}
        siblings={items}
        onClose={() => setEditing(null)}
        onSave={update.update}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title={t("shopping.clear.title")}
        description={t("shopping.clear.description", {
          itemCount: t("shopping.list.itemCount", { count: items.length }),
          sectionName: t("shopping.frequentlyUsed.heading"),
        })}
        confirmLabel={t("shopping.action.clear")}
        destructive
        onConfirm={() => {
          clear.clear();
        }}
      />
    </div>
  );
}
