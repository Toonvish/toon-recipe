/**
 * English — namespace "plan". See `plan.de.ts` for who owns this file and why
 * every key here is new copy with no base-tree counterpart.
 */
import type { LocaleCatalog } from "@toon/shared";
import type { PlanCatalog } from "./plan.de.ts";

export const planEn: LocaleCatalog<PlanCatalog> = {
  /* --------------------------- PlanPage / PlanWeekNav ------------------------ */
  "plan.title": "Meal plan",
  "plan.weekRange": "{start} – {end}",
  "plan.thisWeek": "This week",
  "plan.prevWeek": "Previous week",
  "plan.nextWeek": "Next week",
  "plan.loading": "Loading meal plan",
  "plan.offlineHint": "Planning needs a connection.",

  /* -------------------------------- PlanDayCard ------------------------------ */
  "plan.day.eyebrow": "{weekday} {day}",
  "plan.day.empty": "Plan",
  "plan.day.addAriaLabel": "Plan a recipe for {day}",
  "plan.day.today": "today",
  "plan.day.cooked": "cooked",
  "plan.day.more": {
    one: "+{count} more recipe",
    other: "+{count} more recipes",
  },

  /* ------------------------- Empty state + recipe picker --------------------- */
  "plan.empty.title": "Nothing is planned for this week yet.",
  "plan.empty.description": "Tap a day to plan a recipe.",
  "plan.picker.title": "Choose a recipe for {day}",
  "plan.picker.search": "Search recipes",
  "plan.picker.searchAriaLabel": "Search recipes",
  "plan.picker.empty": "No recipes found.",
  "plan.picker.loading": "Loading recipes",

  /* -------------------------- Entry ActionMenu + dialogs ---------------------- */
  "plan.entry.menuLabel": "Actions for {title}",
  "plan.entry.openRecipe": "Open recipe",
  "plan.entry.servings": "Change servings",
  "plan.entry.markCooked": "Mark as cooked",
  "plan.entry.move": "Move to another day",
  "plan.entry.addToList": "Ingredients to the shopping list",
  "plan.entry.remove": "Remove from the plan",

  "plan.servings.title": "Servings for {day}",
  "plan.servings.reset": "Use the recipe's servings",
  "plan.servings.submit": "Save",

  "plan.move.title": "Move “{title}”",
  "plan.move.dateLabel": "New date",
  "plan.move.submit": "Move",

  "plan.action.cancel": "Cancel",

  /* ---------------------------------- Toasts ---------------------------------- */
  "plan.toast.planned": "Planned.",
  "plan.toast.moved": "Moved.",
  "plan.toast.cooked": "Marked as cooked.",
  "plan.toast.removed": "Removed from the plan.",
  "plan.toast.failed": "Could not be saved.",

  "plan.remove.confirmTitle": "Remove “{title}” from the plan?",

  /* ------------------------- WeekStrip (the library strip) -------------------- */
  "plan.strip.heading": "This week",
  "plan.strip.link": "Plan",
};
