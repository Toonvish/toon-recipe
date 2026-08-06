/**
 * German — namespace "import" (see docs/i18n.md §9 for the file's owner).
 * Skeleton: the foundation wires this namespace up; the port agent for
 * "import" adds keys here (and to import.en.ts) as it moves strings out of
 * its screens. Empty is a valid, final shape until then.
 */
import type { NamespaceCatalog } from "@toon/shared";

export const importDe = {
  /* ------------------------------- /import -------------------------------- */
  "import.page.title": "Rezept importieren",
  "import.page.subtitle.ocr":
    "Aus dem Netz, vom Kochbuch-Foto oder aus einem PDF. Vor dem Speichern kannst du alles prüfen und korrigieren.",
  "import.page.subtitle.noOcr":
    "Aus dem Netz oder als eingefügter Text. Vor dem Speichern kannst du alles prüfen und korrigieren.",
  "import.page.offline.ocr":
    "Offline — Importieren braucht eine Verbindung, weil die Texterkennung auf dem Server läuft. Gespeicherte Rezepte kannst du weiterhin ansehen und nachkochen.",
  "import.page.offline.url":
    "Offline — Importieren braucht eine Verbindung, weil der Server die Seite abrufen muss. Gespeicherte Rezepte kannst du weiterhin ansehen und nachkochen.",
  "import.page.toast.noGroup.title": "Keine Gruppe ausgewählt",
  "import.page.toast.noGroup.description": "Wähle zuerst die Gruppe, in die das Rezept importiert werden soll.",
  "import.common.targetGroup": "Ziel-Gruppe",
  "import.page.savingToGroup": "Wird gespeichert in {groupName}",

  "import.page.url.heading": "Von einer Webseite",
  "import.page.url.subtitle": "Link einfügen, wir lesen das Rezept aus.",
  "import.page.url.placeholder": "https://www.chefkoch.de/rezepte/…",
  "import.page.url.ariaLabel": "Rezept-URL",
  "import.page.url.pasteLabel": "Aus Zwischenablage einfügen",
  "import.page.url.invalid":
    "Das sieht noch nicht nach einer vollständigen Adresse aus – sie muss mit http:// oder https:// beginnen.",
  "import.page.url.hint":
    "Getestet mit {first} und {second}. Andere Seiten funktionieren, wenn sie Rezeptdaten im Standardformat mitliefern.",
  "import.page.url.submit": "Rezept laden",
  "import.page.url.retryPhoto": "Trotzdem als Foto importieren",
  "import.page.url.retryText": "Text von Hand einfügen",

  "import.page.photo.heading": "Foto vom Rezept",
  "import.page.photo.subtitle": "Kochbuch, Zeitschrift, Zettel – die Texterkennung läuft auf dem Server.",
  "import.page.photo.tip":
    "Tipp: gerade von oben fotografieren, gutes Licht, keine Schatten. Bilder werden vor dem Upload automatisch verkleinert.",
  "import.page.photo.count": { one: "{count} Foto · {bytes}", other: "{count} Fotos · {bytes}" },
  "import.page.photo.merge": "werden zu einer Vorlage zusammengefügt",
  "import.page.photo.altSelected": "Ausgewähltes Foto {index}",
  "import.page.photo.remove": "Foto {index} entfernen",
  "import.page.photo.submit": { one: "Foto importieren", other: "{count} Fotos importieren" },
  "import.page.photo.invalidFile": "„{filename}“ ist kein Bild. Erlaubt sind JPEG, PNG, WebP oder HEIC.",
  "import.page.photo.subjectCount": "{count} Fotos",

  "import.page.document.heading": "PDF oder Bilddatei",
  "import.page.document.subtitle": "Bei PDFs wird zuerst die Textebene gelesen – das ist exakt und schnell.",
  // Der kleine Build: Foto-Erkennung an, PDF-Import aus (IMPORT_PDF_ENABLED=0).
  "import.page.document.headingImageOnly": "Bilddatei",
  "import.page.document.subtitleImageOnly":
    "PDF-Import ist auf diesem Server aus – Bilddateien werden gelesen.",
  "import.page.document.dragHint": "Datei hierher ziehen oder",
  "import.page.document.pick": "Datei auswählen",
  "import.page.document.formats": "PDF, JPEG, PNG, WebP oder HEIC · max. {size}",
  "import.page.document.formatsImageOnly": "JPEG, PNG, WebP oder HEIC · max. {size}",
  "import.page.document.remove": "Datei entfernen",
  "import.page.document.submit": "Datei importieren",
  "import.page.document.invalid": "Bitte eine PDF-Datei oder ein Bild auswählen.",
  "import.page.document.invalidImageOnly": "Bitte ein Bild auswählen.",
  "import.page.document.pdfUnavailable":
    "PDF-Import ist auf diesem Server aus. Ein Foto der Seite funktioniert.",
  "import.page.document.retryPhoto": "Stattdessen Foto aufnehmen",

  "import.page.text.heading": "Text einfügen",
  "import.page.text.subtitle": "Wenn du das Rezept schon als Text hast – z. B. aus einer Nachricht.",
  "import.page.text.toggleClose": "schließen",
  "import.page.text.toggleOpen": "öffnen",
  "import.page.text.titlePlaceholder": "Titel (optional)",
  "import.page.text.titleLabel": "Titel",
  "import.page.text.bodyLabel": "Rezepttext",
  "import.page.text.bodyPlaceholder":
    "Zutaten und Zubereitung einfügen.\n\nZutaten\n250 g Mehl\n2 Eier\n\nZubereitung\n1. Alles verrühren…",
  "import.page.text.submit": "Text auswerten",
  "import.page.text.subject": "Eingefügter Text",

  "import.page.drafts.heading": "Offene Entwürfe",
  "import.page.drafts.hint": "Ein abgebrochener Import ist nicht verloren – hier kannst du weitermachen.",
  "import.page.drafts.deleteError.title": "Entwurf konnte nicht verworfen werden",
  "import.page.drafts.deleteError.description": "Bitte versuche es erneut.",

  "import.page.clipboard.unreadable.title": "Zwischenablage nicht lesbar",
  "import.page.clipboard.unreadable.description":
    "Dein Browser erlaubt das Einfügen nicht automatisch – bitte die URL manuell einfügen.",

  /* --------------------------- /import/:draftId ---------------------------- */
  "import.review.back": "Import",
  "import.review.noDraft": "Kein Entwurf ausgewählt",
  "import.review.toImport": "Zum Import",
  "import.review.loadError": "Entwurf konnte nicht geladen werden",
  "import.review.toOverview": "Zur Import-Übersicht",
  "import.review.quality": "Erkennungsqualität {value}",
  "import.review.title.fallback": "Import prüfen",
  "import.review.autosaveError.title": "Automatisches Speichern fehlgeschlagen",
  "import.review.autosaveError.retry": "Jetzt speichern",
  "import.review.committed.title": "Dieser Entwurf wurde bereits als Rezept gespeichert.",
  "import.review.committed.open": "Rezept öffnen",
  "import.review.groupMismatch.text": "Dieser Entwurf gehört zur Gruppe {groupName}. Gespeichert wird das Rezept dort.",
  "import.review.groupMismatch.fallbackName": "einer anderen Gruppe",
  "import.review.groupMismatch.switch": "Gruppe wechseln",
  "import.review.groupStays.title": "Entwurf bleibt in seiner Gruppe",
  "import.review.groupStays.description":
    "Ein bestehender Entwurf kann nicht verschoben werden. Starte den Import in der anderen Gruppe neu, wenn das Rezept dort landen soll.",
  "import.review.lowConfidence.title": "Die Erkennung war unsicher – bitte gründlich prüfen.",
  "import.review.lowConfidence.hint":
    "Vergleiche die Felder mit der Quelle. Zeilen mit „bitte prüfen“ sind die wahrscheinlichsten Fehler.",
  "import.review.lowConfidence.countHint": "Aktuell markiert: {ingredients} Zutaten, {steps} Schritte.",
  "import.review.tabs.ariaLabel": "Ansicht",
  "import.review.tabs.source": "Quelle",
  "import.review.tabs.form": "Rezept",
  "import.review.retrySave": "Nochmal speichern",
  "import.review.discard": "Verwerfen",
  "import.review.saving": "Speichert…",
  "import.review.save": "Speichern",
  "import.review.discardDialog.title": "Entwurf verwerfen?",
  "import.review.discardDialog.description":
    "Der Import-Entwurf wird gelöscht. Das Foto bzw. der erkannte Text ist dann weg – das Rezept wurde noch nicht gespeichert.",
  "import.review.discardDialog.message": "Der Import-Entwurf wird gelöscht. Das Rezept wurde noch nicht gespeichert.",
  "import.review.discardDialog.confirm": "Verwerfen",
  "import.review.discardDialog.cancel": "Weiter bearbeiten",
  "import.review.toast.saved.title": "Rezept gespeichert",
  "import.review.toast.discarded.title": "Entwurf verworfen",
  "import.review.toast.saveFallback": "Bitte prüfe die Eingaben",

  "import.autosave.saving": "Speichert…",
  "import.autosave.dirty": "Änderungen noch nicht gespeichert",
  "import.autosave.saved": "Gespeichert",
  "import.autosave.savedAt": "Gespeichert um {time}",
  "import.autosave.error": "Speichern fehlgeschlagen",
  "import.autosave.idle": "Automatisch gespeichert",

  /* ------------------------------ confidence -------------------------------- */
  "import.confidence.good": "sieht gut aus",
  "import.confidence.needsCheck": "bitte prüfen",
  "import.confidence.quality": "Erkennungsqualität: {value}",
  "import.confidence.unknown": "unbekannt",
  "import.confidence.field.title": "Titel",
  "import.confidence.field.description": "Beschreibung",
  "import.confidence.field.ingredients": "Zutaten",
  "import.confidence.field.steps": "Zubereitung",
  "import.confidence.field.servings": "Portionen",
  "import.confidence.field.times": "Zeiten",
  "import.confidence.field.image": "Bild",
  "import.confidence.reason.noName": "Kein Name erkannt",
  "import.confidence.reason.shortName": "Sehr kurzer Name",
  "import.confidence.reason.noLetters": "Name enthält keine Buchstaben",
  "import.confidence.reason.strangeChars": "Ungewöhnliche Zeichen im Namen",
  "import.confidence.reason.unknownUnit": "Einheit „{unit}“ unbekannt",
  "import.confidence.reason.numberNoQuantity": "Zahl in der Zeile, aber keine Menge erkannt",
  "import.confidence.reason.largeQuantityNoUnit": "Sehr große Menge ohne Einheit",
  "import.confidence.reason.mergedLine": "Zeile wirkt zusammengefasst – evtl. teilen",
  "import.confidence.reason.quantityInName": "Menge steckt noch im Namen",
  "import.confidence.reason.listUncertainIngredients": "Zutatenliste unsicher erkannt",
  "import.confidence.reason.emptyStep": "Leerer Schritt",
  "import.confidence.reason.shortStep": "Sehr kurzer Schritt",
  "import.confidence.reason.strangeCharsStep": "Ungewöhnliche Zeichen im Text",
  "import.confidence.reason.longStep": "Sehr langer Schritt – evtl. teilen",
  "import.confidence.reason.listUncertainSteps": "Zubereitung unsicher erkannt",

  /* ---------------------------- image capture -------------------------------- */
  "import.imageCapture.captureLabel": "Foto aufnehmen",
  "import.imageCapture.galleryLabel": "Aus Galerie wählen",

  /* ----------------------------- error panel --------------------------------- */
  "import.errorPanel.retry": "Erneut versuchen",

  /* --------------------------- OCR progress panel ----------------------------- */
  "import.ocrProgress.ocr.title": "Texterkennung läuft…",
  "import.ocrProgress.ocr.body":
    "Der Server liest die Schrift aus dem Bild (Deutsch + Englisch). Das dauert je nach Bildgröße bis zu einer Minute und kann nicht abgebrochen werden. Du kannst das Fenster offen lassen – schließe es bitte nicht.",
  "import.ocrProgress.text.title": "PDF wird gelesen…",
  "import.ocrProgress.text.body":
    "Zuerst wird die Textebene des PDFs ausgelesen. Fehlt sie, werden die Seiten in Bilder umgewandelt und per Texterkennung gelesen – das dauert dann bis zu einer Minute.",
  "import.ocrProgress.url.title": "Seite wird geladen…",
  "import.ocrProgress.url.body": "Die Seite wird abgerufen und nach Rezeptdaten durchsucht. Das dauert meist nur wenige Sekunden.",
  "import.ocrProgress.preparing": "Foto wird vorbereitet…",
  "import.ocrProgress.uploading": "Datei wird übertragen…",
  "import.ocrProgress.longWait":
    "Das dauert länger als üblich. Bitte noch etwas Geduld – abbrechen würde die Erkennung nicht beschleunigen.",

  /* --------------------------- pending drafts list ----------------------------- */
  "import.pendingDrafts.source.website": "Webseite",
  "import.pendingDrafts.source.pdfText": "PDF (Textebene)",
  "import.pendingDrafts.source.pdfOcr": "PDF (Texterkennung)",
  "import.pendingDrafts.source.photoOcr": "Foto (Texterkennung)",
  "import.pendingDrafts.source.manualText": "Eingefügter Text",
  "import.pendingDrafts.source.fallback": "Import",
  "import.pendingDrafts.openLabel": "Entwurf {title} weiter bearbeiten",
  "import.pendingDrafts.untitled": "Ohne Titel",
  "import.pendingDrafts.untitledLower": "ohne Titel",
  "import.pendingDrafts.summary": "{source} · {ingredients} Zutaten · {steps} Schritte · {date}",
  "import.pendingDrafts.loadError": "Offene Entwürfe konnten nicht geladen werden: {title}",
  "import.pendingDrafts.deleteLabel": "Entwurf verwerfen",

  /* ------------------------------ source viewer -------------------------------- */
  "import.source.tabsAriaLabel": "Quelle",
  "import.source.tab.image": "Bild",
  "import.source.tab.text": "Rohtext",
  "import.source.tab.link": "Quelle",
  "import.source.empty": "Für diesen Entwurf gibt es keine Quellansicht. Du kannst die Felder rechts direkt bearbeiten.",
  "import.source.imageFailed":
    "Das Quellbild konnte nicht geladen werden. Vielleicht bist du kein Mitglied dieser Gruppe mehr, oder die Datei wurde gelöscht.",
  "import.source.zoom.out": "Verkleinern",
  "import.source.zoom.in": "Vergrößern",
  "import.source.zoom.rotate": "Drehen",
  "import.source.zoom.reset": "Zurücksetzen",
  "import.source.zoom.openNewTab": "Bild in neuem Tab öffnen",
  "import.source.zoom.hint": "Zwei Finger zum Zoomen, ziehen zum Verschieben. Am Desktop: Strg + Mausrad.",
  "import.source.imageLoadFailed": "Das Quellbild konnte nicht geladen werden.",
  "import.source.openDirect": "Direkt öffnen",
  "import.source.alt": "Quellbild des Rezepts",
  "import.source.text.lineCount": { one: "{count} erkannte Zeile", other: "{count} erkannte Zeilen" },
  "import.source.text.copied": "Kopiert",
  "import.source.text.copyAll": "Alles kopieren",
  "import.source.text.pdfLoading": "PDF wird geladen …",
  "import.source.text.pdfOpen": "PDF öffnen",
  "import.source.text.pdfPreviewOn": "PDF-Vorschau",
  "import.source.text.pdfPreviewOff": "Vorschau aus",
  "import.source.text.empty": "Es wurde kein Text erkannt.",
  "import.source.line.toIngredientTitle": "Zeile in Zutat umwandeln",
  "import.source.line.toIngredientAria": "Zeile {index} in Zutat umwandeln",
  "import.source.line.toStepTitle": "Zeile in Schritt umwandeln",
  "import.source.line.toStepAria": "Zeile {index} in Schritt umwandeln",
  "import.source.link.fallbackName": "Quelle",
  "import.source.link.openOriginal": "Originalseite öffnen",
  "import.source.link.notHttp": "Diese Quelle ist kein http(s)-Link und wird nicht verlinkt.",
  "import.source.link.compareHint":
    "Vergleiche die Angaben rechts mit der Originalseite und korrigiere, was der Importer nicht sauber erkannt hat.",

  /* ------------------------------ upload progress -------------------------------- */
  "import.upload.defaultFileName": "Datei",
  "import.upload.ariaLabel": "Upload-Fortschritt",

  /* -------------------------------- draft edit ------------------------------------ */
  "import.draftEdit.needTitle": "Bitte einen Titel eingeben.",
  "import.draftEdit.noIngredients": "Das Rezept hat noch keine Zutaten.",
  "import.draftEdit.noSteps": "Das Rezept hat noch keine Zubereitungsschritte.",

  /* ---------------------------------- image --------------------------------------- */
  "import.image.tooLarge": "Die Datei ist {size} groß. Erlaubt sind maximal {max}.",
  "import.image.empty": "Die Datei ist leer.",

  /* --------------------------------- queries --------------------------------------- */
  "import.queries.draftNotFound.message": "Entwurf nicht gefunden",
  "import.queries.draftNotFound.hint": "Dieser Import-Entwurf existiert in keiner deiner Gruppen.",

  /* ------------------------- review editor (ParsedRecipeEditor) --------------------
     Three placeholders keep GERMAN example text in the English catalog on purpose,
     because a German-only parser is what consumes them: `parseDuration` reads
     "1 Std 15 Min", and `INGREDIENT_HEADING_RE` matches "Für den Teig:". Showing an
     English example there would advertise input the parser silently drops. The
     surrounding sentence IS translated — only the sample token stays German. */
  "import.editor.basics.title": "Grunddaten",
  "import.editor.title.label": "Titel *",
  "import.editor.title.placeholder": "Wie heißt das Rezept?",
  "import.editor.description.label": "Kurzbeschreibung",
  "import.editor.description.placeholder": "Optional – ein Satz zum Rezept",
  "import.editor.servings.label": "Portionen",
  "import.editor.servings.ariaLabel": "Anzahl Portionen",
  "import.editor.servingsUnit.label": "Einheit",
  "import.editor.times.label": "Zeiten (Minuten)",
  "import.editor.times.prep": "Vorbereitung",
  "import.editor.times.cook": "Kochen / Backen",
  "import.editor.times.total": "Gesamt",
  "import.editor.minutes.placeholder": "z. B. 30 oder 1 Std 15 Min",
  "import.editor.difficulty.label": "Schwierigkeit",
  "import.editor.difficulty.none": "– keine Angabe –",
  /* Lowercase on purpose — these are the editor's own Select labels and differ from
     `recipes.difficulty.*` ("Einfach"). Pre-existing copy; parity forbids tidying it. */
  "import.editor.difficulty.einfach": "einfach",
  "import.editor.difficulty.mittel": "mittel",
  "import.editor.difficulty.schwer": "schwer",
  "import.editor.source.label": "Quelle",
  "import.editor.source.placeholder": "z. B. chefkoch.de oder Omas Kochbuch",
  "import.editor.tags.label": "Tags",
  "import.editor.tags.placeholder": "Tag hinzufügen (Enter)",
  "import.editor.tags.remove": "Tag {tag} entfernen",

  "import.editor.ingredients.title": "Zutaten ({count})",
  "import.editor.flagged": "{count} prüfen",
  "import.editor.ingredients.reparseAll": "Alle neu parsen",
  "import.editor.pasteText": "Text einfügen",
  "import.editor.cancel": "Abbrechen",
  "import.editor.ingredients.addRow": "Zeile",
  "import.editor.ingredients.paste.placeholder":
    "Eine Zutat pro Zeile einfügen.\nAbschnitte als „Für den Teig:“",
  "import.editor.ingredients.paste.submit": "Zeilen übernehmen",
  "import.editor.ingredients.empty":
    "Noch keine Zutaten. Füge eine Zeile hinzu oder übernimm Zeilen aus dem Rohtext links.",
  "import.editor.section.ariaLabel": "Abschnitt",
  "import.editor.ingredients.quantity.ariaLabel": "Menge Zeile {index}",
  "import.editor.ingredients.quantity.placeholder": "Menge",
  "import.editor.ingredients.unit.ariaLabel": "Einheit Zeile {index}",
  "import.editor.ingredients.unit.placeholder": "Einheit",
  "import.editor.ingredients.name.ariaLabel": "Zutat Zeile {index}",
  "import.editor.ingredients.name.placeholder": "Zutat",
  "import.editor.ingredients.quantityMax.ariaLabel": "Menge bis Zeile {index}",
  "import.editor.ingredients.quantityMax.placeholder": "bis (z. B. 3)",
  "import.editor.ingredients.note.ariaLabel": "Notiz Zeile {index}",
  "import.editor.ingredients.note.placeholder": "Notiz (z. B. fein gehackt)",
  "import.editor.ingredients.section.ariaLabel": "Abschnitt Zeile {index}",
  "import.editor.ingredients.section.placeholder": "Abschnitt (z. B. Für den Teig)",
  "import.editor.ingredients.raw.label": "Rohzeile (aus der Quelle)",
  "import.editor.ingredients.raw.ariaLabel": "Rohzeile {index}",
  "import.editor.ingredients.raw.reparse": "Rohzeile neu parsen",
  "import.editor.row.up": "Nach oben",
  "import.editor.row.down": "Nach unten",
  "import.editor.row.editDetails": "Details bearbeiten",
  "import.editor.row.delete": "Zeile löschen",
  "import.editor.ingredients.row.reparse": "Zeile neu parsen",
  "import.editor.ingredients.row.split": "Zusammengefasste Zeile teilen",
  "import.editor.ingredients.row.toStep": "Zutat zu Schritt verschieben",

  "import.editor.steps.title": "Zubereitung ({count})",
  "import.editor.steps.resplit": "Neu aufteilen",
  "import.editor.steps.addStep": "Schritt",
  "import.editor.steps.paste.placeholder":
    "Zubereitungstext einfügen – „1.“, „2.“ oder Leerzeilen trennen die Schritte.",
  "import.editor.steps.paste.submit": "Schritte übernehmen",
  "import.editor.steps.empty":
    "Noch keine Schritte. Füge einen Schritt hinzu oder übernimm Zeilen aus dem Rohtext links.",
  "import.editor.steps.text.ariaLabel": "Schritt {index}",
  "import.editor.steps.text.placeholder": "Was ist zu tun?",
  "import.editor.steps.section.ariaLabel": "Abschnitt Schritt {index}",
  "import.editor.steps.section.placeholder": "Abschnitt (z. B. Teig zubereiten)",
  "import.editor.steps.row.split": "Schritt teilen",
  "import.editor.steps.row.toIngredient": "Schritt zu Zutat verschieben",
  "import.editor.steps.row.editSection": "Abschnitt bearbeiten",
  "import.editor.steps.row.delete": "Schritt löschen",

  "import.editor.notes.title": "Notizen",
  "import.editor.notes.hint": "Alles, was nicht in die Schritte gehört – z. B. Tipps oder Varianten.",
  "import.editor.notes.ariaLabel": "Notizen",
  "import.editor.notes.placeholder": "Optional",

  /* ---------------------------------- errors ---------------------------------------
     The title/hint pairs `toImportApiError()` maps a status + error code onto.
     A hint is deliberately long and actionable: this panel is the only thing a
     user sees when an import fails, so "Fehler" is never an acceptable answer. */
  "import.error.network.title": "Keine Verbindung zum Server",
  "import.error.network.hint":
    "Prüfe deine Internetverbindung. Der Import wurde nicht gestartet, du kannst es einfach nochmal versuchen.",
  "import.error.unauthorized.title": "Du bist nicht mehr angemeldet",
  "import.error.unauthorized.hint":
    "Deine Sitzung ist abgelaufen. Melde dich neu an – dein Entwurf bleibt gespeichert.",
  "import.error.forbidden.title": "Kein Zugriff auf diese Gruppe",
  "import.error.forbidden.hint":
    "Du bist kein Mitglied der Gruppe, in die importiert werden soll. Wechsle die Gruppe oder lass dich einladen.",
  "import.error.notFound.title": "Entwurf nicht gefunden",
  "import.error.notFound.hint":
    "Der Import-Entwurf existiert nicht mehr – vielleicht wurde er schon gespeichert oder verworfen.",
  "import.error.tooLarge.title": "Datei zu groß",
  "import.error.tooLarge.hint":
    "Die Datei ist größer als 15 MB. Mach ein Foto mit geringerer Auflösung oder verkleinere die PDF-Datei.",
  "import.error.unsupportedMediaType.title": "Dateityp nicht unterstützt",
  "import.error.unsupportedMediaType.hint": "Erlaubt sind Fotos (JPEG, PNG, WebP, HEIC) und PDF-Dateien.",
  "import.error.pdfNoTextLayer.title": "PDF ohne Textebene",
  "import.error.pdfNoTextLayer.hint":
    "Dieses PDF enthält keinen auslesbaren Text und konnte auch nicht in Bilder umgewandelt werden. Bitte lade ein Foto der Seite hoch.",
  "import.error.ocrFailed.title": "Text konnte nicht erkannt werden",
  "import.error.ocrFailed.hint":
    "Die Texterkennung hat auf diesem Bild nichts gefunden. Tipps: gerade von oben fotografieren, gutes Licht, keine Schatten, Seite ganz im Bild.",
  "import.error.noRecipeData.title": "Auf dieser Seite wurden keine Rezeptdaten gefunden",
  "import.error.noRecipeData.hint":
    "Die Seite liefert kein maschinenlesbares Rezept. Du kannst die Seite stattdessen abfotografieren oder den Text von Hand einfügen.",
  "import.error.fetchFailed.title": "Seite konnte nicht geladen werden",
  "import.error.fetchFailed.hint":
    "Der Server konnte die URL nicht abrufen (offline, Login-Pflicht oder Bot-Schutz). Prüfe die Adresse oder importiere die Seite als Foto.",
  "import.error.ocrTimeout.title": "Die Texterkennung hat zu lange gedauert",
  "import.error.ocrTimeout.hint":
    "Der Server hat abgebrochen. Versuche es mit einem kleineren Ausschnitt oder einem Foto pro Seite nochmal.",
  "import.error.ocrTimeoutClient.hint":
    "Der Server hat nicht rechtzeitig geantwortet. Versuche es mit einem Foto pro Seite oder einem kleineren Bild erneut.",
  "import.error.rateLimited.title": "Zu viele Anfragen",
  "import.error.rateLimited.hint": "Bitte warte einen Moment und versuche es dann erneut.",
  "import.error.validation.title": "Die Daten wurden nicht akzeptiert",
  "import.error.validation.hint":
    "Bitte prüfe die markierten Felder. Ein Titel ist Pflicht, Mengen müssen Zahlen sein.",
  "import.error.server.title": "Serverfehler",
  "import.error.server.hint": "Auf dem Server ist etwas schiefgelaufen. Bitte versuche es in einem Moment erneut.",
  "import.error.unknown.title": "Unerwarteter Fehler",
  "import.error.unknown.hint":
    "Bitte versuche es erneut. Falls es wieder passiert, notiere dir was du getan hast.",
  "import.error.unexpected.hint": "Bitte versuche es erneut.",
  "import.error.aborted.title": "Abgebrochen",
  "import.error.aborted.hint": "Der Vorgang wurde abgebrochen.",
  "import.error.noFiles.title": "Keine Datei ausgewählt",
  "import.error.noFiles.hint": "Bitte wähle zuerst ein Foto oder eine Datei aus.",
} as const satisfies NamespaceCatalog<"import">;

export type ImportCatalog = typeof importDe;
