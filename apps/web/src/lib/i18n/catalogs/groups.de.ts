/**
 * German — namespace "groups" (`features/groups` + `features/collections` +
 * `features/tags`; see docs/i18n.md §9 for the file's owner).
 */
import type { NamespaceCatalog } from "@toon/shared";

export const groupsDe = {
  /* ------------------------------ shared/common ----------------------------- */
  "groups.common.name": "Name",
  "groups.common.description": "Beschreibung",
  "groups.common.cancel": "Abbrechen",
  "groups.common.save": "Speichern",
  "groups.common.create": "Anlegen",
  "groups.common.delete": "Löschen",
  "groups.badge.active": "Aktiv",
  "groups.count.members": { one: "{count} Mitglied", other: "{count} Mitglieder" },
  "groups.count.recipes": { one: "{count} Rezept", other: "{count} Rezepte" },
  "groups.role.owner": "Eigentümer:in",
  "groups.role.admin": "Administrator:in",
  "groups.role.member": "Mitglied",

  /* ------------------------------ GroupsPage.tsx ---------------------------- */
  "groups.list.title": "Gruppen",
  "groups.list.subtitle": "Rezepte, Tags und Sammlungen gehören immer zu einer Gruppe.",
  "groups.list.create": "Gruppe anlegen",
  "groups.list.emptyTitle": "Noch keine Gruppe",
  "groups.list.emptyDescription":
    "Lege eine Gruppe an, z. B. „Familie“, und lade andere per E-Mail ein.",
  "groups.list.activate": "Aktivieren",
  "groups.list.manage": "Verwalten",
  "groups.create.title": "Neue Gruppe",
  "groups.create.description":
    "Du wirst automatisch Besitzer:in und kannst danach Mitglieder einladen.",
  "groups.create.namePlaceholder": "Familie",
  "groups.create.descriptionPlaceholder": "Unsere gesammelten Familienrezepte.",
  "groups.create.successTitle": "Gruppe angelegt",

  /* ---------------------------- GroupDetailPage.tsx ------------------------- */
  "groups.detail.loading": "Gruppe wird geladen …",
  "groups.detail.backToList": "Zu den Gruppen",
  "groups.detail.backLink": "← Alle Gruppen",
  "groups.detail.tab.members": "Mitglieder",
  "groups.detail.tab.invites": "Einladungen",
  "groups.detail.tab.settings": "Einstellungen",
  "groups.detail.tabsAriaLabel": "Gruppenbereiche",
  "groups.detail.meta": "{members} · {recipes} · angelegt am {date}",
  "groups.detail.activate": "Als aktive Gruppe setzen",
  "groups.settings.heading": "Gruppendaten",
  "groups.settings.readonlyHint":
    "Nur Administrator:innen und Besitzer:innen können diese Angaben ändern.",
  "groups.settings.savedToast": "Gruppe gespeichert",
  "groups.danger.heading": "Gruppe löschen",
  "groups.danger.deleteButton": "Gruppe löschen",
  "groups.danger.deletedToast": "Gruppe gelöscht",
  "groups.danger.deleteFailedToast": "Löschen fehlgeschlagen",
  "groups.danger.warning": {
    one: "Alle {count} Rezept, Tags, Sammlungen und Einladungen dieser Gruppe werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden.",
    other:
      "Alle {count} Rezepte, Tags, Sammlungen und Einladungen dieser Gruppe werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden.",
  },
  "groups.danger.confirmTitle": "Gruppe endgültig löschen?",
  "groups.danger.confirmDescription":
    "Tippe den Gruppennamen „{name}“ ein, um das Löschen zu bestätigen.",
  "groups.danger.confirmButton": "Endgültig löschen",
  "groups.danger.nameLabel": "Gruppenname",
  "groups.danger.nameMismatch": "Der Name stimmt noch nicht überein.",

  /* ---------------------------- components/MemberList.tsx ------------------- */
  "groups.members.roleAriaLabel": "Rolle von {name}",
  "groups.members.you": "Du",
  "groups.members.soleOwner": "Einzige:r Besitzer:in",
  "groups.members.leave": "Verlassen",
  "groups.members.remove": "Entfernen",
  "groups.members.ownershipTransferredToast": "Besitz übertragen",
  "groups.members.roleChangedToast": "Rolle geändert",
  "groups.members.roleChangeFailedToast": "Rolle konnte nicht geändert werden",
  "groups.members.removeConfirmTitle": "Mitglied entfernen?",
  "groups.members.removeConfirmDescription":
    "{name} verliert den Zugriff auf alle Rezepte dieser Gruppe. Von {name} angelegte Rezepte bleiben erhalten.",
  "groups.members.removedToast": "Mitglied entfernt",
  "groups.members.removeFailedToast": "Entfernen fehlgeschlagen",
  "groups.members.leaveConfirmTitle": "Gruppe verlassen?",
  "groups.members.leaveConfirmDescription":
    "Du verlierst den Zugriff auf alle Rezepte, Tags und Sammlungen dieser Gruppe. Eine erneute Einladung ist jederzeit möglich.",
  "groups.members.leftToast": "Gruppe verlassen",
  "groups.members.leaveFailedToast": "Verlassen fehlgeschlagen",

  /* ---------------------------- components/InvitePanel.tsx ------------------- */
  "groups.invite.disabledHint":
    "Einladungen können nur Administrator:innen und Besitzer:innen verwalten.",
  "groups.invite.formHeading": "Person einladen",
  "groups.invite.emailLabel": "E-Mail-Adresse",
  "groups.invite.emailPlaceholder": "oma@example.com",
  "groups.invite.roleLabel": "Rolle",
  "groups.invite.submitButton": "Einladungslink erstellen",
  "groups.invite.formHint":
    "Wir verschicken eine E-Mail mit dem Einladungslink und zeigen dir den Link zusätzlich an, damit du ihn auch selbst weitergeben kannst. Er ist 14 Tage gültig.",
  "groups.invite.outcome.sent.title": "Einladung verschickt",
  "groups.invite.outcome.notConfigured.title": "Neuer Einladungslink — keine E-Mail",
  "groups.invite.outcome.notConfigured.hint":
    "Auf diesem Server ist kein Mailversand eingerichtet. Schicke den Link bitte selbst weiter.",
  "groups.invite.outcome.failed.title": "E-Mail konnte nicht zugestellt werden",
  "groups.invite.outcome.failed.hint":
    "Der Mailversand ist eingerichtet, hat die Nachricht aber abgelehnt — der Grund steht im Server-Log. Die Einladung selbst ist gültig: schicke den Link bitte selbst weiter.",
  "groups.invite.outcome.unknown.title": "Neuer Einladungslink",
  "groups.invite.outcome.unknown.hint":
    "Es wurde keine E-Mail verschickt. Schicke den Link bitte selbst weiter.",
  "groups.invite.sentDescription": "Eine E-Mail ist an {email} unterwegs.",
  "groups.invite.copiedHint": "Der Link ist in der Zwischenablage.",
  "groups.invite.copyHint": "Kopiere den Link unten und schicke ihn weiter.",
  "groups.invite.failedToastTitle": "E-Mail nicht zugestellt",
  "groups.invite.createdNoMailToastTitle": "Einladung erstellt — keine E-Mail",
  "groups.invite.failedToastDescription":
    "Die Einladung für {email} ist gültig, der Mailversand hat sie aber abgelehnt (Grund im Server-Log). {fallback}",
  "groups.invite.alreadyMemberError": "Diese Person ist bereits Mitglied der Gruppe.",
  "groups.invite.linkCopiedToast": "Link kopiert",
  "groups.invite.copyFailedToast": "Kopieren nicht möglich",
  "groups.invite.shareTitle": "Einladung zu {name}",
  "groups.invite.shareText": "Du bist zu „{name}“ bei toon-recipe eingeladen:",
  "groups.invite.copyButton": "Kopieren",
  "groups.invite.shareButton": "Teilen",
  "groups.invite.pendingHeading": "Offene Einladungen",
  "groups.invite.pendingEmpty": "Keine offenen Einladungen.",
  "groups.invite.pendingMeta": "{role} · gültig bis {date} · von {name}",
  "groups.invite.linkButton": "Link",
  "groups.invite.revokeButton": "Zurückziehen",
  "groups.invite.revokedToast": "Einladung zurückgezogen",
  "groups.invite.revokeFailedToast": "Zurückziehen fehlgeschlagen",
  "groups.invite.pastHeading": "Frühere Einladungen ({count})",
  "groups.inviteStatus.pending": "Offen",
  "groups.inviteStatus.accepted": "Angenommen",
  "groups.inviteStatus.revoked": "Zurückgezogen",
  "groups.inviteStatus.expired": "Abgelaufen",

  /* ------------------------------ GroupSwitcher.tsx -------------------------- */
  "groups.switcher.noGroup": "Keine Gruppe",
  "groups.switcher.title": "Gruppe wechseln",
  "groups.switcher.description": "Rezepte, Sammlungen und Tags gehören immer zu einer Gruppe.",
  "groups.switcher.empty": "Du bist noch in keiner Gruppe.",
  "groups.switcher.manageButton": "Gruppen verwalten",

  /* --------------------------------- TagsPage.tsx ---------------------------- */
  "groups.tags.title": "Tags",
  "groups.tags.subtitle": "Tags gehören zur Gruppe und lassen sich in der Rezeptliste als Filter nutzen.",
  "groups.tags.create": "Tag anlegen",
  "groups.tags.emptyTitle": "Noch keine Tags",
  "groups.tags.emptyDescription":
    "Tags entstehen automatisch, wenn du sie beim Anlegen eines Rezepts eintippst — oder du legst sie hier vorab an.",
  "groups.tags.toRecipeList": "Zur Rezeptliste",
  "groups.tags.editLabel": "Tag {name} bearbeiten",
  "groups.tags.deleteLabel": "Tag {name} löschen",
  "groups.tags.deleteConfirmTitle": "Tag löschen?",
  "groups.tags.deleteConfirmDescription": {
    one: "„{name}“ wird von allen {count} Rezept entfernt. Die Rezepte selbst bleiben erhalten.",
    other: "„{name}“ wird von allen {count} Rezepten entfernt. Die Rezepte selbst bleiben erhalten.",
  },
  "groups.tags.deletedToast": "Tag gelöscht",
  "groups.tags.deleteFailedToast": "Löschen fehlgeschlagen",
  "groups.tags.savedToast": "Tag gespeichert",
  "groups.tags.createdToast": "Tag angelegt",
  "groups.tags.nameTakenError": "Diesen Tag gibt es in der Gruppe schon.",
  "groups.tags.editTitle": "Tag bearbeiten",
  "groups.tags.createTitle": "Neuer Tag",
  "groups.tags.namePlaceholder": "Vegetarisch",
  "groups.tags.colorLegend": "Farbe",
  "groups.tags.noColor": "Standard",
  "groups.tags.noColorAriaLabel": "Keine Farbe",
  "groups.tags.colorAriaLabel": "Farbe {hex}",
  "groups.tags.customHexLabel": "Eigener Hex-Wert",
  "groups.tags.previewLabel": "Vorschau:",
  "groups.tags.previewName": "Beispiel",

  /* --------------------------- components/TagCombobox.tsx ------------------- */
  "groups.tagCombobox.label": "Tags",
  "groups.tagCombobox.removeLabel": "Tag {name} entfernen",
  "groups.tagCombobox.createOption": "„{name}“ neu anlegen",
  "groups.tagCombobox.hint":
    "Enter fügt hinzu, Backspace entfernt den letzten. Neue Tags werden automatisch angelegt.",
  "groups.tagCombobox.maxReached": "Maximum erreicht",
  "groups.tagCombobox.placeholder": "Tag eingeben oder wählen …",

  /* ------------------------------ CollectionsPage.tsx ------------------------ */
  "groups.collections.title": "Sammlungen",
  "groups.collections.subtitle": "Bündle Rezepte thematisch, z. B. „Weihnachten“ oder „Meal Prep“.",
  "groups.collections.create": "Sammlung anlegen",
  "groups.collections.emptyTitle": "Noch keine Sammlungen",
  "groups.collections.emptyDescription":
    "Eine Sammlung ist eine geordnete Liste von Rezepten — perfekt für Menüs oder Wochenpläne.",
  "groups.collections.createFirst": "Erste Sammlung anlegen",
  "groups.collections.createTitle": "Neue Sammlung",
  "groups.collections.namePlaceholder": "Weihnachtsbäckerei",
  "groups.collections.createdToast": "Sammlung angelegt",

  /* --------------------------- CollectionDetailPage.tsx ---------------------- */
  "groups.collectionDetail.loading": "Sammlung wird geladen …",
  "groups.collectionDetail.backToList": "Zu den Sammlungen",
  "groups.collectionDetail.backLink": "← Alle Sammlungen",
  "groups.collectionDetail.movedStatus": "Rezept an Position {position} verschoben.",
  "groups.collectionDetail.reorderFailedToast": "Reihenfolge konnte nicht gespeichert werden",
  "groups.collectionDetail.addRecipes": "Rezepte hinzufügen",
  "groups.collectionDetail.editLabel": "Sammlung bearbeiten",
  "groups.collectionDetail.deleteLabel": "Sammlung löschen",
  "groups.collectionDetail.emptyTitle": "Diese Sammlung ist leer",
  "groups.collectionDetail.emptyDescription":
    "Füge Rezepte hinzu, um sie hier in deiner gewünschten Reihenfolge zu sehen.",
  "groups.collectionDetail.moveUpLabel": "{title} nach oben",
  "groups.collectionDetail.moveDownLabel": "{title} nach unten",
  "groups.collectionDetail.removeLabel": "{title} aus Sammlung entfernen",
  "groups.collectionDetail.removedStatus": "{title} entfernt.",
  "groups.collectionDetail.removeFailedToast": "Entfernen fehlgeschlagen",
  "groups.collectionDetail.deleteConfirmTitle": "Sammlung löschen?",
  "groups.collectionDetail.deleteConfirmDescription":
    "„{name}“ wird gelöscht. Die Rezepte selbst bleiben erhalten.",
  "groups.collectionDetail.deletedToast": "Sammlung gelöscht",
  "groups.collectionDetail.deleteFailedToast": "Löschen fehlgeschlagen",
  "groups.collectionDetail.editTitle": "Sammlung bearbeiten",
  "groups.collectionDetail.savedToast": "Sammlung gespeichert",
  "groups.collectionDetail.addDialogTitle": "Rezepte hinzufügen",
  "groups.collectionDetail.addDialogDescription":
    "Suche ein Rezept und tippe darauf, um es an das Ende der Sammlung zu setzen.",
  "groups.collectionDetail.searchLabel": "Suche",
  "groups.collectionDetail.searchPlaceholder": "Titel oder Zutat …",
  "groups.collectionDetail.loadingRecipes": "Rezepte werden geladen …",
  "groups.collectionDetail.noRecipesFound": "Keine Rezepte gefunden.",
  "groups.collectionDetail.included": "Enthalten",
  "groups.collectionDetail.addedToast": "Hinzugefügt",
  "groups.collectionDetail.addFailedToast": "Hinzufügen fehlgeschlagen",
  "groups.collectionDetail.done": "Fertig",
} as const satisfies NamespaceCatalog<"groups">;

export type GroupsCatalog = typeof groupsDe;
