/**
 * German — namespace "cards". Covers apps/web/src/features/cards/** : the wallet
 * screen, the add/edit form, the camera scanner and the full-screen display used
 * at a till, plus the entry point on /shopping.
 *
 * ALL NEW COPY — this feature did not exist before the i18n port, so
 * `scripts/i18n-check.ts` reports every key here as "no counterpart in the base
 * tree" (its known false-positive class 1). There is nothing to be byte-identical
 * to.
 *
 * The seven symbology names (`cards.format.*`) are the SAME in both catalogs on
 * purpose: they are the labels printed on the cards themselves ("EAN-13",
 * "Code 128"), not descriptions, and a user comparing the app to their card has to
 * find the same string. Only "QR-Code"/"QR code" differs, because that one has a
 * real German spelling.
 */
import type { NamespaceCatalog } from "@toon/shared";

export const cardsDe = {
  // CardsPage
  "cards.heading": "Karten",
  "cards.subtitle": "Kundenkarten und Ausweise — an der Kasse einfach vorzeigen.",
  "cards.add": "Karte hinzufügen",
  "cards.privateHint":
    "Karten gehören zu deinem Konto, nicht zur Gruppe — andere Mitglieder sehen sie nicht.",
  "cards.count": { one: "{count} Karte", other: "{count} Karten" },
  "cards.empty.title": "Noch keine Karte gespeichert",
  "cards.empty.description":
    "Scanne den Code deiner Kundenkarte oder tippe die Nummer ein. Danach kannst du die Karte an der Kasse vom Handy zeigen und die Plastikkarte zu Hause lassen.",
  "cards.empty.action": "Erste Karte hinzufügen",

  // The link from /shopping into this screen
  "cards.link.title": "Karten",
  "cards.link.description": "Kundenkarten an der Kasse vom Handy zeigen",
  "cards.link.action": "Karten verwalten",

  // Card tile + its overflow menu
  "cards.tile.show": "Karte zeigen",
  "cards.tile.menu": "Weitere Aktionen für „{label}“",
  "cards.action.edit": "Bearbeiten",
  "cards.action.delete": "Löschen",
  "cards.action.cancel": "Abbrechen",
  "cards.action.save": "Speichern",
  "cards.action.add": "Hinzufügen",

  // CardFormDialog
  "cards.form.addTitle": "Karte hinzufügen",
  "cards.form.editTitle": "Karte bearbeiten",
  "cards.form.label.label": "Bezeichnung",
  "cards.form.label.placeholder": "z. B. Payback",
  "cards.form.format.label": "Codetyp",
  "cards.form.format.hint": "Steht meist klein neben dem Code. Im Zweifel einfach scannen.",
  "cards.form.value.label": "Nummer",
  "cards.form.value.placeholder": "Ziffern unter dem Code",
  "cards.form.value.hint":
    "Leerzeichen und Bindestriche kannst du weglassen. Fehlt die letzte Prüfziffer, ergänzen wir sie.",
  "cards.form.note.label": "Notiz",
  "cards.form.note.placeholder": "z. B. Karte von Anna",
  "cards.form.scan": "Scannen",
  "cards.form.preview": "Vorschau",
  "cards.form.previewPending": "Sobald die Nummer stimmt, siehst du hier den Code.",
  "cards.form.saved": "„{label}“ gespeichert",
  "cards.form.updated": "„{label}“ aktualisiert",

  // Delete
  "cards.delete.title": "Karte löschen?",
  "cards.delete.description":
    "„{label}“ wird aus deinen Karten entfernt. Das lässt sich nicht rückgängig machen.",
  "cards.delete.success": "„{label}“ gelöscht",
  "cards.delete.error": "Löschen fehlgeschlagen",

  // CardDisplayDialog — the screen you hold up at the till
  "cards.show.brightnessHint": "Tipp: Helligkeit hochdrehen, dann liest der Scanner besser.",

  // ScannerDialog
  "cards.scan.title": "Code scannen",
  "cards.scan.hint": "Halte den Barcode oder QR-Code der Karte in den Rahmen.",
  "cards.scan.starting": "Kamera wird gestartet …",
  "cards.scan.retry": "Nochmal versuchen",
  "cards.scan.manual": "Nummer eintippen",
  "cards.scan.error.permission":
    "Kein Zugriff auf die Kamera. Erlaube den Zugriff in den Browser-Einstellungen — oder tippe die Nummer ein.",
  "cards.scan.error.unavailable":
    "Dieses Gerät hat keine Kamera, die wir nutzen können. Bitte tippe die Nummer ein.",
  "cards.scan.error.load":
    "Der Scanner konnte nicht geladen werden. Dafür braucht es einmal eine Verbindung — die Nummer kannst du aber immer eintippen.",
  "cards.scan.error.unsupported":
    "Diesen Codetyp kann die App nicht anzeigen. Bitte tippe die Nummer ein oder nimm eine andere Karte.",
  "cards.scan.offline": "Zum Scannen brauchst du einmal eine Verbindung.",
  "cards.scan.success": "Code erkannt: {format}",

  // Symbology names — see the header for why these are identical in `en`.
  "cards.format.qr": "QR-Code",
  "cards.format.ean13": "EAN-13",
  "cards.format.ean8": "EAN-8",
  "cards.format.upca": "UPC-A",
  "cards.format.code128": "Code 128",
  "cards.format.code39": "Code 39",
  "cards.format.itf": "ITF (2 aus 5)",
} as const satisfies NamespaceCatalog<"cards">;

export type CardsCatalog = typeof cardsDe;
