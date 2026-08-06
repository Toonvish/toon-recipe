/**
 * Everything the phone tile leaves out, one long press away.
 *
 * `ShoppingItemTile` shows a name and a one-line subtitle and nothing else — no
 * source, no actions. This sheet is where the rest of the row lives: the amount, the
 * note, the recipes the line was merged from, and the three things you can do to it.
 *
 * Like `ActionMenu`, it CLOSES BEFORE IT ACTS and defers the callback by a frame: two
 * of the three actions open another dialog (`EditItemDialog`) or remove the item this
 * sheet is rendering, and running them while the panel is still mounted means either
 * two stacked sheets or a render against a row that no longer exists.
 */
import { Check, Pencil, Trash2 } from "lucide-react";
import { formatQuantity, formatShoppingAmount, type ShoppingItem } from "@toon/shared";
import { Button, Dialog } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { isPendingItemId } from "../lib/offline";

export interface ItemDetailDialogProps {
  item: ShoppingItem | null;
  onClose: () => void;
  onCheck: (itemId: string) => void;
  onEdit: (item: ShoppingItem) => void;
  onRemove: (itemId: string) => void;
  /** False while the group is read-only for this user (see useCanMutate). */
  canMutate: boolean;
}

export function ItemDetailDialog({
  item,
  onClose,
  onCheck,
  onEdit,
  onRemove,
  canMutate,
}: ItemDetailDialogProps) {
  const t = useT();

  // A line that exists only optimistically has no server id yet, so editing or
  // deleting it by id would 404. Checking it off is fine — the queue is ordered.
  const pending = item !== null && isPendingItemId(item.id);
  const amount = item ? formatShoppingAmount(item, formatQuantity) : "";
  const sources = item?.sources ?? [];

  /** Close first, act afterwards — see the note at the top of the file. */
  const act = (run: () => void) => {
    onClose();
    requestAnimationFrame(run);
  };

  const rows: Array<{ label: string; value: string }> = [];
  if (amount) rows.push({ label: t("shopping.item.detail.amount"), value: amount });
  if (item?.note) rows.push({ label: t("shopping.item.detail.note"), value: item.note });
  if (sources.length > 0) {
    rows.push({
      label: t("shopping.item.detail.sources", { count: sources.length }),
      value: sources.map((source) => source.title).join(", "),
    });
  }

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={item?.name}
      size="sm"
      footer={
        item ? (
          <>
            {canMutate && !pending ? (
              <Button
                variant="ghost"
                leftIcon={<Trash2 />}
                className="text-danger hover:bg-danger-soft"
                onClick={() => act(() => onRemove(item.id))}
              >
                {t("shopping.item.remove")}
              </Button>
            ) : null}
            {canMutate && !pending ? (
              <Button variant="outline" leftIcon={<Pencil />} onClick={() => act(() => onEdit(item))}>
                {t("shopping.item.edit")}
              </Button>
            ) : null}
            <Button
              leftIcon={<Check />}
              disabled={!canMutate}
              onClick={() => act(() => onCheck(item.id))}
            >
              {t("shopping.item.check")}
            </Button>
          </>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="py-1 text-sm text-fg-muted">{t("shopping.item.detail.empty")}</p>
      ) : (
        <dl className="flex flex-col gap-3 py-1">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {row.label}
              </dt>
              <dd className="mt-0.5 break-words text-fg">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Dialog>
  );
}
