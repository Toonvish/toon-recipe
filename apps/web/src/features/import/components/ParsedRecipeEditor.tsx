/**
 * The PARSED pane: the same fields as a normal recipe form, plus the bulk fixers
 * that make correcting OCR fast.
 *
 * Everything goes through the pure helpers in ../lib/draftEdit, so positions stay
 * consistent and the result is always PATCH-safe.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  ListPlus,
  Pencil,
  Plus,
  RefreshCw,
  Split,
  Trash2,
  X,
} from "lucide-react";
import {
  formatDuration,
  formatQuantity,
  parseDuration,
  parseNumberToken,
  type Difficulty,
  type ParsedRecipe,
} from "@toon/shared";
import { Button, Input, Label, Select, Textarea, readChangeValue } from "../lib/shell";
import { ConfidenceBadge, ConfidenceReasons } from "./ConfidenceBadge";
import { fieldNeedsCheck, ingredientCheck, stepCheck } from "../lib/confidence";
import {
  addIngredient,
  addStep,
  addTag,
  appendIngredientBlock,
  appendStepBlock,
  canSplitIngredient,
  canSplitStep,
  ingredientToLine,
  ingredientToStep,
  moveIngredient,
  moveStep,
  removeIngredient,
  removeStep,
  removeTag,
  renameIngredientSection,
  renameStepSection,
  reparseAllIngredients,
  reparseAllSteps,
  reparseIngredient,
  splitIngredient,
  splitStep,
  stepToIngredient,
  updateIngredient,
  updateStep,
} from "../lib/draftEdit";

export interface ParsedRecipeEditorProps {
  value: ParsedRecipe;
  onChange: (next: ParsedRecipe) => void;
  /** Existing tag names of the group, offered as a datalist. */
  tagSuggestions?: readonly string[];
  className?: string;
}

const DIFFICULTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "– keine Angabe –" },
  { value: "einfach", label: "einfach" },
  { value: "mittel", label: "mittel" },
  { value: "schwer", label: "schwer" },
];

/** A short list of the most useful German units for the unit datalist. */
const UNIT_SUGGESTIONS = ["g", "kg", "ml", "l", "EL", "TL", "Prise", "Bund", "Pck.", "Stück", "Dose", "Msp.", "Tasse"];

