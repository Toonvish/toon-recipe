/**
 * Steps editor: autosizing textareas, section headings, touch-friendly reordering with
 * always-visible up/down buttons, and a paste-a-block field that runs `parseStepBlock`
 * from @toon/shared (recognises "1." / "1)" / "Schritt 1" numbering and paragraphs).
 */
import { useId, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { Button, Dialog, IconButton, Input, Textarea } from "@/components/ui";
import type { FieldErrors } from "@/lib/validation";
import { moveItem } from "../lib/hooks";
import { sectionNames } from "../lib/format";
import { emptyStepRow, rowsFromPastedSteps, type StepRow } from "../lib/formState";

export interface StepsEditorProps {
  rows: StepRow[];
  onChange: (rows: StepRow[]) => void;
  /** Server-side field errors keyed "steps.<index>.<field>". */
  errors?: FieldErrors;
  disabled?: boolean;
}

export function StepsEditor({ rows, onChange, errors = {}, disabled = false }: StepsEditorProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [status, setStatus] = useState("");
  const sectionListId = useId();
  const sections = sectionNames(rows);

  function patch(index: number, changes: Partial<StepRow>) {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...changes } : row)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    onChange(moveItem(rows, index, target));
    setStatus(`Schritt an Position ${target + 1} verschoben.`);
  }

  function remove(index: number) {
    const next = rows.filter((_row, position) => position !== index);
    onChange(next.length > 0 ? next : [emptyStepRow()]);
    setStatus("Schritt entfernt.");
  }

  function applyPaste() {
    const parsed = rowsFromPastedSteps(pasteText);
    if (parsed.length === 0) {
      setStatus("Keine Schritte erkannt.");
      return;
    }
    const keep = rows.filter((row) => row.text.trim().length > 0);
    onChange([...keep, ...parsed]);
    setPasteText("");
    setPasteOpen(false);
    setStatus(`${parsed.length} ${parsed.length === 1 ? "Schritt" : "Schritte"} übernommen.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <datalist id={sectionListId}>
        {sections.map((section) => (
          <option key={section} value={section} />
        ))}
      </datalist>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Zubereitung</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPasteOpen(true)}
          disabled={disabled}
          leftIcon={<ClipboardPaste className="size-4" />}
        >
          Text einfügen
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const prefix = `steps.${index}`;
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
                  placeholder="z. B. Teig zubereiten"
                  disabled={disabled}
                  error={errors[`${prefix}.section`]}
                />
              ) : null}

              <Textarea
                label={`Schritt ${index + 1}`}
                required
                autoGrow
                rows={3}
                value={row.text}
                onChange={(event) => patch(index, { text: event.target.value })}
                placeholder="Mehl, Backpulver und Salz in einer Schüssel vermischen."
                disabled={disabled}
                error={errors[`${prefix}.text`]}
              />

              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-fg-subtle tabular-nums">
                  Position {index + 1} von {rows.length}
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    label={`Schritt ${index + 1} nach oben`}
                    icon={<ArrowUp />}
                    size="sm"
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                  />
                  <IconButton
                    label={`Schritt ${index + 1} nach unten`}
                    icon={<ArrowDown />}
                    size="sm"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === rows.length - 1}
                  />
                  <IconButton
                    label={`Schritt ${index + 1} entfernen`}
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
          onClick={() => {
            onChange([...rows, emptyStepRow()]);
            setStatus("Schritt hinzugefügt.");
          }}
          disabled={disabled}
          leftIcon={<Plus className="size-4" />}
        >
          Schritt hinzufügen
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onChange([...rows, emptyStepRow(rows[rows.length - 1]?.section ?? "")]);
            setStatus("Schritt hinzugefügt.");
          }}
          disabled={disabled}
        >
          Weiterer im gleichen Abschnitt
        </Button>
      </div>

      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Zubereitung einfügen"
        description="Nummerierte Schritte („1.“, „Schritt 2)“) oder Absätze werden automatisch getrennt."
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
          label="Zubereitungstext"
          rows={12}
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={
            "1. Backofen auf 180 °C vorheizen.\n2. Mehl und Backpulver vermischen.\n3. Eier unterrühren."
          }
        />
      </Dialog>
    </div>
  );
}
