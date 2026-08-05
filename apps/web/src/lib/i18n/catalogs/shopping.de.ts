/**
 * German — namespace "shopping" (see docs/i18n.md §9 for the file's owner).
 * Covers apps/web/src/features/shopping/** — lists, list detail, "Häufig
 * gekauft", AddRecipeToListDialog, and the sticky add bar.
 */
import type { NamespaceCatalog } from "@toon/shared";

export const shoppingDe = {
  // ShoppingListsPage — overview
  "shopping.lists.heading": "Einkaufen",
  "shopping.lists.subtitle": "Gemeinsame Einkaufslisten für die ganze Gruppe.",
  "shopping.lists.create": "Liste anlegen",
  "shopping.lists.offlineHint": "Dafür brauchst du eine Verbindung",
  "shopping.lists.empty.title": "Noch keine Einkaufsliste",
  "shopping.lists.empty.description":
    "Lege eine Liste an, füge Artikel hinzu oder schicke ein ganzes Rezept darauf — die Mengen werden für die gewünschte Portionszahl umgerechnet.",
  "shopping.lists.empty.action": "Erste Liste anlegen",
  "shopping.lists.rename": "Umbenennen",
  "shopping.lists.delete": "Liste löschen",

  // Shared across list row, detail header, delete/clear confirms, AddRecipeToListDialog
  "shopping.list.empty": "leer",
  "shopping.list.itemCount": { one: "{count} Position", other: "{count} Positionen" },
  "shopping.list.name.label": "Name",
  "shopping.list.name.placeholder": "z. B. Rewe",
  "shopping.list.defaultName": "Einkaufsliste",

  // Generic actions reused across the shopping dialogs
  "shopping.action.cancel": "Abbrechen",
  "shopping.action.save": "Speichern",
  "shopping.action.create": "Anlegen",
  "shopping.action.delete": "Löschen",
  "shopping.action.clear": "Leeren",
  "shopping.action.add": "Hinzufügen",

  // CreateListDialog
  "shopping.create.title": "Einkaufsliste anlegen",
  "shopping.create.success": "„{name}“ angelegt",

  // RenameListDialog
  "shopping.rename.title": "Liste umbenennen",

  // DeleteListDialog
  "shopping.delete.title": "Einkaufsliste löschen?",
  "shopping.delete.confirmDescription":
    "„{name}“ und alle {itemCount} werden gelöscht. Das lässt sich nicht rückgängig machen.",
  "shopping.delete.success": "„{name}“ gelöscht",
  "shopping.delete.error": "Löschen fehlgeschlagen",

  // ShoppingListDetailPage
  "shopping.detail.backToLists": "Alle Listen",
  "shopping.detail.allDone": "Alles erledigt",
  "shopping.detail.queuedCount": {
    one: "{count} Änderung wartet",
    other: "{count} Änderungen warten",
  },
  "shopping.detail.clearList": "Liste leeren",
  "shopping.detail.offlineBanner":
    "Offline — Abhaken und Hinzufügen funktionieren trotzdem und werden später synchronisiert.",
  "shopping.detail.empty.title": "Nichts mehr zu kaufen",
  "shopping.detail.empty.descriptionWithCatalog":
    "Tippe unten auf einen Vorschlag oder gib etwas Neues ein.",
  "shopping.detail.empty.description":
    "Füge unten Artikel hinzu — oder schicke ein ganzes Rezept aus der Rezeptansicht hierher.",
  "shopping.suggestion.dismissError": "Vorschlag bleibt bestehen",

  // Clear-list confirm
  "shopping.clear.title": "Liste leeren?",
  "shopping.clear.description": "Alle {itemCount} werden entfernt. „{sectionName}“ bleibt erhalten.",

  // AddItemBar
  "shopping.addItem.placeholder": "z. B. 500 g Mehl",
  "shopping.addItem.ariaLabel": "Artikel hinzufügen",
  "shopping.addItem.previewLabel": "Wird hinzugefügt:",

  // AddRecipeToListDialog
  "shopping.addRecipe.title": "Zur Einkaufsliste",
  "shopping.addRecipe.submit": {
    one: "{count} Position hinzufügen",
    other: "{count} Positionen hinzufügen",
  },
  "shopping.addRecipe.listsLoading": "Einkaufslisten werden geladen",
  "shopping.addRecipe.noLists": "Diese Gruppe hat noch keine Einkaufsliste. Leg gleich hier eine an.",
  "shopping.addRecipe.createListError": "Liste konnte nicht angelegt werden.",
  "shopping.addRecipe.createOffline":
    "Dafür brauchst du eine Internetverbindung — Listen anlegen geht nicht offline.",
  "shopping.addRecipe.list.label": "Liste",
  "shopping.addRecipe.servings.label": "Portionen",
  "shopping.addRecipe.servings.hint": "Die Mengen werden entsprechend umgerechnet.",
  "shopping.addRecipe.noServings":
    "Dieses Rezept hat keine Portionsangabe, die Mengen werden unverändert übernommen.",
  "shopping.addRecipe.ingredients.heading": "Zutaten",
  "shopping.addRecipe.selectAll": "Alle",
  "shopping.addRecipe.selectAtLeastOne": "Wähle mindestens eine Zutat aus.",
  "shopping.addRecipe.mergeNotice": {
    one: "Wird zu {count} Position zusammengefasst. Gleiche Artikel werden mit dem zusammengezählt, was schon auf der Liste steht.",
    other:
      "Wird zu {count} Positionen zusammengefasst. Gleiche Artikel werden mit dem zusammengezählt, was schon auf der Liste steht.",
  },
  "shopping.addRecipe.mergeHint":
    "Gleiche Artikel werden mit dem zusammengezählt, was schon auf der Liste steht.",
  "shopping.addRecipe.noIngredients":
    "Dieses Rezept hat keine Zutaten, die auf eine Einkaufsliste passen.",

  // EditItemDialog
  "shopping.editItem.title": "Position bearbeiten",
  "shopping.editItem.name.label": "Artikel",
  "shopping.editItem.quantity.label": "Menge",
  "shopping.editItem.quantity.placeholder": "leer = ohne Menge",
  "shopping.editItem.quantity.error": "Bitte eine Zahl eingeben",
  "shopping.editItem.unit.label": "Einheit",
  "shopping.editItem.unit.placeholder": "g, ml, Stück …",
  "shopping.editItem.note.label": "Notiz",
  "shopping.editItem.note.placeholder": "z. B. laktosefrei",
  "shopping.editItem.mergeWarning":
    "„{name}“ steht schon auf der Liste — die beiden Positionen werden zusammengefasst.",

  // FrequentlyUsed
  "shopping.frequentlyUsed.heading": "Häufig gekauft",
  "shopping.frequentlyUsed.dismissAriaLabel": "{name} nicht mehr vorschlagen",
  "shopping.frequentlyUsed.dismissTitle": "Nicht mehr vorschlagen",

  // ShoppingItemCard
  "shopping.item.checkAriaLabel": "{name} abhaken",
  "shopping.item.sources": "aus {sources}",
  "shopping.item.edit": "Bearbeiten",
  "shopping.item.remove": "Von der Liste entfernen",
} as const satisfies NamespaceCatalog<"shopping">;

export type ShoppingCatalog = typeof shoppingDe;