export function ParsedRecipeEditor({ value, onChange, tagSuggestions = [], className }: ParsedRecipeEditorProps) {
  const ingredientConfidence = value.confidence.ingredients;
  const stepConfidence = value.confidence.steps;

  return (
    <div className={clsx("space-y-6", className)}>
      <BasicsSection value={value} onChange={onChange} tagSuggestions={tagSuggestions} />
      <IngredientsSection value={value} onChange={onChange} listConfidence={ingredientConfidence} />
      <StepsSection value={value} onChange={onChange} listConfidence={stepConfidence} />
      <NotesSection value={value} onChange={onChange} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* small field helpers                                                         */
/* -------------------------------------------------------------------------- */

function SectionCard({
  title,
  hint,
  badge,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {badge}
        {actions !== undefined ? <div className="ml-auto flex flex-wrap gap-1">{actions}</div> : null}
      </header>
      {hint !== undefined ? <p className="mb-3 text-xs text-fg-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

/** Tiny ghost button used for the many row actions. */
function RowAction({
  label,
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        "rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-30",
        danger
          ? "text-danger hover:bg-danger-soft"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Quantity input that understands what German recipes actually contain:
 * "1,5", "1 1/2", "½". Keeps a text buffer so typing is never fought by
 * re-formatting.
 */
function QuantityField({
  value,
  onCommit,
  ariaLabel,
  placeholder,
}: {
  value: number | null | undefined;
  onCommit: (next: number | undefined) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => (value === null || value === undefined ? "" : formatQuantity(value)));

  useEffect(() => {
    const fromText = text.trim().length === 0 ? undefined : parseNumberToken(text.trim());
    const current = value ?? undefined;
    if (fromText !== current) setText(current === undefined ? "" : formatQuantity(current));
    // Only react to external changes.
  }, [value]);

  return (
    <Input
      value={text}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="w-full"
      onChange={(event) => {
        const next = readChangeValue(event);
        setText(next);
        const trimmed = next.trim();
        onCommit(trimmed.length === 0 ? undefined : parseNumberToken(trimmed));
      }}
    />
  );
}

/**
 * Minutes input that also accepts free German text ("1 Std 15 Min", "PT30M")
 * via parseDuration — a big time saver when copying from a photo.
 */
function MinutesField({
  id,
  value,
  onCommit,
  label,
}: {
  id: string;
  value: number | null | undefined;
  onCommit: (next: number | undefined) => void;
  label: string;
}) {
  const [text, setText] = useState(() => (value === null || value === undefined ? "" : String(value)));

  useEffect(() => {
    const fromText = text.trim().length === 0 ? undefined : parseDuration(text.trim());
    const current = value ?? undefined;
    if (fromText !== current) setText(current === undefined ? "" : String(current));
  }, [value]);

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-fg-muted">
        {label}
      </Label>
      <Input
        id={id}
        value={text}
        inputMode="text"
        placeholder="z. B. 30 oder 1 Std 15 Min"
        onChange={(event) => {
          const next = readChangeValue(event);
          setText(next);
          const trimmed = next.trim();
          onCommit(trimmed.length === 0 ? undefined : parseDuration(trimmed));
        }}
      />
      {typeof value === "number" && value > 0 ? (
        <p className="text-[11px] text-fg-muted">{formatDuration(value)}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* basics                                                                      */
/* -------------------------------------------------------------------------- */

function BasicsSection({
  value,
  onChange,
  tagSuggestions,
}: {
  value: ParsedRecipe;
  onChange: (next: ParsedRecipe) => void;
  tagSuggestions: readonly string[];
}) {
  const [tagDraft, setTagDraft] = useState("");
  const titleNeedsCheck = fieldNeedsCheck(value, "title");
  const servingsNeedsCheck = fieldNeedsCheck(value, "servings");
  const timesNeedCheck = fieldNeedsCheck(value, "times");

  const commitTag = () => {
    const next = addTag(value, tagDraft);
    if (next !== value) onChange(next);
    setTagDraft("");
  };

  return (
    <SectionCard title="Grunddaten">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="import-title" className="text-xs font-medium text-fg-muted">
              Titel *
            </Label>
            {titleNeedsCheck ? <ConfidenceBadge value={value.confidence.title} /> : null}
          </div>
          <Input
            id="import-title"
            value={value.title ?? ""}
            placeholder="Wie heißt das Rezept?"
            aria-invalid={(value.title ?? "").trim().length === 0}
            onChange={(event) => onChange({ ...value, title: readChangeValue(event) })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="import-description" className="text-xs font-medium text-fg-muted">
            Kurzbeschreibung
          </Label>
          <Textarea
            id="import-description"
            rows={2}
            value={value.description ?? ""}
            placeholder="Optional – ein Satz zum Rezept"
            onChange={(event) => onChange({ ...value, description: readChangeValue(event) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="import-servings" className="text-xs font-medium text-fg-muted">
                Portionen
              </Label>
              {servingsNeedsCheck ? <ConfidenceBadge value={value.confidence.servings} /> : null}
            </div>
            <QuantityField
              ariaLabel="Anzahl Portionen"
              placeholder="4"
              value={value.servings?.amount}
              onCommit={(amount) =>
                onChange({
                  ...value,
                  servings:
                    amount === undefined || amount <= 0
                      ? undefined
                      : { amount, unit: value.servings?.unit ?? "Portionen" },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="import-servings-unit" className="text-xs font-medium text-fg-muted">
              Einheit
            </Label>
            <Input
              id="import-servings-unit"
              value={value.servings?.unit ?? ""}
              placeholder="Portionen"
              onChange={(event) => {
                const unit = readChangeValue(event);
                onChange({
                  ...value,
                  servings:
                    value.servings === undefined
                      ? unit.trim().length === 0
                        ? undefined
                        : { amount: 4, unit }
                      : { ...value.servings, unit },
                });
              }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-fg-muted">Zeiten (Minuten)</span>
            {timesNeedCheck ? <ConfidenceBadge value={value.confidence.times} /> : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MinutesField
              id="import-prep"
              label="Vorbereitung"
              value={value.prepMinutes}
              onCommit={(next) => onChange({ ...value, prepMinutes: next })}
            />
            <MinutesField
              id="import-cook"
              label="Kochen / Backen"
              value={value.cookMinutes}
              onCommit={(next) => onChange({ ...value, cookMinutes: next })}
            />
            <MinutesField
              id="import-total"
              label="Gesamt"
              value={value.totalMinutes}
              onCommit={(next) => onChange({ ...value, totalMinutes: next })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="import-difficulty" className="text-xs font-medium text-fg-muted">
              Schwierigkeit
            </Label>
            <Select
              id="import-difficulty"
              value={value.difficulty ?? ""}
              options={DIFFICULTY_OPTIONS}
              onChange={(event) => {
                const next = readChangeValue(event);
                onChange({ ...value, difficulty: next.length === 0 ? undefined : (next as Difficulty) });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="import-source" className="text-xs font-medium text-fg-muted">
              Quelle
            </Label>
            <Input
              id="import-source"
              value={value.sourceName ?? ""}
              placeholder="z. B. chefkoch.de oder Omas Kochbuch"
              onChange={(event) => onChange({ ...value, sourceName: readChangeValue(event) })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="import-tags" className="text-xs font-medium text-fg-muted">
            Tags
          </Label>
          {value.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {value.tags.map((tag) => (
                <li key={tag}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2.5 pr-1 text-xs text-fg">
                    {tag}
                    <button
                      type="button"
                      onClick={() => onChange(removeTag(value, tag))}
                      aria-label={`Tag ${tag} entfernen`}
                      className="rounded-full p-0.5 hover:bg-surface-2"
                    >
                      <X aria-hidden className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Input
              id="import-tags"
              containerClassName="flex-1"
              value={tagDraft}
              list="import-tag-suggestions"
              placeholder="Tag hinzufügen (Enter)"
              onChange={(event) => setTagDraft(readChangeValue(event))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  commitTag();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={commitTag} disabled={tagDraft.trim().length === 0}>
              <Plus aria-hidden className="h-4 w-4" />
            </Button>
          </div>
          <datalist id="import-tag-suggestions">
            {tagSuggestions.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </div>
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* ingredients                                                                 */
/* -------------------------------------------------------------------------- */

function IngredientsSection({
  value,
  onChange,
  listConfidence,
}: {
  value: ParsedRecipe;
  onChange: (next: ParsedRecipe) => void;
  listConfidence?: number;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const flagged = useMemo(
    () => value.ingredients.filter((item) => ingredientCheck(item, listConfidence).needsCheck).length,
    [value.ingredients, listConfidence],
  );

  const toggleExpanded = (index: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <SectionCard
      title={`Zutaten (${value.ingredients.length})`}
      badge={flagged > 0 ? <ConfidenceBadge level="low" label={`${flagged} prüfen`} /> : null}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(reparseAllIngredients(value))}>
            <RefreshCw aria-hidden className="mr-1 h-3.5 w-3.5" />
            Alle neu parsen
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen((open) => !open)}>
            <ClipboardPaste aria-hidden className="mr-1 h-3.5 w-3.5" />
            Text einfügen
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange(addIngredient(value))}>
            <Plus aria-hidden className="mr-1 h-3.5 w-3.5" />
            Zeile
          </Button>
        </>
      }
    >
      {pasteOpen ? (
        <div className="mb-4 space-y-2 rounded-lg bg-surface-2 p-3">
          <Textarea
            rows={5}
            value={pasteText}
            placeholder={"Eine Zutat pro Zeile einfügen.\nAbschnitte als „Für den Teig:“"}
            onChange={(event) => setPasteText(readChangeValue(event))}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => {
                onChange(appendIngredientBlock(value, pasteText));
                setPasteText("");
                setPasteOpen(false);
              }}
              disabled={pasteText.trim().length === 0}
            >
              Zeilen übernehmen
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPasteOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}

      {value.ingredients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong p-4 text-center text-sm text-fg-muted">
          Noch keine Zutaten. Füge eine Zeile hinzu oder übernimm Zeilen aus dem Rohtext links.
        </p>
      ) : (
        <ul className="space-y-3">
          {value.ingredients.map((ingredient, index) => {
            const previousSection = index === 0 ? undefined : (value.ingredients[index - 1]?.section ?? undefined);
            const showHeading = (ingredient.section ?? undefined) !== previousSection;
            const check = ingredientCheck(ingredient, listConfidence);
            const isExpanded = expanded.has(index);
            return (
              <li key={index}>
                {showHeading && (ingredient.section ?? "").length > 0 ? (
                  <Input
                    value={ingredient.section ?? ""}
                    aria-label="Abschnitt"
                    className="mb-2 font-semibold"
                    onChange={(event) => onChange(renameIngredientSection(value, index, readChangeValue(event)))}
                  />
                ) : null}
                <div
                  className={clsx(
                    "rounded-lg border p-2",
                    check.needsCheck
                      ? "border-warning/40 bg-warning-soft/60"
                      : "border-line",
                  )}
                >
                  <div className="grid grid-cols-[4rem_4.5rem_1fr] gap-2">
                    <QuantityField
                      ariaLabel={`Menge Zeile ${index + 1}`}
                      placeholder="Menge"
                      value={ingredient.quantity}
                      onCommit={(quantity) => onChange(updateIngredient(value, index, { quantity }))}
                    />
                    <Input
                      value={ingredient.unit ?? ""}
                      list="import-unit-suggestions"
                      aria-label={`Einheit Zeile ${index + 1}`}
                      placeholder="Einheit"
                      onChange={(event) => onChange(updateIngredient(value, index, { unit: readChangeValue(event) }))}
                    />
                    <Input
                      value={ingredient.name}
                      aria-label={`Zutat Zeile ${index + 1}`}
                      placeholder="Zutat"
                      onChange={(event) => onChange(updateIngredient(value, index, { name: readChangeValue(event) }))}
                    />
                  </div>

                  {isExpanded ? (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <QuantityField
                          ariaLabel={`Menge bis Zeile ${index + 1}`}
                          placeholder="bis (z. B. 3)"
                          value={ingredient.quantityMax}
                          onCommit={(quantityMax) => onChange(updateIngredient(value, index, { quantityMax }))}
                        />
                        <Input
                          value={ingredient.note ?? ""}
                          aria-label={`Notiz Zeile ${index + 1}`}
                          placeholder="Notiz (z. B. fein gehackt)"
                          onChange={(event) => onChange(updateIngredient(value, index, { note: readChangeValue(event) }))}
                        />
                      </div>
                      <Input
                        value={ingredient.section ?? ""}
                        aria-label={`Abschnitt Zeile ${index + 1}`}
                        placeholder="Abschnitt (z. B. Für den Teig)"
                        onChange={(event) => onChange(updateIngredient(value, index, { section: readChangeValue(event) }))}
                      />
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-fg-muted">
                          Rohzeile (aus der Quelle)
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            value={ingredient.raw ?? ""}
                            containerClassName="flex-1"
                            aria-label={`Rohzeile ${index + 1}`}
                            className="font-mono text-[13px]"
                            onChange={(event) => onChange(updateIngredient(value, index, { raw: readChangeValue(event) }))}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onChange(reparseIngredient(value, index))}
                            title="Rohzeile neu parsen"
                          >
                            <RefreshCw aria-hidden className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-1.5 flex items-center gap-0.5">
                    <RowAction label="Nach oben" onClick={() => onChange(moveIngredient(value, index, index - 1))} disabled={index === 0}>
                      <ChevronUp aria-hidden className="h-4 w-4" />
                    </RowAction>
                    <RowAction
                      label="Nach unten"
                      onClick={() => onChange(moveIngredient(value, index, index + 1))}
                      disabled={index === value.ingredients.length - 1}
                    >
                      <ChevronDown aria-hidden className="h-4 w-4" />
                    </RowAction>
                    <RowAction label="Zeile neu parsen" onClick={() => onChange(reparseIngredient(value, index))}>
                      <RefreshCw aria-hidden className="h-4 w-4" />
                    </RowAction>
                    <RowAction
                      label="Zusammengefasste Zeile teilen"
                      onClick={() => onChange(splitIngredient(value, index))}
                      disabled={!canSplitIngredient(ingredient)}
                    >
                      <Split aria-hidden className="h-4 w-4" />
                    </RowAction>
                    <RowAction label="Zutat zu Schritt verschieben" onClick={() => onChange(ingredientToStep(value, index))}>
                      <ArrowRightLeft aria-hidden className="h-4 w-4" />
                    </RowAction>
                    <RowAction label="Details bearbeiten" onClick={() => toggleExpanded(index)}>
                      <Pencil aria-hidden className="h-4 w-4" />
                    </RowAction>
                    <RowAction label="Zeile löschen" danger onClick={() => onChange(removeIngredient(value, index))}>
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </RowAction>
                    {!isExpanded && (ingredient.note ?? "").length > 0 ? (
                      <span className="ml-1 truncate text-[11px] text-fg-muted">
                        {ingredient.note}
                      </span>
                    ) : null}
                  </div>

                  {check.needsCheck ? <ConfidenceReasons reasons={check.reasons} className="mt-1" /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <datalist id="import-unit-suggestions">
        {UNIT_SUGGESTIONS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* steps                                                                       */
/* -------------------------------------------------------------------------- */

function StepsSection({
  value,
  onChange,
  listConfidence,
}: {
  value: ParsedRecipe;
  onChange: (next: ParsedRecipe) => void;
  listConfidence?: number;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [sectionOpen, setSectionOpen] = useState<Set<number>>(() => new Set());

  const flagged = useMemo(
    () => value.steps.filter((item) => stepCheck(item, listConfidence).needsCheck).length,
    [value.steps, listConfidence],
  );

  return (
    <SectionCard
      title={`Zubereitung (${value.steps.length})`}
      badge={flagged > 0 ? <ConfidenceBadge level="low" label={`${flagged} prüfen`} /> : null}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(reparseAllSteps(value))}>
            <RefreshCw aria-hidden className="mr-1 h-3.5 w-3.5" />
            Neu aufteilen
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen((open) => !open)}>
            <ClipboardPaste aria-hidden className="mr-1 h-3.5 w-3.5" />
            Text einfügen
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange(addStep(value))}>
            <Plus aria-hidden className="mr-1 h-3.5 w-3.5" />
            Schritt
          </Button>
        </>
      }
    >
      {pasteOpen ? (
        <div className="mb-4 space-y-2 rounded-lg bg-surface-2 p-3">
          <Textarea
            rows={6}
            value={pasteText}
            placeholder={"Zubereitungstext einfügen – „1.“, „2.“ oder Leerzeilen trennen die Schritte."}
            onChange={(event) => setPasteText(readChangeValue(event))}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => {
                onChange(appendStepBlock(value, pasteText));
                setPasteText("");
                setPasteOpen(false);
              }}
              disabled={pasteText.trim().length === 0}
            >
              Schritte übernehmen
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPasteOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}

      {value.steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong p-4 text-center text-sm text-fg-muted">
          Noch keine Schritte. Füge einen Schritt hinzu oder übernimm Zeilen aus dem Rohtext links.
        </p>
      ) : (
        <ol className="space-y-3">
          {value.steps.map((step, index) => {
            const previousSection = index === 0 ? undefined : (value.steps[index - 1]?.section ?? undefined);
            const showHeading = (step.section ?? undefined) !== previousSection && (step.section ?? "").length > 0;
            const check = stepCheck(step, listConfidence);
            const isSectionOpen = sectionOpen.has(index);
            return (
              <li key={index}>
                {showHeading ? (
                  <Input
                    value={step.section ?? ""}
                    aria-label="Abschnitt"
                    className="mb-2 font-semibold"
                    onChange={(event) => onChange(renameStepSection(value, index, readChangeValue(event)))}
                  />
                ) : null}
                <div
                  className={clsx(
                    "rounded-lg border p-2",
                    check.needsCheck
                      ? "border-warning/40 bg-warning-soft/60"
                      : "border-line",
                  )}
                >
                  <div className="flex gap-2">
                    <span className="mt-2 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-fg-subtle">
                      {index + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <Textarea
                        rows={Math.min(8, Math.max(2, Math.ceil(step.text.length / 60)))}
                        value={step.text}
                        aria-label={`Schritt ${index + 1}`}
                        placeholder="Was ist zu tun?"
                        onChange={(event) => onChange(updateStep(value, index, { text: readChangeValue(event) }))}
                      />
                      {isSectionOpen ? (
                        <Input
                          value={step.section ?? ""}
                          aria-label={`Abschnitt Schritt ${index + 1}`}
                          placeholder="Abschnitt (z. B. Teig zubereiten)"
                          className="mt-2"
                          onChange={(event) => onChange(updateStep(value, index, { section: readChangeValue(event) }))}
                        />
                      ) : null}
                      <div className="mt-1.5 flex items-center gap-0.5">
                        <RowAction label="Nach oben" onClick={() => onChange(moveStep(value, index, index - 1))} disabled={index === 0}>
                          <ChevronUp aria-hidden className="h-4 w-4" />
                        </RowAction>
                        <RowAction
                          label="Nach unten"
                          onClick={() => onChange(moveStep(value, index, index + 1))}
                          disabled={index === value.steps.length - 1}
                        >
                          <ChevronDown aria-hidden className="h-4 w-4" />
                        </RowAction>
                        <RowAction label="Schritt teilen" onClick={() => onChange(splitStep(value, index))} disabled={!canSplitStep(step)}>
                          <Split aria-hidden className="h-4 w-4" />
                        </RowAction>
                        <RowAction label="Schritt zu Zutat verschieben" onClick={() => onChange(stepToIngredient(value, index))}>
                          <ListPlus aria-hidden className="h-4 w-4" />
                        </RowAction>
                        <RowAction
                          label="Abschnitt bearbeiten"
                          onClick={() =>
                            setSectionOpen((current) => {
                              const next = new Set(current);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                        >
                          <Pencil aria-hidden className="h-4 w-4" />
                        </RowAction>
                        <RowAction label="Schritt löschen" danger onClick={() => onChange(removeStep(value, index))}>
                          <Trash2 aria-hidden className="h-4 w-4" />
                        </RowAction>
                      </div>
                      {check.needsCheck ? <ConfidenceReasons reasons={check.reasons} className="mt-1" /> : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* notes                                                                       */
/* -------------------------------------------------------------------------- */

function NotesSection({ value, onChange }: { value: ParsedRecipe; onChange: (next: ParsedRecipe) => void }) {
  return (
    <SectionCard title="Notizen" hint="Alles, was nicht in die Schritte gehört – z. B. Tipps oder Varianten.">
      <Textarea
        rows={3}
        value={value.notes ?? ""}
        aria-label="Notizen"
        placeholder="Optional"
        onChange={(event) => onChange({ ...value, notes: readChangeValue(event) })}
      />
    </SectionCard>
  );
}

export default ParsedRecipeEditor;
