/**
 * English — namespace "cards". See `cards.de.ts` for who owns this file and why
 * the symbology names below are deliberately unchanged.
 */
import type { LocaleCatalog } from "@toon/shared";
import type { CardsCatalog } from "./cards.de.ts";

export const cardsEn: LocaleCatalog<CardsCatalog> = {
  // CardsPage
  "cards.heading": "Cards",
  "cards.subtitle": "Loyalty and membership cards — just show them at the till.",
  "cards.add": "Add card",
  "cards.privateHint":
    "Cards belong to your account, not to the group — other members cannot see them.",
  "cards.count": { one: "{count} card", other: "{count} cards" },
  "cards.empty.title": "No card saved yet",
  "cards.empty.description":
    "Scan your loyalty card's code or type in its number. After that you can show the card from your phone at the till and leave the plastic one at home.",
  "cards.empty.action": "Add your first card",

  // The link from /shopping into this screen
  "cards.link.title": "Cards",
  "cards.link.description": "Show loyalty cards at the till, from your phone",
  "cards.link.action": "Manage cards",

  // Card tile + its overflow menu
  "cards.tile.show": "Show card",
  "cards.tile.menu": "More actions for “{label}”",
  "cards.action.edit": "Edit",
  "cards.action.delete": "Delete",
  "cards.action.cancel": "Cancel",
  "cards.action.save": "Save",
  "cards.action.add": "Add",

  // CardFormDialog
  "cards.form.addTitle": "Add card",
  "cards.form.editTitle": "Edit card",
  "cards.form.label.label": "Name",
  "cards.form.label.placeholder": "e.g. Payback",
  "cards.form.format.label": "Code type",
  "cards.form.format.hint": "Usually printed in small type next to the code. If unsure, just scan it.",
  "cards.form.value.label": "Number",
  "cards.form.value.placeholder": "The digits under the code",
  "cards.form.value.hint":
    "You can leave out spaces and dashes. If the final check digit is missing, we add it.",
  "cards.form.note.label": "Note",
  "cards.form.note.placeholder": "e.g. Anna's card",
  "cards.form.scan": "Scan",
  "cards.form.preview": "Preview",
  "cards.form.previewPending": "Once the number checks out, the code appears here.",
  "cards.form.saved": "“{label}” saved",
  "cards.form.updated": "“{label}” updated",

  // Delete
  "cards.delete.title": "Delete card?",
  "cards.delete.description": "“{label}” will be removed from your cards. This cannot be undone.",
  "cards.delete.success": "“{label}” deleted",
  "cards.delete.error": "Deleting failed",

  // CardDisplayDialog — the screen you hold up at the till
  "cards.show.brightnessHint": "Tip: turn the brightness up, scanners read it better.",

  // ScannerDialog
  "cards.scan.title": "Scan code",
  "cards.scan.hint": "Hold the card's barcode or QR code inside the frame.",
  "cards.scan.starting": "Starting the camera …",
  "cards.scan.retry": "Try again",
  "cards.scan.manual": "Type the number",
  "cards.scan.error.permission":
    "No access to the camera. Allow it in your browser's settings — or type the number instead.",
  "cards.scan.error.unavailable":
    "This device has no camera we can use. Please type the number instead.",
  "cards.scan.error.load":
    "The scanner could not be loaded. That needs a connection once — typing the number always works.",
  "cards.scan.error.unsupported":
    "This app cannot display that code type. Please type the number, or use a different card.",
  "cards.scan.offline": "Scanning needs a connection once.",
  "cards.scan.success": "Code detected: {format}",

  // Symbology names — the labels printed on the cards, so unchanged.
  "cards.format.qr": "QR code",
  "cards.format.ean13": "EAN-13",
  "cards.format.ean8": "EAN-8",
  "cards.format.upca": "UPC-A",
  "cards.format.code128": "Code 128",
  "cards.format.code39": "Code 39",
  "cards.format.itf": "ITF (2 of 5)",
};
