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
  // Two whole sentences rather than one key with a conditional `{synced}` — a placeholder that
  // may be empty renders a dangling `·` (i18n-keys.md §7.1). `{members}` is filled with
  // `t("groups.count.members", { count })`, never inlined, because two pluralised numbers cannot
  // share one plural entry (R-B).
  "shopping.lists.sharedSummary": "Geteilt mit {group} · {members}",
  "shopping.lists.sharedSummarySynced": "Geteilt mit {group} · {members} · {synced}",
  "shopping.lists.syncedRelative": "{relative} synchronisiert",
  "shopping.lists.shopperActive": "{name} kauft gerade ein",
  "shopping.lists.counts": "{open} offen · {bought} heute gekauft",
  "shopping.lists.openList": "Öffnen",
  "shopping.lists.previewMore": { one: "+{count} weitere", other: "+{count} weitere" },
  "shopping.lists.progressAriaLabel": "Fortschritt: {percent} %",
  "shopping.lists.cardMenuLabel": "Aktionen für „{name}“",
  "shopping.lists.allLists": "Alle Listen",

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
  "shopping.detail.backToListsShort": "Listen",
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
  "shopping.detail.subtitle": "{open} offen · {bought} heute gekauft · zum Abhaken antippen",
  "shopping.detail.subtitleShort": "{open} offen · {bought} gekauft · zum Abhaken antippen",
  "shopping.detail.share": "Teilen",
  "shopping.detail.shareCopiedToast": "In die Zwischenablage kopiert",
  "shopping.detail.shareUnavailableToast": "Teilen nicht möglich",
  // Three sort options only (R32), client-side, default "position" — do not add a fourth.
  "shopping.detail.sort.label": "Sortierung",
  "shopping.detail.sort.position": "Reihenfolge",
  "shopping.detail.sort.newest": "Neueste zuerst",
  "shopping.detail.sort.alpha": "A–Z",
  "shopping.suggestion.dismissError": "Vorschlag bleibt bestehen",

  // Clear-list confirm
  "shopping.clear.title": "Liste leeren?",
  "shopping.clear.description": "Alle {itemCount} werden entfernt. „{sectionName}“ bleibt erhalten.",

  // AddItemBar — placeholder now carries the examples; the short form was AddItemBar's only
  // call site and both placements use the longer one (i18n-keys.md §7.8).
  "shopping.addItem.placeholderExamples": "Artikel hinzufügen — „500 g Mehl, 2 Zitronen, Milch“",
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
  // Re-purposed, not deleted: the per-chip `×` is gone, so `dismissAriaLabel` becomes the chip's
  // `title` attribute (advertising the long-press affordance) and `dismissTitle` becomes the
  // ConfirmDialog's confirm-button label. Byte-identical to the pre-redesign value.
  "shopping.frequentlyUsed.dismissAriaLabel": "{name} nicht mehr vorschlagen",
  "shopping.frequentlyUsed.dismissTitle": "Nicht mehr vorschlagen",
  "shopping.frequentlyUsed.showAll": "Alle {count} anzeigen",
  "shopping.frequentlyUsed.hideHint": "Rechtsklick oder langes Drücken versteckt einen Vorschlag.",
  "shopping.frequentlyUsed.hideConfirm.title": "„{name}“ nicht mehr vorschlagen?",
  "shopping.frequentlyUsed.hideConfirm.description":
    "Der Vorschlag verschwindet aus „Häufig gekauft“. Über „Alle anzeigen“ kannst du ihn wieder einblenden.",
  "shopping.frequentlyUsed.hiddenToast": "Wird nicht mehr vorgeschlagen",
  "shopping.frequentlyUsed.showHidden": "Ausgeblendete anzeigen",
  "shopping.frequentlyUsed.unhide": "Wieder vorschlagen",
  "shopping.frequentlyUsed.unhiddenToast": "Wird wieder vorgeschlagen",
  "shopping.frequentlyUsed.addAriaLabel": "„{name}“ zur Liste hinzufügen",

  // ShoppingItemCard (desktop row) + ShoppingItemTile (phone grid)
  "shopping.item.checkAriaLabel": "{name} abhaken",
  "shopping.item.sources": "aus {sources}",
  "shopping.item.sourcesMore": "aus {name} +{count}",
  "shopping.item.edit": "Bearbeiten",
  "shopping.item.remove": "Von der Liste entfernen",
  "shopping.item.check": "Abhaken",
  "shopping.item.details": "Details zu {name}",
  "shopping.item.longPressHint": "Lange auf eine Karte tippen für Details.",

  // ItemDetailDialog
  "shopping.item.detail.amount": "Menge",
  "shopping.item.detail.note": "Notiz",
  "shopping.item.detail.sources": { one: "Aus Rezept", other: "Aus Rezepten" },
  "shopping.item.detail.empty": "Keine weiteren Angaben.",

  // Section headers + the bought section (BoughtSection renders nothing — no header, no empty
  // state — when there are no bought entries, so there is deliberately no `shopping.bought.empty`).
  "shopping.toBuy.heading": "Zu kaufen",
  "shopping.toBuy.headingWithCount": "Zu kaufen · {count}",
  "shopping.bought.heading": "Heute gekauft",
  "shopping.bought.headingWithCount": "Heute gekauft · {count}",
  "shopping.bought.collapse": "Gekauftes einklappen",
  "shopping.bought.expand": "Gekauftes ausklappen",
  // "Gekauftes leeren" is NOT destructive (R31): the confirm says "aus dieser Ansicht entfernen",
  // never "löschen" — POST …/bought/clear moves a watermark, the log rows stay in the history.
  "shopping.bought.clear": "Gekauftes leeren",
  "shopping.bought.clearConfirm.title": "Gekaufte Artikel aus dieser Ansicht entfernen?",
  "shopping.bought.clearConfirm.description":
    "Die Artikel bleiben in der Einkaufshistorie — nur diese Ansicht wird geleert.",
  "shopping.bought.clearConfirm.confirm": "Aus der Ansicht entfernen",
  "shopping.bought.clearedToast": "Ansicht geleert",
  "shopping.bought.rowMeta": "{who} · {when}",
  "shopping.bought.you": "Du",
  "shopping.bought.unknownBuyer": "Unbekannt",
  "shopping.bought.buyers": "{first} +{count}",
  // The undo copy is deliberately not "Undo": re-adding the line MAY merge with what is on the
  // list now, so the merge hint has to be readable before the tap, not after (i18n-keys.md §7.3).
  "shopping.bought.undo": "Zurück auf die Liste",
  "shopping.bought.undoMergeHint":
    "Wenn „{name}“ schon wieder auf der Liste steht, werden die Mengen zusammengerechnet.",
  "shopping.bought.undoSuccess": "„{name}“ steht wieder auf der Liste",
  "shopping.bought.undoFailed": "Konnte nicht zurückgelegt werden",

  // "From this week's plan" (WeekPlanPanel)
  "shopping.fromPlan.title": "Aus dem Wochenplan",
  "shopping.fromPlan.recipeCount": { one: "{count} Rezept", other: "{count} Rezepte" },
  "shopping.fromPlan.ingredientCount": { one: "{count} Zutat", other: "{count} Zutaten" },
  "shopping.fromPlan.missingCount": {
    one: "{count} Zutat noch auf keiner Liste",
    other: "{count} Zutaten noch auf keiner Liste",
  },
  "shopping.fromPlan.subtitle": "{recipes} · {ingredients}",
  "shopping.fromPlan.rowMeta": "{weekday} · {ingredients}",
  // Names the target list — the target is the CLIENT's choice (storageKeys.lastShoppingListId,
  // falling back to the alphabetically first list), never a server-side default (R9).
  "shopping.fromPlan.addAll": "Alles auf „{list}“",
  "shopping.fromPlan.dialog.title": "Aus dem Wochenplan hinzufügen",
  "shopping.fromPlan.dialog.hint": "Wähle ab, was du schon zu Hause hast.",
  "shopping.fromPlan.dialog.submit": {
    one: "{count} Zutat auf „{list}“",
    other: "{count} Zutaten auf „{list}“",
  },
  "shopping.fromPlan.pickList": "Andere Liste wählen",
  "shopping.fromPlan.addedToast": "Auf „{list}“ hinzugefügt",
  "shopping.fromPlan.addFailedToast": "Konnte nicht hinzugefügt werden",
  "shopping.fromPlan.empty": "Vom Wochenplan fehlt nichts mehr auf der Liste.",
  "shopping.fromPlan.noList": "Für den Wochenplan brauchst du erst eine Einkaufsliste.",

  // Bought history: desktop panel + /shopping/history screen
  "shopping.history.title": "Einkaufshistorie",
  "shopping.history.titleShort": "Historie",
  "shopping.history.subtitle": "Alles, was abgehakt wurde — nach Tag.",
  "shopping.history.all": "Alle",
  "shopping.history.today": "Heute",
  "shopping.history.itemCount": { one: "{count} Artikel", other: "{count} Artikel" },
  // {who} = one buyer's name, `shopping.bought.you`, or `shopping.bought.unknownBuyer`
  "shopping.history.dayMeta": "{items} · {who}",
  "shopping.history.dayMetaShort": "{day} · {count}",
  "shopping.history.empty": "Noch nichts gekauft.",
  "shopping.history.loadMore": "Mehr laden",

  // ListRecipesPanel + provenance
  "shopping.listRecipe.heading": "Rezepte auf dieser Liste",
  "shopping.listRecipe.ingredientsOf": "{onList} von {total} Zutaten",
  "shopping.listRecipe.meta": "{ingredients} · {servings}",
  "shopping.listRecipe.remove": "Entfernen",
  "shopping.listRecipe.addRecipe": "Zutaten eines Rezepts hinzufügen",
  "shopping.listRecipe.remove.title": "„{title}“ von der Liste nehmen?",
  // The remove dialog is THREE keys, not one composite sentence (R-B.2): the runtime selects a
  // plural form from exactly one count, so `description` pluralises on the removed count and
  // `sharedNote` pluralises on the shared count, each its own whole sentence. When sharedCount is
  // 0 the dialog renders `descriptionExclusive` alone instead of the pair.
  "shopping.listRecipe.remove.description": {
    one: "Eine Position wird entfernt.",
    other: "{count} Positionen werden entfernt.",
  },
  "shopping.listRecipe.remove.sharedNote": {
    one: "Eine Position bleibt, weil sie auch aus einem anderen Rezept kommt — ihre Menge ändert sich nicht.",
    other:
      "{count} Positionen bleiben, weil sie auch aus anderen Rezepten kommen — ihre Mengen ändern sich nicht.",
  },
  "shopping.listRecipe.remove.descriptionExclusive": {
    one: "Die einzige Position von „{title}“ wird entfernt.",
    other: "Alle {count} Positionen von „{title}“ werden entfernt.",
  },
  "shopping.listRecipe.removedToast": "„{title}“ von der Liste genommen",
  "shopping.listRecipe.removeFailedToast": "Entfernen fehlgeschlagen",
} as const satisfies NamespaceCatalog<"shopping">;

export type ShoppingCatalog = typeof shoppingDe;
