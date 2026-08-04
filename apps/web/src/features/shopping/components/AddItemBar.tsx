/**
 * The add box. One text field that understands amounts: "500g Mehl", "2 Dosen Tomaten",
 * "Klopapier" all work, because the input is parsed with the app's German ingredient
 * parser before it is sent (see ../lib/parse.ts).
 *
 * It stays put at the bottom of the screen on phones — above the tab bar — so adding
 * three things in a row does not mean scrolling back up each time. The field keeps
 * focus after a submit for the same reason.
 *
 * A live preview of what the parser understood sits under the field. Without it,
 * "2 Dosen Tomaten" silently becoming `2 Dose Tomaten` is a small mystery; with it, the
 * unit normalisation is visible before anything is saved.
 */
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { formatQuantity, formatShoppingAmount } from "@toon/shared";
import { Button, Input } from "@/components/ui";
import { parseShoppingInput, parseShoppingInputBlock } from "../lib/parse";

export interface AddItemBarProps {
  onAdd: (items: ReturnType<typeof parseShoppingInputBlock>) => void;
  disabled?: boolean;
}

export function AddItemBar({ onAdd, disabled = false }: AddItemBarProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const preview = parseShoppingInput(text);

  const submit = () => {
    // Split on newlines too, so a list pasted out of a chat message arrives as items.
    const items = parseShoppingInputBlock(text);
    if (items.length === 0) return;
    onAdd(items);
    setText("");
    inputRef.current?.focus();
  };

  return (
    // `bottom-tabbar`, not `bottom-0`: the phone tab bar is FIXED and would otherwise
    // cover this box (see the utility in styles/index.css).
    <div className="bottom-tabbar sticky -mx-4 border-t border-line bg-surface/95 px-4 pt-3 pb-3 backdrop-blur-md sm:mx-0 sm:rounded-card sm:border sm:px-4">
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="z. B. 500 g Mehl"
            aria-label="Artikel hinzufügen"
            enterKeyHint="done"
            autoComplete="off"
            disabled={disabled}
          />
          {preview ? (
            <p className="mt-1.5 truncate text-xs text-fg-muted">
              Wird hinzugefügt:{" "}
              <span className="font-medium text-fg">
                {[
                  formatShoppingAmount(
                    { quantity: preview.quantity ?? null, unit: preview.unit ?? null },
                    formatQuantity,
                  ),
                  preview.name,
                ]
                  .filter((part) => part.length > 0)
                  .join(" ")}
              </span>
              {preview.note ? ` (${preview.note})` : ""}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          leftIcon={<Plus />}
          disabled={disabled || preview === null}
          className="shrink-0"
        >
          <span className="sr-only sm:not-sr-only">Hinzufügen</span>
        </Button>
      </form>
    </div>
  );
}
