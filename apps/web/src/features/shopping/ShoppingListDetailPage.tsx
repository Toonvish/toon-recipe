/**
 * ShoppingListDetailPage — the screen you actually hold in a supermarket.
 *
 * Design rules this screen follows, in priority order:
 *
 *  1. **One-handed and offline.** Every item is a large card whose whole surface checks
 *     it off, and every edit works with no signal: the mutations are queued and
 *     replayed (features/shopping/lib/offline.ts), so this screen never disables itself
 *     for being offline the way the rest of the app does.
 *  2. **Checked items LEAVE the list** and reappear as one-tap chips under "Häufig
 *     gekauft", so the list only ever shows what is still missing.
 *  3. **No optimistic flicker.** Adding merges locally with the same algebra the server
 *     uses, so "200 g Mehl" onto an existing 200 g line reads 400 g immediately and does
 *     not jump when the response lands.
 *
 * `useCanMutate()` is deliberately NOT used here — it reports false when offline, which
 * is the opposite of what this feature needs.
 */
import { useState } from "react";
import { CheckCheck, ChevronLeft, Trash2, WifiOff } from "lucide-react";
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
import { plural } from "@/lib/format";
import { useActiveGroup, useSession } from "@/lib/session";
import { AppLink, useRouteParam } from "@/features/recipes/lib/nav";
import { AddItemBar } from "./components/AddItemBar";
import { EditItemDialog } from "./components/EditItemDialog";
import { FrequentlyUsed } from "./components/FrequentlyUsed";
import { ShoppingItemCard } from "./components/ShoppingItemCard";
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
  const { groupId } = useActiveGroup();
  const { isOnline } = useSession();
  const listId = useRouteParam("listId") ?? "";
  const toast = useToast();

  const list = useShoppingList(groupId, listId);
  const add = useAddShoppingItems(groupId ?? "", listId);
  const check = useCheckShoppingItem(groupId ?? "", listId);
  const remove = useRemoveShoppingItem(groupId ?? "", listId);
  const update = useUpdateShoppingItem(groupId ?? "", listId);
  const clear = useClearShoppingList(groupId ?? "", listId);
  const suggestion = useAddShoppingSuggestion(groupId ?? "", listId);
  const dismiss = useDismissShoppingSuggestion(groupId ?? "", listId);

  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  /** How many writes are still waiting to reach the server. */
  const queued = useIsMutating({ mutationKey: ["toon", "shopping"] });

  const detail = list.data;
  const items = detail?.items ?? [];

  if (list.isPending && !detail) {
    return (
      <div className="flex flex-col gap-3 pb-tabbar">
        <Skeleton className="h-8 w-48" />
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-18 w-full rounded-card" />
        ))}
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
    <div className="flex min-h-full flex-col pb-tabbar">
      <header className="mb-4 flex flex-col gap-2">
        <AppLink
          to="/shopping"
          className="inline-flex w-fit items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Alle Listen
        </AppLink>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-display truncate text-2xl font-semibold text-fg">
              {detail.list.name}
            </h1>
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              {items.length === 0 ? "Alles erledigt" : plural(items.length, "Position", "Positionen")}
              {queued > 0 ? (
                <span className="inline-flex items-center gap-1 text-warning-soft-fg">
                  <WifiOff aria-hidden="true" className="size-3.5" />
                  {plural(queued, "Änderung wartet", "Änderungen warten")}
                </span>
              ) : null}
            </p>
          </div>
          {items.length > 0 ? (
            <IconButton
              label="Liste leeren"
              variant="ghost"
              icon={<Trash2 />}
              onClick={() => setClearOpen(true)}
            />
          ) : null}
        </div>
      </header>

      {!isOnline ? (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-soft-fg">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          Offline — Abhaken und Hinzufügen funktionieren trotzdem und werden später
          synchronisiert.
        </p>
      ) : null}

      <div className="flex-1">
        {items.length === 0 ? (
          <EmptyState
            icon={<CheckCheck />}
            title="Nichts mehr zu kaufen"
            description={
              detail.catalog.length > 0
                ? "Tippe unten auf einen Vorschlag oder gib etwas Neues ein."
                : "Füge unten Artikel hinzu — oder schicke ein ganzes Rezept aus der Rezeptansicht hierher."
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <ShoppingItemCard
                key={item.id}
                item={item}
                canMutate
                onCheck={check.check}
                onRemove={remove.remove}
                onEdit={setEditing}
              />
            ))}
          </ul>
        )}

        <FrequentlyUsed
          entries={detail.catalog}
          canMutate
          onAdd={(entry) => suggestion.addSuggestion(entry.id, entry.name)}
          onDismiss={(entryId) =>
            dismiss.mutate(entryId, {
              onError: (error) =>
                toast.error("Vorschlag bleibt bestehen", errorMessage(error)),
            })
          }
        />
      </div>

      <AddItemBar onAdd={(newItems) => add.add(newItems)} />

      <EditItemDialog
        item={editing}
        siblings={items}
        onClose={() => setEditing(null)}
        onSave={update.update}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Liste leeren?"
        description={`Alle ${plural(items.length, "Position", "Positionen")} werden entfernt. „Häufig gekauft“ bleibt erhalten.`}
        confirmLabel="Leeren"
        destructive
        onConfirm={() => {
          clear.clear();
        }}
      />
    </div>
  );
}
