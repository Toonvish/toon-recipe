/**
 * German — namespace "plan". Covers apps/web/src/features/plan/**: `PlanPage`,
 * `PlanDayCard`, `PlanWeekNav`, `PlanRecipePicker`, `PlanServingsDialog` and
 * `WeekStrip` (the library's four-day strip, whose file lives in
 * `features/plan/components/WeekStrip.tsx` — its two keys are §6.4 below, not
 * `recipes.*`, because `docs/i18n.md`'s ownership boundary is per directory).
 *
 * ALL NEW COPY — `/plan` did not exist before the i18n port, so every key here
 * is `scripts/i18n-check.ts`'s known false-positive class 1 ("no counterpart in
 * the base tree"). There is nothing to be byte-identical to.
 *
 * Nothing in this file may contain a German recipe term: the day cards render
 * recipe titles and course eyebrows, both of which are CONTENT that arrives
 * from the API, never through this catalog.
 */
import type { NamespaceCatalog } from "@toon/shared";

export const planDe = {
  /* --------------------------- PlanPage / PlanWeekNav ------------------------ */
  "plan.title": "Wochenplan",
  // `{start}`/`{end}` are `formatDate()` output; the dash is an EN DASH
  // (U+2013) with spaces, not a hyphen.
  "plan.weekRange": "{start} – {end}",
  "plan.thisWeek": "Diese Woche",
  "plan.prevWeek": "Vorherige Woche",
  "plan.nextWeek": "Nächste Woche",
  "plan.loading": "Wochenplan wird geladen",
  // The `title` on every disabled plan write — planner writes are online-only.
  "plan.offlineHint": "Planen braucht eine Verbindung.",

  /* -------------------------------- PlanDayCard ------------------------------ */
  // Filled with formatWeekdayShort(date) + formatDayOfMonth(date) — a key
  // rather than a template literal because some locales put the number first.
  "plan.day.eyebrow": "{weekday} {day}",
  // The empty card's whole-button label. The "+" is a lucide `Plus` icon, not
  // part of the string.
  "plan.day.empty": "Planen",
  "plan.day.addAriaLabel": "Rezept für {day} einplanen",
  // Lower-case: appended to the meta line after formatMinutes(...) + " · ",
  // e.g. "15 min · heute" / "1 Std. 15 · gekocht".
  "plan.day.today": "heute",
  "plan.day.cooked": "gekocht",
  "plan.day.more": {
    one: "+{count} weiteres Rezept",
    other: "+{count} weitere Rezepte",
  },

  /* ------------------------- Empty state + recipe picker --------------------- */
  "plan.empty.title": "Diese Woche ist noch nichts geplant.",
  "plan.empty.description": "Tippe auf einen Tag, um ein Rezept einzuplanen.",
  "plan.picker.title": "Rezept für {day} wählen",
  "plan.picker.search": "Rezepte durchsuchen",
  "plan.picker.searchAriaLabel": "Rezepte durchsuchen",
  "plan.picker.empty": "Keine Rezepte gefunden.",
  "plan.picker.loading": "Rezepte werden geladen",

  /* -------------------------- Entry ActionMenu + dialogs ---------------------- */
  "plan.entry.menuLabel": "Aktionen für {title}",
  "plan.entry.openRecipe": "Rezept öffnen",
  "plan.entry.servings": "Portionen ändern",
  "plan.entry.markCooked": "Als gekocht markieren",
  "plan.entry.move": "Auf einen anderen Tag verschieben",
  "plan.entry.addToList": "Zutaten zur Einkaufsliste",
  "plan.entry.remove": "Vom Plan entfernen",

  "plan.servings.title": "Portionen für {day}",
  "plan.servings.reset": "Rezept-Portionen verwenden",
  "plan.servings.submit": "Speichern",

  "plan.move.title": "„{title}“ verschieben",
  "plan.move.dateLabel": "Neues Datum",
  "plan.move.submit": "Verschieben",

  "plan.action.cancel": "Abbrechen",

  /* ---------------------------------- Toasts ---------------------------------- */
  "plan.toast.planned": "Eingeplant.",
  "plan.toast.moved": "Verschoben.",
  "plan.toast.cooked": "Als gekocht markiert.",
  "plan.toast.removed": "Vom Plan entfernt.",
  "plan.toast.failed": "Konnte nicht gespeichert werden.",

  // The ConfirmDialog guarding plan.entry.remove; its buttons reuse the
  // existing ui.confirmDialog.confirm / .cancel.
  "plan.remove.confirmTitle": "„{title}“ vom Plan entfernen?",

  /* ------------------------- WeekStrip (the library strip) -------------------- */
  "plan.strip.heading": "Diese Woche",
  "plan.strip.link": "Planen",
} as const satisfies NamespaceCatalog<"plan">;

export type PlanCatalog = typeof planDe;
