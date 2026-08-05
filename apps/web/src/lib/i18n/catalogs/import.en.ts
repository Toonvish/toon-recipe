/**
 * English — namespace "import". See `import.de.ts` for who owns this file
 * and why it is an intentional skeleton.
 */
import type { LocaleCatalog } from "@toon/shared";
import type { ImportCatalog } from "./import.de.ts";

export const importEn: LocaleCatalog<ImportCatalog> = {
  /* ------------------------------- /import -------------------------------- */
  "import.page.title": "Import recipe",
  "import.page.subtitle.ocr":
    "From the web, a cookbook photo, or a PDF. You can check and correct everything before saving.",
  "import.page.subtitle.noOcr": "From the web or as pasted text. You can check and correct everything before saving.",
  "import.page.offline.ocr":
    "Offline — importing needs a connection because text recognition runs on the server. You can still view and cook saved recipes.",
  "import.page.offline.url":
    "Offline — importing needs a connection because the server has to fetch the page. You can still view and cook saved recipes.",
  "import.page.toast.noGroup.title": "No group selected",
  "import.page.toast.noGroup.description": "First choose the group to import the recipe into.",
  "import.common.targetGroup": "Target group",
  "import.page.savingToGroup": "Will be saved to {groupName}",

  "import.page.url.heading": "From a website",
  "import.page.url.subtitle": "Paste a link and we'll read the recipe out.",
  "import.page.url.placeholder": "https://www.chefkoch.de/rezepte/…",
  "import.page.url.ariaLabel": "Recipe URL",
  "import.page.url.pasteLabel": "Paste from clipboard",
  "import.page.url.invalid": "That doesn't look like a full address yet — it must start with http:// or https://.",
  "import.page.url.hint": "Tested with {first} and {second}. Other sites work too, as long as they ship recipe data in the standard format.",
  "import.page.url.submit": "Load recipe",
  "import.page.url.retryPhoto": "Import as a photo instead",
  "import.page.url.retryText": "Paste the text by hand",

  "import.page.photo.heading": "Photo of a recipe",
  "import.page.photo.subtitle": "Cookbook, magazine, note card – text recognition runs on the server.",
  "import.page.photo.tip":
    "Tip: shoot straight down, good light, no shadows. Images are automatically shrunk before upload.",
  "import.page.photo.count": { one: "{count} photo · {bytes}", other: "{count} photos · {bytes}" },
  "import.page.photo.merge": "will be stitched into one document",
  "import.page.photo.altSelected": "Selected photo {index}",
  "import.page.photo.remove": "Remove photo {index}",
  "import.page.photo.submit": { one: "Import photo", other: "Import {count} photos" },
  "import.page.photo.invalidFile": "„{filename}“ is not an image. Allowed are JPEG, PNG, WebP or HEIC.",
  "import.page.photo.subjectCount": "{count} photos",

  "import.page.document.heading": "PDF or image file",
  "import.page.document.subtitle": "For PDFs the text layer is read first – that's exact and fast.",
  "import.page.document.dragHint": "Drag a file here or",
  "import.page.document.pick": "Choose file",
  "import.page.document.formats": "PDF, JPEG, PNG, WebP or HEIC · max. {size}",
  "import.page.document.remove": "Remove file",
  "import.page.document.submit": "Import file",
  "import.page.document.invalid": "Please choose a PDF file or an image.",
  "import.page.document.retryPhoto": "Take a photo instead",

  "import.page.text.heading": "Paste text",
  "import.page.text.subtitle": "If you already have the recipe as text – e.g. from a message.",
  "import.page.text.toggleClose": "close",
  "import.page.text.toggleOpen": "open",
  "import.page.text.titlePlaceholder": "Title (optional)",
  "import.page.text.titleLabel": "Title",
  "import.page.text.bodyLabel": "Recipe text",
  "import.page.text.bodyPlaceholder":
    "Paste ingredients and instructions.\n\nIngredients\n250 g flour\n2 eggs\n\nInstructions\n1. Mix everything…",
  "import.page.text.submit": "Analyse text",
  "import.page.text.subject": "Pasted text",

  "import.page.drafts.heading": "Open drafts",
  "import.page.drafts.hint": "An interrupted import isn't lost – you can continue here.",
  "import.page.drafts.deleteError.title": "Draft could not be discarded",
  "import.page.drafts.deleteError.description": "Please try again.",

  "import.page.clipboard.unreadable.title": "Clipboard not readable",
  "import.page.clipboard.unreadable.description":
    "Your browser doesn't allow pasting automatically – please paste the URL by hand.",

  /* --------------------------- /import/:draftId ---------------------------- */
  "import.review.back": "Import",
  "import.review.noDraft": "No draft selected",
  "import.review.toImport": "To import",
  "import.review.loadError": "Draft could not be loaded",
  "import.review.toOverview": "To the import overview",
  "import.review.quality": "Recognition quality {value}",
  "import.review.title.fallback": "Check import",
  "import.review.autosaveError.title": "Autosave failed",
  "import.review.autosaveError.retry": "Save now",
  "import.review.committed.title": "This draft has already been saved as a recipe.",
  "import.review.committed.open": "Open recipe",
  "import.review.groupMismatch.text": "This draft belongs to the group {groupName}. It will be saved there.",
  "import.review.groupMismatch.fallbackName": "another group",
  "import.review.groupMismatch.switch": "Switch group",
  "import.review.groupStays.title": "Draft stays in its group",
  "import.review.groupStays.description":
    "An existing draft cannot be moved. Start the import again in the other group if the recipe should land there.",
  "import.review.lowConfidence.title": "Recognition was uncertain – please check thoroughly.",
  "import.review.lowConfidence.hint":
    "Compare the fields against the source. Lines marked „please check“ are the most likely mistakes.",
  "import.review.lowConfidence.countHint": "Currently flagged: {ingredients} ingredients, {steps} steps.",
  "import.review.tabs.ariaLabel": "View",
  "import.review.tabs.source": "Source",
  "import.review.tabs.form": "Recipe",
  "import.review.retrySave": "Save again",
  "import.review.discard": "Discard",
  "import.review.saving": "Saving…",
  "import.review.save": "Save",
  "import.review.discardDialog.title": "Discard draft?",
  "import.review.discardDialog.description":
    "The import draft will be deleted. The photo or recognised text will be gone – the recipe hasn't been saved yet.",
  "import.review.discardDialog.message": "The import draft will be deleted. The recipe hasn't been saved yet.",
  "import.review.discardDialog.confirm": "Discard",
  "import.review.discardDialog.cancel": "Keep editing",
  "import.review.toast.saved.title": "Recipe saved",
  "import.review.toast.discarded.title": "Draft discarded",
  "import.review.toast.saveFallback": "Please check your input",

  "import.autosave.saving": "Saving…",
  "import.autosave.dirty": "Changes not saved yet",
  "import.autosave.saved": "Saved",
  "import.autosave.savedAt": "Saved at {time}",
  "import.autosave.error": "Save failed",
  "import.autosave.idle": "Saved automatically",

  /* ------------------------------ confidence -------------------------------- */
  "import.confidence.good": "looks good",
  "import.confidence.needsCheck": "please check",
  "import.confidence.quality": "Recognition quality: {value}",
  "import.confidence.unknown": "unknown",
  "import.confidence.field.title": "Title",
  "import.confidence.field.description": "Description",
  "import.confidence.field.ingredients": "Ingredients",
  "import.confidence.field.steps": "Instructions",
  "import.confidence.field.servings": "Servings",
  "import.confidence.field.times": "Times",
  "import.confidence.field.image": "Image",
  "import.confidence.reason.noName": "No name recognised",
  "import.confidence.reason.shortName": "Very short name",
  "import.confidence.reason.noLetters": "Name contains no letters",
  "import.confidence.reason.strangeChars": "Unusual characters in the name",
  "import.confidence.reason.unknownUnit": "Unit „{unit}“ unknown",
  "import.confidence.reason.numberNoQuantity": "Number in the line, but no quantity recognised",
  "import.confidence.reason.largeQuantityNoUnit": "Very large quantity with no unit",
  "import.confidence.reason.mergedLine": "Line looks merged – maybe split it",
  "import.confidence.reason.quantityInName": "Quantity still stuck in the name",
  "import.confidence.reason.listUncertainIngredients": "Ingredient list recognised with low confidence",
  "import.confidence.reason.emptyStep": "Empty step",
  "import.confidence.reason.shortStep": "Very short step",
  "import.confidence.reason.strangeCharsStep": "Unusual characters in the text",
  "import.confidence.reason.longStep": "Very long step – maybe split it",
  "import.confidence.reason.listUncertainSteps": "Instructions recognised with low confidence",

  /* ---------------------------- image capture -------------------------------- */
  "import.imageCapture.captureLabel": "Take photo",
  "import.imageCapture.galleryLabel": "Choose from gallery",

  /* ----------------------------- error panel --------------------------------- */
  "import.errorPanel.retry": "Try again",

  /* --------------------------- OCR progress panel ----------------------------- */
  "import.ocrProgress.ocr.title": "Text recognition running…",
  "import.ocrProgress.ocr.body":
    "The server is reading the text from the image (German + English). Depending on the image size this can take up to a minute and cannot be cancelled. You can leave the window open – please don't close it.",
  "import.ocrProgress.text.title": "Reading PDF…",
  "import.ocrProgress.text.body":
    "The PDF's text layer is read first. If it's missing, the pages are converted into images and read with text recognition – that can then take up to a minute.",
  "import.ocrProgress.url.title": "Loading page…",
  "import.ocrProgress.url.body": "The page is fetched and searched for recipe data. This usually takes only a few seconds.",
  "import.ocrProgress.preparing": "Preparing photo…",
  "import.ocrProgress.uploading": "Uploading file…",
  "import.ocrProgress.longWait":
    "This is taking longer than usual. Please be a little more patient – cancelling would not speed up recognition.",

  /* --------------------------- pending drafts list ----------------------------- */
  "import.pendingDrafts.source.website": "Website",
  "import.pendingDrafts.source.pdfText": "PDF (text layer)",
  "import.pendingDrafts.source.pdfOcr": "PDF (text recognition)",
  "import.pendingDrafts.source.photoOcr": "Photo (text recognition)",
  "import.pendingDrafts.source.manualText": "Pasted text",
  "import.pendingDrafts.source.fallback": "Import",
  "import.pendingDrafts.openLabel": "Continue editing draft {title}",
  "import.pendingDrafts.untitled": "Untitled",
  "import.pendingDrafts.untitledLower": "untitled",
  "import.pendingDrafts.summary": "{source} · {ingredients} ingredients · {steps} steps · {date}",
  "import.pendingDrafts.loadError": "Open drafts could not be loaded: {title}",
  "import.pendingDrafts.deleteLabel": "Discard draft",

  /* ------------------------------ source viewer -------------------------------- */
  "import.source.tabsAriaLabel": "Source",
  "import.source.tab.image": "Image",
  "import.source.tab.text": "Raw text",
  "import.source.tab.link": "Source",
  "import.source.empty": "There's no source view for this draft. You can edit the fields on the right directly.",
  "import.source.imageFailed":
    "The source image could not be loaded. Maybe you're no longer a member of this group, or the file was deleted.",
  "import.source.zoom.out": "Zoom out",
  "import.source.zoom.in": "Zoom in",
  "import.source.zoom.rotate": "Rotate",
  "import.source.zoom.reset": "Reset",
  "import.source.zoom.openNewTab": "Open image in a new tab",
  "import.source.zoom.hint": "Two fingers to zoom, drag to pan. On desktop: Ctrl + mouse wheel.",
  "import.source.imageLoadFailed": "The source image could not be loaded.",
  "import.source.openDirect": "Open directly",
  "import.source.alt": "Recipe source image",
  "import.source.text.lineCount": { one: "{count} recognised line", other: "{count} recognised lines" },
  "import.source.text.copied": "Copied",
  "import.source.text.copyAll": "Copy all",
  "import.source.text.pdfLoading": "Loading PDF …",
  "import.source.text.pdfOpen": "Open PDF",
  "import.source.text.pdfPreviewOn": "PDF preview",
  "import.source.text.pdfPreviewOff": "Preview off",
  "import.source.text.empty": "No text was recognised.",
  "import.source.line.toIngredientTitle": "Turn line into ingredient",
  "import.source.line.toIngredientAria": "Turn line {index} into an ingredient",
  "import.source.line.toStepTitle": "Turn line into step",
  "import.source.line.toStepAria": "Turn line {index} into a step",
  "import.source.link.fallbackName": "Source",
  "import.source.link.openOriginal": "Open original page",
  "import.source.link.notHttp": "This source isn't an http(s) link and won't be linked.",
  "import.source.link.compareHint":
    "Compare the details on the right against the original page and fix anything the importer didn't recognise cleanly.",

  /* ------------------------------ upload progress -------------------------------- */
  "import.upload.defaultFileName": "File",
  "import.upload.ariaLabel": "Upload progress",

  /* -------------------------------- draft edit ------------------------------------ */
  "import.draftEdit.needTitle": "Please enter a title.",
  "import.draftEdit.noIngredients": "The recipe doesn't have any ingredients yet.",
  "import.draftEdit.noSteps": "The recipe doesn't have any instructions yet.",

  /* ---------------------------------- image --------------------------------------- */
  "import.image.tooLarge": "The file is {size}. The maximum allowed is {max}.",
  "import.image.empty": "The file is empty.",

  /* --------------------------------- queries --------------------------------------- */
  "import.queries.draftNotFound.message": "Draft not found",
  "import.queries.draftNotFound.hint": "This import draft doesn't exist in any of your groups.",

  /* ------------------------- review editor (ParsedRecipeEditor) --------------------
     "1 Std 15 Min" and "Für den Teig" stay GERMAN here deliberately: `parseDuration`
     and `INGREDIENT_HEADING_RE` only understand German, so an English sample would
     advertise input the parser drops. See import.de.ts. */
  "import.editor.basics.title": "Basics",
  "import.editor.title.label": "Title *",
  "import.editor.title.placeholder": "What's the recipe called?",
  "import.editor.description.label": "Short description",
  "import.editor.description.placeholder": "Optional – one sentence about the recipe",
  "import.editor.servings.label": "Servings",
  "import.editor.servings.ariaLabel": "Number of servings",
  "import.editor.servingsUnit.label": "Unit",
  "import.editor.times.label": "Times (minutes)",
  "import.editor.times.prep": "Prep",
  "import.editor.times.cook": "Cooking / baking",
  "import.editor.times.total": "Total",
  "import.editor.minutes.placeholder": "e.g. 30, or 1 Std 15 Min",
  "import.editor.difficulty.label": "Difficulty",
  "import.editor.difficulty.none": "– not specified –",
  "import.editor.difficulty.einfach": "easy",
  "import.editor.difficulty.mittel": "medium",
  "import.editor.difficulty.schwer": "hard",
  "import.editor.source.label": "Source",
  "import.editor.source.placeholder": "e.g. chefkoch.de or Grandma's cookbook",
  "import.editor.tags.label": "Tags",
  "import.editor.tags.placeholder": "Add a tag (Enter)",
  "import.editor.tags.remove": "Remove tag {tag}",

  "import.editor.ingredients.title": "Ingredients ({count})",
  "import.editor.flagged": "{count} to check",
  "import.editor.ingredients.reparseAll": "Re-parse all",
  "import.editor.pasteText": "Paste text",
  "import.editor.cancel": "Cancel",
  "import.editor.ingredients.addRow": "Row",
  "import.editor.ingredients.paste.placeholder":
    "Paste one ingredient per line.\nSection headings like „Für den Teig:“",
  "import.editor.ingredients.paste.submit": "Add lines",
  "import.editor.ingredients.empty":
    "No ingredients yet. Add a row, or take lines from the raw text on the left.",
  "import.editor.section.ariaLabel": "Section",
  "import.editor.ingredients.quantity.ariaLabel": "Amount, row {index}",
  "import.editor.ingredients.quantity.placeholder": "Amount",
  "import.editor.ingredients.unit.ariaLabel": "Unit, row {index}",
  "import.editor.ingredients.unit.placeholder": "Unit",
  "import.editor.ingredients.name.ariaLabel": "Ingredient, row {index}",
  "import.editor.ingredients.name.placeholder": "Ingredient",
  "import.editor.ingredients.quantityMax.ariaLabel": "Amount up to, row {index}",
  "import.editor.ingredients.quantityMax.placeholder": "up to (e.g. 3)",
  "import.editor.ingredients.note.ariaLabel": "Note, row {index}",
  "import.editor.ingredients.note.placeholder": "Note (e.g. finely chopped)",
  "import.editor.ingredients.section.ariaLabel": "Section, row {index}",
  "import.editor.ingredients.section.placeholder": "Section (e.g. Für den Teig)",
  "import.editor.ingredients.raw.label": "Raw line (from the source)",
  "import.editor.ingredients.raw.ariaLabel": "Raw line {index}",
  "import.editor.ingredients.raw.reparse": "Re-parse raw line",
  "import.editor.row.up": "Move up",
  "import.editor.row.down": "Move down",
  "import.editor.row.editDetails": "Edit details",
  "import.editor.row.delete": "Delete row",
  "import.editor.ingredients.row.reparse": "Re-parse row",
  "import.editor.ingredients.row.split": "Split a combined row",
  "import.editor.ingredients.row.toStep": "Move ingredient to the instructions",

  "import.editor.steps.title": "Instructions ({count})",
  "import.editor.steps.resplit": "Split again",
  "import.editor.steps.addStep": "Step",
  "import.editor.steps.paste.placeholder":
    "Paste the instructions – “1.”, “2.” or blank lines separate the steps.",
  "import.editor.steps.paste.submit": "Add steps",
  "import.editor.steps.empty":
    "No steps yet. Add a step, or take lines from the raw text on the left.",
  "import.editor.steps.text.ariaLabel": "Step {index}",
  "import.editor.steps.text.placeholder": "What needs doing?",
  "import.editor.steps.section.ariaLabel": "Section, step {index}",
  "import.editor.steps.section.placeholder": "Section (e.g. Make the dough)",
  "import.editor.steps.row.split": "Split step",
  "import.editor.steps.row.toIngredient": "Move step to the ingredients",
  "import.editor.steps.row.editSection": "Edit section",
  "import.editor.steps.row.delete": "Delete step",

  "import.editor.notes.title": "Notes",
  "import.editor.notes.hint": "Anything that doesn't belong in the steps – tips or variations, say.",
  "import.editor.notes.ariaLabel": "Notes",
  "import.editor.notes.placeholder": "Optional",

  /* ---------------------------------- errors --------------------------------------- */
  "import.error.network.title": "No connection to the server",
  "import.error.network.hint":
    "Check your internet connection. The import never started, so you can simply try again.",
  "import.error.unauthorized.title": "You're no longer signed in",
  "import.error.unauthorized.hint": "Your session has expired. Sign in again – your draft is safe.",
  "import.error.forbidden.title": "No access to this group",
  "import.error.forbidden.hint":
    "You aren't a member of the group you're importing into. Switch groups or ask for an invitation.",
  "import.error.notFound.title": "Draft not found",
  "import.error.notFound.hint":
    "This import draft no longer exists – it may already have been saved or discarded.",
  "import.error.tooLarge.title": "File too large",
  "import.error.tooLarge.hint":
    "The file is larger than 15 MB. Take a photo at a lower resolution, or shrink the PDF.",
  "import.error.unsupportedMediaType.title": "File type not supported",
  "import.error.unsupportedMediaType.hint": "Photos (JPEG, PNG, WebP, HEIC) and PDF files are allowed.",
  "import.error.pdfNoTextLayer.title": "PDF without a text layer",
  "import.error.pdfNoTextLayer.hint":
    "This PDF contains no readable text and couldn't be converted to images either. Please upload a photo of the page instead.",
  "import.error.ocrFailed.title": "Couldn't read any text",
  "import.error.ocrFailed.hint":
    "Text recognition found nothing in this image. Tips: shoot straight from above, good light, no shadows, whole page in frame.",
  "import.error.noRecipeData.title": "No recipe data found on this page",
  "import.error.noRecipeData.hint":
    "The page doesn't publish a machine-readable recipe. You can photograph it instead, or paste the text by hand.",
  "import.error.fetchFailed.title": "Couldn't load the page",
  "import.error.fetchFailed.hint":
    "The server couldn't fetch the URL (offline, sign-in required, or bot protection). Check the address, or import the page as a photo.",
  "import.error.ocrTimeout.title": "Text recognition took too long",
  "import.error.ocrTimeout.hint":
    "The server gave up. Try again with a smaller crop, or one photo per page.",
  "import.error.ocrTimeoutClient.hint":
    "The server didn't answer in time. Try again with one photo per page, or a smaller image.",
  "import.error.rateLimited.title": "Too many requests",
  "import.error.rateLimited.hint": "Please wait a moment, then try again.",
  "import.error.validation.title": "The data wasn't accepted",
  "import.error.validation.hint":
    "Please check the highlighted fields. A title is required, and amounts have to be numbers.",
  "import.error.server.title": "Server error",
  "import.error.server.hint": "Something went wrong on the server. Please try again in a moment.",
  "import.error.unknown.title": "Unexpected error",
  "import.error.unknown.hint": "Please try again. If it happens again, note down what you did.",
  "import.error.unexpected.hint": "Please try again.",
  "import.error.aborted.title": "Cancelled",
  "import.error.aborted.hint": "The operation was cancelled.",
  "import.error.noFiles.title": "No file selected",
  "import.error.noFiles.hint": "Please pick a photo or a file first.",
};
