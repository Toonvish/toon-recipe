/**
 * German — namespace "recipes" (see docs/i18n.md §9 for the file's owner).
 * Covers `features/recipes/**`: the list/detail/new/edit screens, the recipe
 * form, the ingredients/steps editors, the servings scaler, cook mode and the
 * image picker.
 */
import type { NamespaceCatalog } from "@toon/shared";

export const recipesDe = {
  /* ------------------------------ enum labels ------------------------------- */
  // `RecipeSort` is the domain value (locked); only the label moves. See
  // components/RecipeFilters.tsx.
  "recipes.sort.newest": "Neueste zuerst",
  "recipes.sort.oldest": "Älteste zuerst",
  "recipes.sort.title": "Titel (A–Z)",
  "recipes.sort.rating": "Beste Bewertung",
  "recipes.sort.time": "Kürzeste Zeit",

  // `Difficulty` ("einfach"/"mittel"/"schwer") is the WIRE value and stays
  // locked; only the label moves here. Resolved through DIFFICULTY_LABEL_KEYS
  // (lib/difficultyLabels.ts) at render time, never frozen at import time.
  "recipes.difficulty.einfach": "Einfach",
  "recipes.difficulty.mittel": "Mittel",
  "recipes.difficulty.schwer": "Schwer",

  // `lastCooked` label for `SORT_LABELS` (features/recipes/lib/format.ts, T8.1). The
  // wire value `"lastCooked"` is locked in packages/shared; only the label moves.
  "recipes.sort.lastCooked": "Zuletzt gekocht",

  /* -------------------------------- RecipeListPage --------------------------- */
  "recipes.list.title": "Rezepte",
  "recipes.list.groupSummary": { one: "{name} · {count} Rezept", other: "{name} · {count} Rezepte" },
  "recipes.list.importAction": "Importieren",
  "recipes.list.newAction": "Neu",
  "recipes.list.empty.filtered.title": "Keine Treffer",
  "recipes.list.empty.filtered.description":
    "Für diese Suche und Filter gibt es kein Rezept. Setze die Filter zurück oder suche anders.",
  "recipes.list.empty.none.title": "Noch keine Rezepte",
  "recipes.list.empty.none.description":
    "Lege dein erstes Rezept an oder importiere es aus einer Website, einem Foto oder einem PDF.",
  "recipes.list.empty.createAction": "Rezept anlegen",
  "recipes.list.empty.importAction": "Rezept importieren",
  "recipes.list.resultsCount": { one: "{shown} von {count} Rezept", other: "{shown} von {count} Rezepten" },
  "recipes.list.loadMore": "Mehr laden",
  "recipes.list.refreshing": "Liste wird aktualisiert",
  // The library search field: a plural key with a count from `totalCount`, not a
  // static placeholder (i18n-keys.md §8.1) — falls back to no count while it's
  // `undefined` (render nothing, never "0").
  "recipes.list.searchPlaceholder": {
    one: "{count} Rezept durchsuchen",
    other: "{count} Rezepte durchsuchen",
  },
  "recipes.list.sharedSummary": "Geteilt mit {group} · {members} · {recipes}",
  "recipes.list.filterAction": "Filter",
  "recipes.list.filterActionWithCount": "Filter · {count}",
  "recipes.list.allRecipes": "Alle Rezepte",
  "recipes.list.recentlyCooked": "Kürzlich gekocht",
  "recipes.list.rowMeta": "{time} · {servings}",
  "recipes.list.cookedRelative": "Gekocht {relative}",

  /* -------------------------------- LibraryCreateMenu (the "+" sheet) --------- */
  // Composed mostly of existing keys (recipes.list.newAction, ui.sidenav.newRecipe,
  // ui.nav.import) plus these three — see i18n-keys.md §8.2 for the slot map.
  "recipes.create.triggerLabel": "Rezept hinzufügen",
  "recipes.create.newRecipeHint": "Von Hand eingeben",
  "recipes.create.importHint": "Aus URL, Foto oder PDF",

  /* -------------------------------- RecipeNewPage ----------------------------- */
  "recipes.new.title": "Neues Rezept",
  "recipes.new.submit": "Rezept speichern",
  "recipes.new.imageHint": "Wird direkt nach dem Speichern hochgeladen.",
  "recipes.new.photoUploadFailedToast": "Rezept gespeichert, das Foto konnte aber nicht hochgeladen werden",
  "recipes.new.createdToast": "Rezept angelegt",
  "recipes.new.noGroup.title": "Keine aktive Gruppe",
  "recipes.new.noGroup.description":
    "Wähle oben eine Gruppe aus oder lege eine neue an, um Rezepte zu speichern.",
  "recipes.new.noGroup.action": "Zu den Gruppen",

  /* -------------------------------- RecipeEditPage ---------------------------- */
  "recipes.edit.title": "Rezept bearbeiten",
  "recipes.edit.submit": "Änderungen speichern",
  "recipes.edit.photoUploadFailedToast": "Das Foto konnte nicht hochgeladen werden",
  "recipes.edit.savedToast": "Änderungen gespeichert",
  "recipes.edit.forbidden.title": "Bearbeiten nicht erlaubt",
  "recipes.edit.forbidden.description":
    "Dieses Rezept darf nur die Autorin bzw. der Autor oder eine Administratorin bearbeiten.",

  /* -------------------------------- shared actions ---------------------------- */
  "recipes.action.backToList": "Zur Rezeptliste",
  "recipes.action.backToRecipe": "Zum Rezept",
  "recipes.detail.loading": "Rezept wird geladen …",

  /* -------------------------------- RecipeDetailPage -------------------------- */
  "recipes.detail.actionsMenuLabel": "Rezept-Aktionen",
  "recipes.detail.actions.edit": "Bearbeiten",
  "recipes.detail.actions.share": "Teilen",
  "recipes.detail.actions.copyText": "Als Text kopieren",
  "recipes.detail.actions.print": "Drucken",
  "recipes.detail.actions.duplicate": "Duplizieren",
  "recipes.detail.actions.duplicating": "Kopie wird angelegt …",
  "recipes.detail.actions.delete": "Löschen",
  "recipes.detail.imageAlt": "Foto von {title}",
  "recipes.detail.byline": "Von {author} · {date}",
  "recipes.detail.shareCopiedToast": "In die Zwischenablage kopiert",
  "recipes.detail.shareUnavailableToast": "Teilen nicht möglich",
  "recipes.detail.copiedToast": "Rezept kopiert",
  "recipes.detail.copiedScaledDetail": "Skaliert auf {servings}",
  "recipes.detail.copyUnavailableToast": "Kopieren nicht möglich",
  "recipes.detail.duplicatedToast": "Kopie angelegt",
  "recipes.detail.duplicateFailedToast": "Duplizieren fehlgeschlagen",
  "recipes.detail.meta.servings": "Portionen",
  "recipes.detail.meta.prep": "Arbeitszeit",
  "recipes.detail.meta.cook": "Backzeit",
  "recipes.detail.meta.total": "Gesamt",
  "recipes.detail.scaledNote":
    "Mengen umgerechnet (Faktor {factor}). Prisen und Spritzer bleiben unverändert.",
  "recipes.detail.addToShoppingList": "Zur Einkaufsliste",
  "recipes.detail.resetChecked": "Zurücksetzen ({count})",
  "recipes.detail.cookModeAction": "Kochmodus",
  "recipes.detail.notesHeading": "Notizen",
  "recipes.detail.sourceHeading": "Quelle",
  "recipes.detail.addedToListToast": "Auf der Einkaufsliste",
  "recipes.detail.addedToListDetail": {
    one: "{listName} · {count} Position",
    other: "{listName} · {count} Positionen",
  },
  "recipes.detail.addToListFailedToast": "Konnte nicht hinzugefügt werden",
  "recipes.detail.deleteConfirm.title": "Rezept löschen?",
  "recipes.detail.deleteConfirm.description":
    "„{title}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.",
  "recipes.detail.deleteConfirm.confirm": "Löschen",
  "recipes.detail.deletedToast": "Rezept gelöscht",
  "recipes.detail.deleteFailedToast": "Löschen fehlgeschlagen",

  // recipes.detail.planDayAction and .cookedAction take useCanMutate() (online-only);
  // recipes.detail.addToShoppingList above stays on useEmailVerificationBlock()
  // because it queues offline — two gates on one screen, deliberately not unified
  // (R38, i18n-keys.md §8.5).
  "recipes.detail.planDayAction": "Für einen Tag planen",
  "recipes.detail.cookedAction": "Gekocht",
  "recipes.detail.markCookedAriaLabel": "Als gekocht markieren",
  "recipes.detail.cookedToast": "Als gekocht markiert",
  // R18's 10-minute, own-row-only undo, offered in the success Toast (T8.4).
  "recipes.detail.cookedUndo": "Rückgängig",
  "recipes.detail.cookedUndoneToast": "Rückgängig gemacht",
  "recipes.detail.cookedFailedToast": "Konnte nicht gespeichert werden",
  // .meta.lastCooked (desktop) and .meta.cooked (phone 4-up grid) are two keys for
  // the same English word in different slots, split so a translator can shorten
  // the phone caption without touching the desktop one.
  "recipes.detail.meta.lastCooked": "Zuletzt gekocht",
  "recipes.detail.meta.cooked": "Gekocht",
  "recipes.detail.meta.never": "noch nie",
  "recipes.detail.stepCount": { one: "{count} Schritt", other: "{count} Schritte" },
  "recipes.detail.tabs.ingredients": "Zutaten · {count}",
  "recipes.detail.tabs.steps": "Zubereitung · {count}",
  "recipes.detail.backAriaLabel": "Zurück",
  "recipes.detail.planDialogTitle": "„{title}“ einplanen",
  // The date input under the week chips — any day outside the week shown above.
  "recipes.detail.planDialog.dateLabel": "Anderes Datum",

  "recipes.rating.outOfFive": "von 5 Sternen",

  /* -------------------------------- ingredients / steps (shared) -------------- */
  "recipes.ingredients.heading": "Zutaten",
  "recipes.ingredients.count": { one: "{count} Zutat", other: "{count} Zutaten" },
  "recipes.ingredients.empty": "Für dieses Rezept sind keine Zutaten erfasst.",
  "recipes.steps.heading": "Zubereitung",
  "recipes.steps.empty": "Für dieses Rezept sind keine Schritte erfasst.",
  "recipes.steps.doneSr": "erledigt",
  "recipes.steps.markDoneSr": "als erledigt markieren",
  "recipes.editor.positionOf": "Position {index} von {total}",
  "recipes.editor.cancel": "Abbrechen",
  "recipes.editor.apply": "Übernehmen",

  /* -------------------------------- plain-text export ------------------------- */
  "recipes.plainText.totalTime": "Gesamtzeit: {time}",
  "recipes.plainText.ingredientsHeading": "Zutaten:",
  "recipes.plainText.stepsHeading": "Zubereitung:",
  "recipes.plainText.notesHeading": "Notizen:",
  "recipes.plainText.sourceLine": "Quelle: {url}",

  /* -------------------------------- duplicate suffix -------------------------- */
  "recipes.duplicateSuffix": "{title} (Kopie)",

  /* -------------------------------- RecipeForm --------------------------------- */
  "recipes.form.title.label": "Titel",
  "recipes.form.title.placeholder": "Apfelkuchen vom Blech",
  "recipes.form.description.label": "Kurzbeschreibung",
  "recipes.form.description.placeholder": "Saftig, schnell gebacken und perfekt für Besuch.",
  "recipes.form.detailsHeading": "Angaben",
  "recipes.form.servingsAmount.label": "Portionen",
  "recipes.form.servingsAmount.placeholder": "4",
  "recipes.form.servingsUnit.label": "Einheit",
  "recipes.form.prepMinutes.label": "Arbeitszeit (Min.)",
  "recipes.form.prepMinutes.placeholder": "20",
  "recipes.form.cookMinutes.label": "Backzeit (Min.)",
  "recipes.form.cookMinutes.placeholder": "35",
  "recipes.form.totalMinutes.label": "Gesamtzeit (Min.)",
  "recipes.form.totalMinutes.placeholder": "55",
  "recipes.form.totalMinutes.hint": "Vorschlag aus Arbeits- + Backzeit: {minutes} Min.",
  "recipes.form.difficulty.label": "Schwierigkeit",
  "recipes.form.difficulty.none": "Keine Angabe",
  "recipes.form.rating.label": "Bewertung",
  "recipes.form.rating.none": "Keine Bewertung",
  "recipes.form.rating.stars": { one: "{count} Stern", other: "{count} Sterne" },
  // Single-select over the group's kind==="course" tags plus .none — this is where
  // the "one course per recipe" invariant actually lives (no DB constraint enforces
  // it). Writes CreateRecipeRequest.course, a tag NAME, not an id. Option labels are
  // the German tag names rendered verbatim — CONTENT, not this key.
  "recipes.form.course.label": "Gang",
  "recipes.form.course.none": "Keine Angabe",
  "recipes.form.course.hint": "Ein Rezept hat genau einen Gang. Alles andere sind Tags.",
  "recipes.form.collectionsLegend": "Sammlungen",
  "recipes.form.notes.label": "Notizen",
  "recipes.form.notes.placeholder": "Mit Vanilleeis servieren. Hält sich 2 Tage.",
  "recipes.form.sourceUrl.label": "Quelle (URL)",
  "recipes.form.sourceName.label": "Quelle (Name)",
  "recipes.form.cancel": "Abbrechen",
  "recipes.form.unsavedConfirm.title": "Ungespeicherte Änderungen",
  "recipes.form.unsavedConfirm.description": "Wenn du diese Seite verlässt, gehen deine Eingaben verloren.",
  "recipes.form.unsavedConfirm.confirm": "Verlassen",
  "recipes.form.unsavedConfirm.cancel": "Hier bleiben",

  /* -------------------------------- RecipeFilters ------------------------------ */
  // recipes.filters.searchPlaceholder is GONE: RecipeFilters.tsx is deleted (T8.2)
  // and the search field moves into RecipeListPage with recipes.list.searchPlaceholder
  // above. searchAriaLabel is kept — a placeholder is not an accessible name.
  "recipes.filters.searchAriaLabel": "Rezepte durchsuchen",
  // recipes.filters.advancedToggle ("Erweiterte Suche") is GONE: its only call site was
  // RecipeFilters.tsx, deleted in this same commit (T8.2). The rail is now permanent on
  // desktop and the phone trigger is `recipes.list.filterAction` ("Filter") next to the
  // search field, with `moreFilters` ("Mehr Filter") for the inner disclosure — grep
  // found no other reference, so the key is deleted rather than left as dead copy
  // (i18n-keys.md §15 G3).
  "recipes.filters.sheetTitle": "Filter",
  // The rail's HEADING for the course group is interface; the course NAMES listed
  // under it are CONTENT and never go through t() — i18n-keys.md §8.3.
  "recipes.filters.courseLegend": "Gänge",
  "recipes.filters.courseAny": "Alle Gänge",
  "recipes.filters.moreFilters": "Mehr Filter",
  // The only phone route to /collections and /tags (R30) — repeated in both the
  // rail and the "Mehr Filter" sheet.
  "recipes.filters.manageCollections": "Sammlungen verwalten",
  "recipes.filters.manageTags": "Tags verwalten",
  "recipes.filters.sort.label": "Sortierung",
  "recipes.filters.collection.label": "Sammlung",
  "recipes.filters.collection.all": "Alle Sammlungen",
  "recipes.filters.maxDuration.label": "Maximale Dauer",
  "recipes.filters.maxDuration.any": "Beliebige Dauer",
  "recipes.filters.maxDuration.upTo15": "bis 15 Min.",
  "recipes.filters.maxDuration.upTo30": "bis 30 Min.",
  "recipes.filters.maxDuration.upTo45": "bis 45 Min.",
  "recipes.filters.maxDuration.upTo60": "bis 1 Std.",
  "recipes.filters.maxDuration.upTo120": "bis 2 Std.",
  "recipes.filters.difficulty.label": "Schwierigkeit",
  "recipes.filters.difficulty.any": "Jede Schwierigkeit",
  "recipes.filters.tagsLegend": "Tags",
  "recipes.filters.tagsEmpty": "Noch keine Tags in dieser Gruppe. Tags entstehen beim Anlegen eines Rezepts.",
  "recipes.filters.tagsAllRequired": "Ein Rezept muss ALLE gewählten Tags haben.",
  "recipes.filters.resultsCount": { one: "{count} Rezept gefunden", other: "{count} Rezepte gefunden" },
  "recipes.filters.reset": "Filter zurücksetzen",

  /* -------------------------------- IngredientsEditor -------------------------- */
  "recipes.ingredientsEditor.insertAction": "Zutaten einfügen",
  "recipes.ingredientsEditor.status.moved": "Zutat an Position {position} verschoben.",
  "recipes.ingredientsEditor.status.removed": "Zutat entfernt.",
  "recipes.ingredientsEditor.status.added": "Zutat hinzugefügt.",
  "recipes.ingredientsEditor.status.reparsed": "Zeile neu erkannt.",
  "recipes.ingredientsEditor.status.pasteEmpty": "Keine Zutaten erkannt.",
  "recipes.ingredientsEditor.status.pasted": {
    one: "{count} Zutat übernommen.",
    other: "{count} Zutaten übernommen.",
  },
  "recipes.ingredientsEditor.section.label": "Abschnitt",
  "recipes.ingredientsEditor.section.placeholder": "z. B. Für den Teig",
  "recipes.ingredientsEditor.quantity.label": "Menge",
  "recipes.ingredientsEditor.unit.label": "Einheit",
  "recipes.ingredientsEditor.name.label": "Zutat",
  "recipes.ingredientsEditor.name.placeholder": "Mehl",
  "recipes.ingredientsEditor.quantityMax.label": "bis",
  "recipes.ingredientsEditor.note.label": "Notiz",
  "recipes.ingredientsEditor.note.placeholder": "fein gehackt",
  "recipes.ingredientsEditor.reparseAction": "Zutat {index} neu erkennen",
  "recipes.ingredientsEditor.moveUpAction": "Zutat {index} nach oben",
  "recipes.ingredientsEditor.moveDownAction": "Zutat {index} nach unten",
  "recipes.ingredientsEditor.removeAction": "Zutat {index} entfernen",
  "recipes.ingredientsEditor.addAction": "Zutat hinzufügen",
  "recipes.ingredientsEditor.addSameSectionAction": "Weitere im gleichen Abschnitt",
  "recipes.ingredientsEditor.dialog.description":
    "Eine Zutat pro Zeile. Zeilen wie „Für den Teig:“ werden zu Abschnitten. Mengen, Einheiten und Notizen werden automatisch erkannt.",
  "recipes.ingredientsEditor.dialog.textareaLabel": "Zutatenliste",

  /* -------------------------------- StepsEditor --------------------------------- */
  "recipes.stepsEditor.insertAction": "Text einfügen",
  "recipes.stepsEditor.status.moved": "Schritt an Position {position} verschoben.",
  "recipes.stepsEditor.status.removed": "Schritt entfernt.",
  "recipes.stepsEditor.status.added": "Schritt hinzugefügt.",
  "recipes.stepsEditor.status.pasteEmpty": "Keine Schritte erkannt.",
  "recipes.stepsEditor.status.pasted": {
    one: "{count} Schritt übernommen.",
    other: "{count} Schritte übernommen.",
  },
  "recipes.stepsEditor.section.placeholder": "z. B. Teig zubereiten",
  "recipes.stepsEditor.text.label": "Schritt {index}",
  "recipes.stepsEditor.text.placeholder": "Mehl, Backpulver und Salz in einer Schüssel vermischen.",
  "recipes.stepsEditor.moveUpAction": "Schritt {index} nach oben",
  "recipes.stepsEditor.moveDownAction": "Schritt {index} nach unten",
  "recipes.stepsEditor.removeAction": "Schritt {index} entfernen",
  "recipes.stepsEditor.addAction": "Schritt hinzufügen",
  "recipes.stepsEditor.addSameSectionAction": "Weiterer im gleichen Abschnitt",
  "recipes.stepsEditor.dialog.title": "Zubereitung einfügen",
  "recipes.stepsEditor.dialog.description":
    "Nummerierte Schritte („1.“, „Schritt 2)“) oder Absätze werden automatisch getrennt.",
  "recipes.stepsEditor.dialog.textareaLabel": "Zubereitungstext",
  "recipes.stepsEditor.dialog.placeholder":
    "1. Backofen auf 180 °C vorheizen.\n2. Mehl und Backpulver vermischen.\n3. Eier unterrühren.",

  /* -------------------------------- ServingsScaler ------------------------------ */
  "recipes.scaler.srLabel": "Anzahl {noun}",
  "recipes.scaler.decreaseAction": "Weniger {noun}",
  "recipes.scaler.increaseAction": "Mehr {noun}",
  "recipes.scaler.resetAction": "Original",

  /* -------------------------------- RecipeImagePicker --------------------------- */
  "recipes.imagePicker.label": "Bild",
  "recipes.imagePicker.previewAlt": "Vorschau des Rezeptbildes",
  "recipes.imagePicker.empty": "Noch kein Bild",
  "recipes.imagePicker.takePhoto": "Foto aufnehmen",
  "recipes.imagePicker.choosePhoto": "Bild auswählen",
  "recipes.imagePicker.urlToggle": "Bild-URL",
  "recipes.imagePicker.remove": "Entfernen",
  "recipes.imagePicker.tooLarge": "Das Bild ist {size} groß. Maximal 15 MB sind erlaubt.",
  "recipes.imagePicker.invalidType": "Bitte wähle eine Bilddatei.",

  /* -------------------------------- CookMode ------------------------------------ */
  "recipes.cookMode.dialogLabel": "Kochmodus: {title}",
  "recipes.cookMode.wakeLock.active": "Display bleibt an",
  "recipes.cookMode.wakeLock.inactiveTitle": "Display-Sperre nicht aktiv",
  "recipes.cookMode.wakeLock.inactiveText": "Display kann sperren",
  "recipes.cookMode.closeAction": "Kochmodus beenden",
  "recipes.cookMode.stepOf": "Schritt {current} von {total}",
  "recipes.cookMode.back": "Zurück",
  "recipes.cookMode.doneLabel": "Erledigt",
  "recipes.cookMode.finish": "Fertig",
  "recipes.cookMode.next": "Weiter",
  "recipes.cookMode.progressAriaLabel": "Fortschritt",
} as const satisfies NamespaceCatalog<"recipes">;

export type RecipesCatalog = typeof recipesDe;
