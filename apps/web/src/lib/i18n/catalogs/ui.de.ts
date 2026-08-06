/**
 * German — namespace "ui" (`apps/web/src/{components,lib}` outside `features/*`).
 * Seeded by the foundation with the keys IT needed itself: `lib/api.ts`'s HTTP
 * fallbacks and `lib/format.ts`'s small rendering strings. Agent 6 extends
 * this file with everything else in `components/`/`lib/` (except
 * `lib/i18n/**`, which stays foundation-owned) — see docs/i18n.md §9.
 */
import type { NamespaceCatalog } from "@toon/shared";

export const uiDe = {
  /* ------------------------------ lib/format.ts ---------------------------- */
  "ui.time.justNow": "gerade eben",
  "ui.common.dash": "–",
  "ui.servings.defaultUnit": "Portionen",

  /* ------------------------------- lib/api.ts ------------------------------- */
  "ui.error.unknown": "Unbekannter Fehler. Bitte versuche es noch einmal.",
  /**
   * `apiFieldErrors`' last resort for a thrown value that is not an `Error` at
   * all. Deliberately the SHORT sentence and NOT `ui.error.unknown`: it lands in
   * a form's `_form` slot next to "Etwas ist schiefgelaufen", where the second
   * half would read as a duplicate instruction. `lib/validation.test.ts` pins it.
   */
  "ui.error.unknownValue": "Unbekannter Fehler.",
  "ui.error.network": "Keine Verbindung zum Server. Bist du offline?",
  "ui.error.unauthorized": "Bitte melde dich an.",
  "ui.error.forbidden": "Dazu hast du keine Berechtigung.",
  "ui.error.notFound": "Nicht gefunden.",
  "ui.error.conflict": "Das steht im Konflikt mit vorhandenen Daten.",
  "ui.error.payloadTooLarge": "Die Datei ist zu groß (max. 15 MB).",
  "ui.error.unsupportedMediaType": "Dieser Dateityp wird nicht unterstützt.",
  "ui.error.validationFailed": "Die Eingaben sind unvollständig oder ungültig.",
  "ui.error.serverError": "Serverfehler. Bitte versuche es später noch einmal.",
  "ui.error.requestFailed": "Anfrage fehlgeschlagen.",
  "ui.upload.tooLarge": '"{filename}" ist {size} MB groß. Maximal 15 MB sind erlaubt.',

  /* -------------------------------- main.tsx -------------------------------- */
  "ui.boot.missingRoot": "#root fehlt in index.html",

  /* --------------------------- nav-items.ts / nav --------------------------- */
  "ui.nav.recipes": "Rezepte",
  "ui.nav.shopping": "Einkauf",
  "ui.nav.import": "Importieren",
  "ui.nav.profile": "Profil",
  "ui.nav.groups": "Gruppen",
  "ui.nav.collections": "Sammlungen",
  "ui.nav.tags": "Tags",
  "ui.nav.mainNavLabel": "Hauptnavigation",

  /* -------------------------------- TopBar.tsx ------------------------------ */
  "ui.topbar.searchRecipes": "Rezepte suchen",
  "ui.topbar.newRecipe": "Rezept anlegen",

  /* -------------------------------- SideNav.tsx ------------------------------ */
  "ui.sidenav.newRecipe": "Neues Rezept",
  "ui.sidenav.logout": "Abmelden",

  /* ----------------------------- OfflineBanner.tsx --------------------------- */
  "ui.offlineBanner.message":
    "Offline – gespeicherte Rezepte sind sichtbar, Änderungen erst wieder online möglich.",

  /* ----------------------------- UpdateBanner.tsx ---------------------------- */
  "ui.updateBanner.message": "Neue Version verfügbar. Deine Änderungen sind noch nicht gespeichert.",
  "ui.updateBanner.reload": "Trotzdem neu laden",

  /* ----------------------------- InstallPrompt.tsx --------------------------- */
  "ui.installPrompt.heading": "Rezepte auf dem Startbildschirm",
  "ui.installPrompt.description":
    "Installiere die App, um sie wie eine normale App zu öffnen – mit eigenem Symbol und ohne Browserleiste. Bereits geöffnete Rezepte kannst du auch ohne Verbindung nachkochen, und die Einkaufsliste lässt sich offline abhaken; Rezepte bearbeiten und Importieren brauchen Internet.",
  "ui.installPrompt.cta": "Zur Startseite hinzufügen",
  "ui.installPrompt.iosHint.before": "Tippe auf",
  "ui.installPrompt.iosHint.after": "und dann auf „Zum Home-Bildschirm“.",
  "ui.installPrompt.shareIconLabel": "Teilen",
  "ui.installPrompt.dismiss": "Hinweis ausblenden",

  /* ------------------------------ NotFoundPage.tsx --------------------------- */
  "ui.notFound.title": "Diese Seite gibt es nicht",
  "ui.notFound.description": "Der Link ist vielleicht veraltet oder das Rezept wurde gelöscht.",
  "ui.notFound.cta": "Zu meinen Rezepten",

  /* ------------------------------ ErrorBoundary.tsx -------------------------- */
  "ui.crash.title": "Da ist etwas schiefgelaufen",
  "ui.crash.description":
    "Die App konnte diesen Bereich nicht anzeigen. Versuche es erneut – deine Rezepte sind sicher gespeichert.",
  "ui.crash.retry": "Erneut versuchen",
  "ui.crash.home": "Zur Startseite",

  /* -------------------------------- ActionMenu.tsx --------------------------- */
  "ui.actionMenu.triggerLabel": "Weitere Aktionen",

  /* -------------------------------- ConfirmDialog.tsx ------------------------ */
  "ui.confirmDialog.confirm": "Bestätigen",
  "ui.confirmDialog.cancel": "Abbrechen",

  /* ----------------------------------- Dialog.tsx ---------------------------- */
  "ui.dialog.close": "Schließen",

  /* ---------------------------------- ErrorState.tsx ------------------------- */
  "ui.errorState.offlineTitle": "Keine Verbindung",
  "ui.errorState.genericTitle": "Etwas ist schiefgelaufen",
  "ui.errorState.retryInline": "Erneut",
  "ui.errorState.retry": "Erneut versuchen",

  /* ------------------------------------ Toast.tsx ---------------------------- */
  "ui.toast.dismissLabel": "Meldung schließen",
  "ui.toast.defaultErrorTitle": "Das hat nicht funktioniert",

  /* ----------------------------------- Spinner.tsx --------------------------- */
  "ui.spinner.loading": "Wird geladen",
  "ui.spinner.loadingEllipsis": "Wird geladen …",

  /* ------------------------------------ Input.tsx ---------------------------- */
  "ui.passwordInput.show": "Passwort anzeigen",
  "ui.passwordInput.hide": "Passwort verbergen",

  /* ---------------------------------- Skeleton.tsx --------------------------- */
  "ui.skeletonList.loadingRecipes": "Rezepte werden geladen",

  /* ----------------------------------- Label.tsx ----------------------------- */
  "ui.label.optional": "(optional)",

  /* -------------------------------- lib/session.tsx --------------------------- */
  "ui.session.offlineSaveBlocked": "Offline — Änderungen können nicht gespeichert werden.",
  "ui.session.emailUnverifiedBlocked":
    "Bitte bestätige zuerst deine E-Mail-Adresse — bis dahin kannst du nur mitlesen.",
  "ui.session.emailUnverifiedBannerTitle": "E-Mail-Adresse noch nicht bestätigt",
  "ui.session.emailUnverifiedBannerBody":
    "Wir haben dir einen Bestätigungslink geschickt. Bis du darauf klickst, kannst du Rezepte und Einkaufslisten nur ansehen — Einladungen annehmen geht trotzdem.",
  "ui.session.emailUnverifiedBannerAction": "Zu den Einstellungen",
  "ui.session.checkingLogin": "Anmeldung wird geprüft …",
  "ui.session.serverUnreachable": "Server nicht erreichbar",
  "ui.session.redirectingToLogin": "Weiterleitung zur Anmeldung …",
  "ui.session.noGroupTitle": "Noch keine Gruppe",
  "ui.session.noGroupDescription":
    "Rezepte gehören immer zu einer Gruppe. Lege eine Gruppe an (z. B. „Familie“) oder nimm eine Einladung an.",
  "ui.session.createGroup": "Gruppe anlegen",
} as const satisfies NamespaceCatalog<"ui">;

export type UiCatalog = typeof uiDe;
