/**
 * Ingredients editor.
 *
 * - one row per ingredient: Menge / Einheit / Zutat / Notiz
 * - section headings ("Für den Teig") per row, with a datalist of existing sections
 * - reordering via ALWAYS-VISIBLE up/down buttons (drag & drop is unusable on a phone)
 * - "Zutaten einfügen": paste a whole block, every line goes through
 *   `parseIngredientBlock` / `parseIngredientLine` from @toon/shared
 */
import { useId, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2, WandSparkles } from "lucide-react";
import { parseIngredientLine } from "@toon/shared";
import { Button, Dialog, IconButton, Input, Textarea } from "@/components/ui";
import type { FieldErrors } from "@/lib/validation";
import { moveItem } from "../lib/hooks";
import { sectionNames } from "../lib/format";
import {
  emptyIngredientRow,
  ingredientToRow,
  rowsFromPastedIngredients,
  type IngredientRow,
} from "../lib/formState";

export interface IngredientsEditorProps {
  rows: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
  /** Server-side field errors keyed "ingredients.<index>.<field>". */
  errors?: FieldErrors;
  disabled?: boolean;
}

export function IngredientsEditor({
  rows,
  onChange,
  errors = {},
  disabled = false,
}: IngredientsEditorProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [status, setStatus] = useState("");
  const sectionListId = useId();
  const sections = sectionNames(rows);

  function patch(index: number, changes: Partial<IngredientRow>) {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...changes } : row)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    onChange(moveItem(rows, index, target));
    setStatus(`Zutat an Position ${target + 1} verschoben.`);
  }

  function remove(index: number) {
    const next = rows.filter((_row, position) => position !== index);
    onChange(next.length > 0 ? next : [emptyIngredientRow()]);
    setStatus("Zutat entfernt.");
  }

  function add(section = "") {
    onChange([...rows, emptyIngredientRow(section)]);
    setStatus("Zutat hinzugefügt.");
  }

  /**
   * Re-parses one line in place. Handy after pasting a single messy line into the
   * name field ("250g Mehl, gesiebt" -> Menge 250, Einheit g, Zutat Mehl, Notiz gesiebt).
   */
  function reparse(index: number) {
    const row = rows[index];
    if (!row) return;
    const source = [row.quantity, row.unit, row.name].filter((part) => part.trim().length > 0).join(" ");
    if (source.trim().length === 0) return;
    const parsed = parseIngredientLine(source, index);
    patch(index, {
      ...ingredientToRow(parsed),
      key: row.key,
      section: row.section,
      note: [row.note, parsed.note].filter((part) => part && part.trim().length > 0).join(", "),
      raw: row.raw,
    });
    setStatus("Zeile neu erkannt.");
  }

  function applyPaste() {
    const parsed = rowsFromPastedIngredients(pasteText);
    if (parsed.length === 0) {
      setStatus("Keine Zutaten erkannt.");
      return;
    }
    // Drop a single empty starter row so pasting into a fresh form looks right.
    const keep = rows.filter((row) => row.name.trim().length > 0 || row.quantity.trim().length > 0);
    onChange([...keep, ...parsed]);
    setPasteText("");
    setPasteOpen(false);
    setStatus(`${parsed.length} ${parsed.length === 1 ? "Zutat" : "Zutaten"} übernommen.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <datalist id={sectionListId}>
        {sections.map((section) => (
          <option key={section} value={section} />
        ))}
      </datalist>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Zutaten</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPasteOpen(true)}
          disabled={disabled}
          leftIcon={<ClipboardPaste className="size-4" />}
        >
          Zutaten einfügen
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const prefix = `ingredients.${index}`;
          const isFirstOfSection = index === 0 || rows[index - 1]?.section !== row.section;
          return (
            <li
              key={row.key}
              className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
            >
              {isFirstOfSection || row.section.length > 0 ? (
                <Input
                  label="Abschnitt"
                  optional
                  list={sectionListId}
                  value={row.section}
                  onChange={(event) => patch(index, { section: event.target.value })}
                  placeholder="z. B. Für den Teig"
                  disabled={disabled}
                  error={errors[`${prefix}.section`]}
                  containerClassName="mb-1"
                />
              ) : null}

              <div className="grid grid-cols-[5.5rem_5.5rem_1fr] gap-2">
                <Input
                  label="Menge"
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(event) => patch(index, { quantity: event.target.value })}
                  placeholder="250"
                  disabled={disabled}
                  error={errors[`${prefix}.quantity`]}
                />
                <Input
                  label="Einheit"
                  value={row.unit}
                  onChange={(event) => patch(index, { unit: event.target.value })}
                  placeholder="g"
                  disabled={disabled}
                  error={errors[`${prefix}.unit`]}
                />
                <Input
                  label="Zutat"
                  required
                  value={row.name}
                  onChange={(event) => patch(index, { name: event.target.value })}
                  placeholder="Mehl"
                  disabled={disabled}
                  error={errors[`${prefix}.name`]}
                />
              </div>

              <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                <Input
                  label="bis"
                  optional
                  inputMode="decimal"
                  value={row.quantityMax}
                  onChange={(event) => patch(index, { quantityMax: event.target.value })}
                  placeholder="3"
                  disabled={disabled}
                  error={errors[`${prefix}.quantityMax`]}
                />
                <Input
                  label="Notiz"
                  optional
                  value={row.note}
                  onChange={(event) => patch(index, { note: event.target.value })}
                  placeholder="fein gehackt"
                  disabled={disabled}
                  error={errors[`${prefix}.note`]}
                />
              </div>

              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-fg-subtle tabular-nums">
                  Position {index + 1} von {rows.length}
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    label={`Zutat ${index + 1} neu erkennen`}
                    icon={<WandSparkles />}
                    size="sm"
                    onClick={() => reparse(index)}
                    disabled={disabled}
                  />
                  <IconButton
                    label={`Zutat ${index + 1} nach oben`}
                    icon={<ArrowUp />}
                    size="sm"
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                  />
                  <IconButton
                    label={`Zutat ${index + 1} nach unten`}
                    icon={<ArrowDown />}
                    size="sm"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === rows.length - 1}
                  />
                  <IconButton
                    label={`Zutat ${index + 1} entfernen`}
                    icon={<Trash2 />}
                    size="sm"
                    variant="danger"
                    onClick={() => remove(index)}
                    disabled={disabled}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => add()}
          disabled={disabled}
          leftIcon={<Plus className="size-4" />}
        >
          Zutat hinzufügen
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => add(rows[rows.length - 1]?.section ?? "")}
          disabled={disabled}
        >
          Weitere im gleichen Abschnitt
        </Button>
      </div>

      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Zutaten einfügen"
        description="Eine Zutat pro Zeile. Zeilen wie „Für den Teig:“ werden zu Abschnitten. Mengen, Einheiten und Notizen werden automatisch erkannt."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasteOpen(false)} fullWidth>
              Abbrechen
            </Button>
            <Button onClick={applyPaste} disabled={pasteText.trim().length === 0} fullWidth>
              Übernehmen
            </Button>
          </>
        }
      >
        <Textarea
          label="Zutatenliste"
          rows={10}
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={"Für den Teig:\n250 g Mehl\n1 Pck. Backpulver\n2-3 Eier\n½ TL Salz"}
        />
      </Dialog>
    </div>
  );
}
