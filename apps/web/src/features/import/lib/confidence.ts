/**
 * Turns the draft's per-field confidence plus a few OCR heuristics into
 * "bitte prüfen" hints. Pure and DOM-free so it can be unit tested.
 *
 * Rule: this NEVER blocks saving. It only decides where to draw attention.
 */
import { isKnownUnit, type ParsedRecipe, type ParsedRecipeConfidence, type RecipeIngredient, type RecipeStep } from "@toon/shared";

/** Below this the review screen shows the "bitte prüfen" banner. */
export const CONFIDENCE_WARN = 0.5;
/** At or above this a value is treated as trustworthy. */
export const CONFIDENCE_GOOD = 0.75;

export type ConfidenceLevel = "unknown" | "low" | "medium" | "high";

export function confidenceLevel(value: number | null | undefined): ConfidenceLevel {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value < CONFIDENCE_WARN) return "low";
  if (value < CONFIDENCE_GOOD) return "medium";
  return "high";
}

export type ConfidenceField = keyof Omit<ParsedRecipeConfidence, "overall">;

/** German labels used in the "bitte prüfen" hint text. */
export const FIELD_LABELS: Record<ConfidenceField, string> = {
  title: "Titel",
  description: "Beschreibung",
  ingredients: "Zutaten",
  steps: "Zubereitung",
  servings: "Portionen",
  times: "Zeiten",
  image: "Bild",
};

export function fieldConfidence(draft: ParsedRecipe, field: ConfidenceField): number | undefined {
  return draft.confidence[field];
}

/** True when a field should carry a visible "bitte prüfen" marker. */
export function fieldNeedsCheck(draft: ParsedRecipe, field: ConfidenceField): boolean {
  const value = draft.confidence[field];
  if (typeof value === "number") return value < CONFIDENCE_GOOD;
  // No opinion from the parser: flag empty values that a recipe really wants.
  switch (field) {
    case "title":
      return (draft.title ?? "").trim().length === 0;
    case "servings":
      return draft.servings === undefined;
    case "times":
      return draft.prepMinutes === undefined && draft.cookMinutes === undefined && draft.totalMinutes === undefined;
    case "ingredients":
      return draft.ingredients.length === 0;
    case "steps":
      return draft.steps.length === 0;
    default:
      return false;
  }
}

/** Characters tesseract loves to invent. */
const OCR_NOISE_RE = /[|¦~°¬<>«»■□▪@#§¤]/u;
const LETTER_RE = /\p{L}/u;

export interface RowCheck {
  needsCheck: boolean;
  /** Short German reasons, shown as a tooltip / hint under the row. */
  reasons: string[];
}

const OK: RowCheck = { needsCheck: false, reasons: [] };

/**
 * Row-level heuristics for an ingredient. Deliberately conservative: we only
 * flag things a human can fix in a second.
 */
export function ingredientCheck(ingredient: RecipeIngredient, listConfidence?: number): RowCheck {
  const reasons: string[] = [];
  const name = (ingredient.name ?? "").trim();
  const raw = (ingredient.raw ?? "").trim();

  if (name.length === 0) reasons.push("Kein Name erkannt");
  else if (name.length < 2) reasons.push("Sehr kurzer Name");
  if (!LETTER_RE.test(name) && name.length > 0) reasons.push("Name enthält keine Buchstaben");
  if (OCR_NOISE_RE.test(name)) reasons.push("Ungewöhnliche Zeichen im Namen");
  if (typeof ingredient.unit === "string" && ingredient.unit.trim().length > 0 && !isKnownUnit(ingredient.unit)) {
    reasons.push(`Einheit „${ingredient.unit}“ unbekannt`);
  }
  if (ingredient.quantity === null || ingredient.quantity === undefined) {
    if (/\d/.test(raw)) reasons.push("Zahl in der Zeile, aber keine Menge erkannt");
  } else if (ingredient.quantity > 5000 && (ingredient.unit === undefined || ingredient.unit === null)) {
    reasons.push("Sehr große Menge ohne Einheit");
  }
  if (name.length > 90) reasons.push("Zeile wirkt zusammengefasst – evtl. teilen");
  if (/\d\s*(g|kg|ml|l)\b/i.test(name)) reasons.push("Menge steckt noch im Namen");

  if (reasons.length === 0 && typeof listConfidence === "number" && listConfidence < CONFIDENCE_WARN) {
    return { needsCheck: true, reasons: ["Zutatenliste unsicher erkannt"] };
  }
  return reasons.length === 0 ? OK : { needsCheck: true, reasons };
}

export function stepCheck(step: RecipeStep, listConfidence?: number): RowCheck {
  const reasons: string[] = [];
  const text = step.text.trim();
  if (text.length === 0) reasons.push("Leerer Schritt");
  else if (text.length < 12) reasons.push("Sehr kurzer Schritt");
  if (OCR_NOISE_RE.test(text)) reasons.push("Ungewöhnliche Zeichen im Text");
  if (text.length > 1200) reasons.push("Sehr langer Schritt – evtl. teilen");
  if (reasons.length === 0 && typeof listConfidence === "number" && listConfidence < CONFIDENCE_WARN) {
    return { needsCheck: true, reasons: ["Zubereitung unsicher erkannt"] };
  }
  return reasons.length === 0 ? OK : { needsCheck: true, reasons };
}

/** Count of rows that want a look — drives the "n Zeilen prüfen" summary. */
export function countRowsNeedingCheck(draft: ParsedRecipe): { ingredients: number; steps: number } {
  const ingredientConfidence = draft.confidence.ingredients;
  const stepConfidence = draft.confidence.steps;
  return {
    ingredients: draft.ingredients.filter((item) => ingredientCheck(item, ingredientConfidence).needsCheck).length,
    steps: draft.steps.filter((item) => stepCheck(item, stepConfidence).needsCheck).length,
  };
}

/** Percent string for the UI, e.g. 0.62 -> "62 %". */
export function formatConfidence(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unbekannt";
  return `${Math.round(value * 100)} %`;
}
