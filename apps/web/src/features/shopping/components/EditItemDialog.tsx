/**
 * Editing one line: name, amount, unit, note.
 *
 * The amount and unit are separate controls here rather than one free-text field. On
 * the add path a single box is faster ("500g Mehl"), but when CORRECTING a line the
 * amount is usually the only thing that changes, and a numeric keypad beats retyping
 * the whole line on a phone.
 *
 * Renaming a line into one that already exists is allowed and merges the two — the API
 * does that deliberately, so the dialog warns instead of blocking.
 */
import { useEffect, useState } from "react";
import { nameKey, type ShoppingItem, type UpdateShoppingItemRequest } from "@toon/shared";
import { Button, Dialog, Input } from "@/components/ui";

export interface EditItemDialogProps {
  item: ShoppingItem | null;
  /** Every other line, used to warn about a merge. */
  siblings: ShoppingItem[];
  onClose: () => void;
  onSave: (itemId: string, patch: UpdateShoppingItemRequest) => void;
}

export function EditItemDialog({ item, siblings, onClose, onSave }: EditItemDialogProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQuantity(item.quantity === null ? "" : String(item.quantity).replace(".", ","));
    setUnit(item.unit ?? "");
    setNote(item.note ?? "");
  }, [item]);

  const trimmedName = name.trim();
  const parsedQuantity = parseAmount(quantity);
  const quantityInvalid = quantity.trim().length > 0 && parsedQuantity === null;

  const wouldMerge =
    item !== null &&
    trimmedName.length > 0 &&
    siblings.some(
      (sibling) => sibling.id !== item.id && nameKey(sibling.name) === nameKey(trimmedName),
    );

  const save = () => {
    if (!item || trimmedName.length === 0 || quantityInvalid) return;
    onSave(item.id, {
      name: trimmedName,
      quantity: quantity.trim().length === 0 ? null : parsedQuantity,
      unit: unit.trim().length === 0 ? null : unit.trim(),
      note: note.trim().length === 0 ? null : note.trim(),
    });
    onClose();
  };

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title="Position bearbeiten"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={trimmedName.length === 0 || quantityInvalid}>
            Speichern
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Input
          label="Artikel"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
        <div className="flex gap-3">
          <Input
            label="Menge"
            className="flex-1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="decimal"
            placeholder="leer = ohne Menge"
            error={quantityInvalid ? "Bitte eine Zahl eingeben" : undefined}
          />
          <Input
            label="Einheit"
            className="flex-1"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="g, ml, Stück …"
            autoComplete="off"
          />
        </div>
        <Input
          label="Notiz"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="z. B. laktosefrei"
          autoComplete="off"
        />
        {wouldMerge ? (
          <p className="text-sm text-warning-soft-fg">
            „{trimmedName}“ steht schon auf der Liste — die beiden Positionen werden
            zusammengefasst.
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** Accepts a German decimal comma as well as a dot. Returns null for anything else. */
function parseAmount(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
