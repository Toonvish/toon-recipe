/**
 * English — namespace "ui". See `ui.de.ts` for who owns this file and what
 * seeded it.
 */
import type { LocaleCatalog } from "@toon/shared";
import type { UiCatalog } from "./ui.de.ts";

export const uiEn: LocaleCatalog<UiCatalog> = {
  "ui.time.justNow": "just now",
  "ui.common.dash": "–",
  "ui.servings.defaultUnit": "servings",

  "ui.error.unknown": "Unknown error. Please try again.",
  "ui.error.unknownValue": "Unknown error.",
  "ui.error.network": "No connection to the server. Are you offline?",
  "ui.error.unauthorized": "Please sign in.",
  "ui.error.forbidden": "You do not have permission for that.",
  "ui.error.notFound": "Not found.",
  "ui.error.conflict": "That conflicts with existing data.",
  "ui.error.payloadTooLarge": "The file is too large (max. 15 MB).",
  "ui.error.unsupportedMediaType": "This file type is not supported.",
  "ui.error.validationFailed": "The input is incomplete or invalid.",
  "ui.error.serverError": "Server error. Please try again later.",
  "ui.error.requestFailed": "Request failed.",
  "ui.upload.tooLarge": '"{filename}" is {size} MB. The maximum is 15 MB.',

  "ui.boot.missingRoot": "#root is missing from index.html",

  "ui.nav.recipes": "Recipes",
  "ui.nav.shopping": "Shopping",
  "ui.nav.import": "Import",
  "ui.nav.profile": "Profile",
  "ui.nav.groups": "Groups",
  "ui.nav.collections": "Collections",
  "ui.nav.tags": "Tags",
  "ui.nav.mainNavLabel": "Main navigation",

  "ui.topbar.searchRecipes": "Search recipes",
  "ui.topbar.newRecipe": "Add recipe",

  "ui.sidenav.newRecipe": "New recipe",
  "ui.sidenav.logout": "Sign out",

  "ui.offlineBanner.message":
    "Offline – saved recipes are visible, changes can only be saved again once you are back online.",

  "ui.updateBanner.message": "New version available. Your changes have not been saved yet.",
  "ui.updateBanner.reload": "Reload anyway",

  "ui.installPrompt.heading": "Recipes on your home screen",
  "ui.installPrompt.description":
    "Install the app to open it like a normal app – with its own icon and no browser bar. You can cook from recipes you have already opened even without a connection, and the shopping list can be ticked off offline; editing recipes and importing need an internet connection.",
  "ui.installPrompt.cta": "Add to home screen",
  "ui.installPrompt.iosHint.before": "Tap",
  "ui.installPrompt.iosHint.after": 'and then “Add to Home Screen”.',
  "ui.installPrompt.shareIconLabel": "Share",
  "ui.installPrompt.dismiss": "Dismiss hint",

  "ui.notFound.title": "This page does not exist",
  "ui.notFound.description": "The link may be outdated, or the recipe was deleted.",
  "ui.notFound.cta": "Go to my recipes",

  "ui.crash.title": "Something went wrong",
  "ui.crash.description":
    "The app could not display this area. Try again – your recipes are safely stored.",
  "ui.crash.retry": "Try again",
  "ui.crash.home": "Go to home",

  "ui.actionMenu.triggerLabel": "More actions",

  "ui.confirmDialog.confirm": "Confirm",
  "ui.confirmDialog.cancel": "Cancel",

  "ui.dialog.close": "Close",

  "ui.errorState.offlineTitle": "No connection",
  "ui.errorState.genericTitle": "Something went wrong",
  "ui.errorState.retryInline": "Retry",
  "ui.errorState.retry": "Try again",

  "ui.toast.dismissLabel": "Dismiss message",
  "ui.toast.defaultErrorTitle": "That did not work",

  "ui.spinner.loading": "Loading",
  "ui.spinner.loadingEllipsis": "Loading …",

  "ui.passwordInput.show": "Show password",
  "ui.passwordInput.hide": "Hide password",

  "ui.skeletonList.loadingRecipes": "Loading recipes",

  "ui.label.optional": "(optional)",

  "ui.session.offlineSaveBlocked": "Offline — changes cannot be saved right now.",
  "ui.session.emailUnverifiedBlocked":
    "Please confirm your e-mail address first — until then you can only read along.",
  "ui.session.emailUnverifiedBannerTitle": "E-mail address not confirmed yet",
  "ui.session.emailUnverifiedBannerBody":
    "We sent you a confirmation link. Until you click it you can only view recipes and shopping lists — accepting invitations still works.",
  "ui.session.emailUnverifiedBannerAction": "Go to settings",
  "ui.session.checkingLogin": "Checking sign-in …",
  "ui.session.serverUnreachable": "Server unreachable",
  "ui.session.redirectingToLogin": "Redirecting to sign-in …",
  "ui.session.noGroupTitle": "No group yet",
  "ui.session.noGroupDescription":
    "Recipes always belong to a group. Create a group (e.g. “Family”) or accept an invite.",
  "ui.session.createGroup": "Create group",
};
