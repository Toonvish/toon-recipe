/**
 * One line on a shopping list, as a LARGE row. **Desktop only** — from `sm` up;
 * a phone gets the two-column grid of `ShoppingItemTile` instead, and
 * `ShoppingListDetailPage` renders one or the other, never both.
 *
 * Sizing is the whole point: this is read and tapped one-handed, possibly with a
 * trolley in the other hand. So the row is ~72px tall, the ENTIRE row is the check-off
 * button (not a small checkbox), and the secondary actions sit in their own >=44px
 * targets that stop the click from reaching it.
 *
 * Checking off REMOVES the line (it reappears under "Häufig gekauft"), so the visual
 * feedback is a beat of green rather than a strikethrough — there is nothing left to
 * strike through. It used to be a filled checkbox square; that square was the only
 * checkbox left in the feature and it read as "tick me" next to a card whose whole
 * surface already does that, so the tint carries it alone now.
 */
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { formatQuantity, formatShoppingAmount, isVagueAmount, type ShoppingItem } from "@toon/shared";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { isPendingItemId } from "../lib/offline";

export interface ShoppingItemCardProps {
  item: ShoppingItem;
  onCheck: (itemId: string) => void;
  onEdit: (item: ShoppingItem) => void;
  onRemove: (itemId: string) => void;
  /** False while the group is read-only for this user (see useCanMutate). */
  canMutate: boolean;
}

export function ShoppingItemCard({
  item,
  onCheck,
  onEdit,
  onRemove,
  canMutate,
}: ShoppingItemCardProps) {
  const t = useT();
  /**
   * Purely visual: the row leaves the list as soon as the optimistic update lands, so
   * without a beat of "ticked" feedback the item would simply vanish under the thumb.
   */
  const [ticking, setTicking] = useState(false);

  // A line that only exists optimistically has no server id yet, so editing or
  // deleting it by id would 404. Checking it off is fine — the queue is ordered.
  const pending = isPendingItemId(item.id);
  const amount = formatShoppingAmount(item, formatQuantity);
  const vague = isVagueAmount(item);

  const check = () => {
    if (!canMutate || ticking) return;
    setTicking(true);
    onCheck(item.id);
  };

  return (
    <li className="relative">
      <button
        type="button"
        onClick={check}
        disabled={!canMutate}
        aria-label={t("shopping.item.checkAriaLabel", { name: item.name })}
        className={cn(
          "flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-3 text-left",
          "min-h-[4.5rem] transition-[background-color,border-color,opacity] duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "active:bg-surface-2 disabled:opacity-60 sm:min-h-16 sm:px-4",
          ticking && "border-success bg-success-soft opacity-70",
          // Room for the action buttons that overlay the right edge.
          canMutate && !pending ? "pr-24" : "pr-4",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {amount ? (
              <span
                className={cn(
                  "text-base font-semibold tabular-nums sm:text-[1.05rem]",
                  vague ? "text-fg-muted" : "text-fg",
                )}
              >
                {amount}
              </span>
            ) : null}
            <span className="text-base leading-snug font-medium break-words text-fg sm:text-[1.05rem]">
              {item.name}
            </span>
          </span>

          {item.note ? (
            <span className="text-sm text-fg-muted">{item.note}</span>
          ) : null}

          {item.sources.length > 0 ? (
            <span className="truncate text-xs text-fg-muted">
              {t("shopping.item.sources", {
                sources: item.sources.map((source) => source.title).join(", "),
              })}
            </span>
          ) : null}
        </span>
      </button>

      {canMutate && !pending ? (
        <span className="absolute inset-y-0 right-2 flex items-center gap-1">
          <IconButton
            label={t("shopping.item.edit")}
            variant="ghost"
            onClick={() => onEdit(item)}
            icon={<Pencil />}
          />
          <IconButton
            label={t("shopping.item.remove")}
            variant="ghost"
            onClick={() => onRemove(item.id)}
            icon={<Trash2 />}
          />
        </span>
      ) : null}
    </li>
  );
}
