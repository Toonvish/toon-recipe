/**
 * English — namespace "groups". See `groups.de.ts` for who owns this file
 * and what it covers.
 */
import type { LocaleCatalog } from "@toon/shared";
import type { GroupsCatalog } from "./groups.de.ts";

export const groupsEn: LocaleCatalog<GroupsCatalog> = {
  /* ------------------------------ shared/common ----------------------------- */
  "groups.common.name": "Name",
  "groups.common.description": "Description",
  "groups.common.cancel": "Cancel",
  "groups.common.save": "Save",
  "groups.common.create": "Create",
  "groups.common.delete": "Delete",
  "groups.badge.active": "Active",
  "groups.count.members": { one: "{count} member", other: "{count} members" },
  "groups.count.recipes": { one: "{count} recipe", other: "{count} recipes" },
  "groups.role.owner": "Owner",
  "groups.role.admin": "Admin",
  "groups.role.member": "Member",

  /* ------------------------------ GroupsPage.tsx ---------------------------- */
  "groups.list.title": "Groups",
  "groups.list.subtitle": "Recipes, tags and collections always belong to a group.",
  "groups.list.create": "Create group",
  "groups.list.emptyTitle": "No group yet",
  "groups.list.emptyDescription":
    "Create a group, e.g. “Family”, and invite others by e-mail.",
  "groups.list.activate": "Activate",
  "groups.list.manage": "Manage",
  "groups.create.title": "New group",
  "groups.create.description":
    "You'll automatically become the owner and can invite members afterwards.",
  "groups.create.namePlaceholder": "Family",
  "groups.create.descriptionPlaceholder": "Our collected family recipes.",
  "groups.create.successTitle": "Group created",

  /* ---------------------------- GroupDetailPage.tsx ------------------------- */
  "groups.detail.loading": "Loading group …",
  "groups.detail.backToList": "Back to groups",
  "groups.detail.backLink": "← All groups",
  "groups.detail.tab.members": "Members",
  "groups.detail.tab.invites": "Invites",
  "groups.detail.tab.settings": "Settings",
  "groups.detail.tabsAriaLabel": "Group sections",
  "groups.detail.meta": "{members} · {recipes} · created on {date}",
  "groups.detail.activate": "Set as active group",
  "groups.settings.heading": "Group details",
  "groups.settings.readonlyHint": "Only admins and owners can change these details.",
  "groups.settings.savedToast": "Group saved",
  "groups.danger.heading": "Delete group",
  "groups.danger.deleteButton": "Delete group",
  "groups.danger.deletedToast": "Group deleted",
  "groups.danger.deleteFailedToast": "Delete failed",
  "groups.danger.warning": {
    one: "All {count} recipe, tags, collections and invites in this group will be permanently deleted. This cannot be undone.",
    other:
      "All {count} recipes, tags, collections and invites in this group will be permanently deleted. This cannot be undone.",
  },
  "groups.danger.confirmTitle": "Permanently delete group?",
  "groups.danger.confirmDescription":
    "Type the group name “{name}” to confirm the deletion.",
  "groups.danger.confirmButton": "Delete permanently",
  "groups.danger.nameLabel": "Group name",
  "groups.danger.nameMismatch": "The name doesn't match yet.",

  /* ---------------------------- components/MemberList.tsx ------------------- */
  "groups.members.roleAriaLabel": "Role of {name}",
  "groups.members.you": "You",
  "groups.members.soleOwner": "Sole owner",
  "groups.members.leave": "Leave",
  "groups.members.remove": "Remove",
  "groups.members.ownershipTransferredToast": "Ownership transferred",
  "groups.members.roleChangedToast": "Role changed",
  "groups.members.roleChangeFailedToast": "Could not change role",
  "groups.members.removeConfirmTitle": "Remove member?",
  "groups.members.removeConfirmDescription":
    "{name} will lose access to all recipes in this group. Recipes {name} created will be kept.",
  "groups.members.removedToast": "Member removed",
  "groups.members.removeFailedToast": "Remove failed",
  "groups.members.leaveConfirmTitle": "Leave group?",
  "groups.members.leaveConfirmDescription":
    "You'll lose access to all recipes, tags and collections in this group. You can be invited again at any time.",
  "groups.members.leftToast": "Left group",
  "groups.members.leaveFailedToast": "Leave failed",

  /* ---------------------------- components/InvitePanel.tsx ------------------- */
  "groups.invite.disabledHint": "Only admins and owners can manage invites.",
  "groups.invite.formHeading": "Invite someone",
  "groups.invite.emailLabel": "E-mail address",
  "groups.invite.emailPlaceholder": "grandma@example.com",
  "groups.invite.roleLabel": "Role",
  "groups.invite.submitButton": "Create invite link",
  "groups.invite.formHint":
    "We send an e-mail with the invite link and also show it to you here, so you can share it yourself. It's valid for 14 days.",
  "groups.invite.outcome.sent.title": "Invite sent",
  "groups.invite.outcome.notConfigured.title": "New invite link — no e-mail",
  "groups.invite.outcome.notConfigured.hint":
    "No mail delivery is set up on this server. Please forward the link yourself.",
  "groups.invite.outcome.failed.title": "E-mail could not be delivered",
  "groups.invite.outcome.failed.hint":
    "Mail delivery is set up, but the message was rejected — the reason is in the server log. The invite itself is valid: please forward the link yourself.",
  "groups.invite.outcome.unknown.title": "New invite link",
  "groups.invite.outcome.unknown.hint":
    "No e-mail was sent. Please forward the link yourself.",
  "groups.invite.sentDescription": "An e-mail is on its way to {email}.",
  "groups.invite.copiedHint": "The link is on your clipboard.",
  "groups.invite.copyHint": "Copy the link below and share it.",
  "groups.invite.failedToastTitle": "E-mail not delivered",
  "groups.invite.createdNoMailToastTitle": "Invite created — no e-mail",
  "groups.invite.failedToastDescription":
    "The invite for {email} is valid, but mail delivery rejected it (reason in the server log). {fallback}",
  "groups.invite.alreadyMemberError": "This person is already a member of the group.",
  "groups.invite.linkCopiedToast": "Link copied",
  "groups.invite.copyFailedToast": "Could not copy",
  "groups.invite.shareTitle": "Invite to {name}",
  "groups.invite.shareText": "You're invited to “{name}” on toon-recipe:",
  "groups.invite.copyButton": "Copy",
  "groups.invite.shareButton": "Share",
  "groups.invite.pendingHeading": "Pending invites",
  "groups.invite.pendingEmpty": "No pending invites.",
  "groups.invite.pendingMeta": "{role} · valid until {date} · from {name}",
  "groups.invite.linkButton": "Link",
  "groups.invite.revokeButton": "Revoke",
  "groups.invite.revokedToast": "Invite revoked",
  "groups.invite.revokeFailedToast": "Revoke failed",
  "groups.invite.pastHeading": "Past invites ({count})",
  "groups.inviteStatus.pending": "Pending",
  "groups.inviteStatus.accepted": "Accepted",
  "groups.inviteStatus.revoked": "Revoked",
  "groups.inviteStatus.expired": "Expired",

  /* ------------------------------ GroupSwitcher.tsx -------------------------- */
  "groups.switcher.noGroup": "No group",
  "groups.switcher.title": "Switch group",
  "groups.switcher.description": "Recipes, collections and tags always belong to a group.",
  "groups.switcher.empty": "You're not in any group yet.",
  "groups.switcher.manageButton": "Manage groups",

  /* --------------------------------- TagsPage.tsx ---------------------------- */
  "groups.tags.title": "Tags",
  "groups.tags.subtitle": "Tags belong to the group and can be used as filters in the recipe list.",
  "groups.tags.create": "Create tag",
  "groups.tags.emptyTitle": "No tags yet",
  "groups.tags.emptyDescription":
    "Tags appear automatically when you type them while creating a recipe — or you can create them here ahead of time.",
  "groups.tags.toRecipeList": "To the recipe list",
  "groups.tags.editLabel": "Edit tag {name}",
  "groups.tags.deleteLabel": "Delete tag {name}",
  "groups.tags.deleteConfirmTitle": "Delete tag?",
  "groups.tags.deleteConfirmDescription": {
    one: "“{name}” will be removed from {count} recipe. The recipes themselves are kept.",
    other: "“{name}” will be removed from {count} recipes. The recipes themselves are kept.",
  },
  "groups.tags.deletedToast": "Tag deleted",
  "groups.tags.deleteFailedToast": "Delete failed",
  "groups.tags.savedToast": "Tag saved",
  "groups.tags.createdToast": "Tag created",
  "groups.tags.nameTakenError": "This tag already exists in the group.",
  "groups.tags.editTitle": "Edit tag",
  "groups.tags.createTitle": "New tag",
  "groups.tags.namePlaceholder": "Vegetarian",
  "groups.tags.colorLegend": "Color",
  "groups.tags.noColor": "Default",
  "groups.tags.noColorAriaLabel": "No color",
  "groups.tags.colorAriaLabel": "Color {hex}",
  "groups.tags.customHexLabel": "Custom hex value",
  "groups.tags.previewLabel": "Preview:",
  "groups.tags.previewName": "Example",

  /* --------------------------- components/TagCombobox.tsx ------------------- */
  "groups.tagCombobox.label": "Tags",
  "groups.tagCombobox.removeLabel": "Remove tag {name}",
  "groups.tagCombobox.createOption": "Create “{name}”",
  "groups.tagCombobox.hint":
    "Enter adds it, Backspace removes the last one. New tags are created automatically.",
  "groups.tagCombobox.maxReached": "Maximum reached",
  "groups.tagCombobox.placeholder": "Type or select a tag …",

  /* ------------------------------ CollectionsPage.tsx ------------------------ */
  "groups.collections.title": "Collections",
  "groups.collections.subtitle": "Group recipes by theme, e.g. “Christmas” or “Meal prep”.",
  "groups.collections.create": "Create collection",
  "groups.collections.emptyTitle": "No collections yet",
  "groups.collections.emptyDescription":
    "A collection is an ordered list of recipes — perfect for menus or weekly plans.",
  "groups.collections.createFirst": "Create first collection",
  "groups.collections.createTitle": "New collection",
  "groups.collections.namePlaceholder": "Christmas baking",
  "groups.collections.createdToast": "Collection created",

  /* --------------------------- CollectionDetailPage.tsx ---------------------- */
  "groups.collectionDetail.loading": "Loading collection …",
  "groups.collectionDetail.backToList": "Back to collections",
  "groups.collectionDetail.backLink": "← All collections",
  "groups.collectionDetail.movedStatus": "Recipe moved to position {position}.",
  "groups.collectionDetail.reorderFailedToast": "Could not save the new order",
  "groups.collectionDetail.addRecipes": "Add recipes",
  "groups.collectionDetail.editLabel": "Edit collection",
  "groups.collectionDetail.deleteLabel": "Delete collection",
  "groups.collectionDetail.emptyTitle": "This collection is empty",
  "groups.collectionDetail.emptyDescription":
    "Add recipes to see them here in your preferred order.",
  "groups.collectionDetail.moveUpLabel": "Move {title} up",
  "groups.collectionDetail.moveDownLabel": "Move {title} down",
  "groups.collectionDetail.removeLabel": "Remove {title} from collection",
  "groups.collectionDetail.removedStatus": "{title} removed.",
  "groups.collectionDetail.removeFailedToast": "Remove failed",
  "groups.collectionDetail.deleteConfirmTitle": "Delete collection?",
  "groups.collectionDetail.deleteConfirmDescription":
    "“{name}” will be deleted. The recipes themselves are kept.",
  "groups.collectionDetail.deletedToast": "Collection deleted",
  "groups.collectionDetail.deleteFailedToast": "Delete failed",
  "groups.collectionDetail.editTitle": "Edit collection",
  "groups.collectionDetail.savedToast": "Collection saved",
  "groups.collectionDetail.addDialogTitle": "Add recipes",
  "groups.collectionDetail.addDialogDescription":
    "Search for a recipe and tap it to add it to the end of the collection.",
  "groups.collectionDetail.searchLabel": "Search",
  "groups.collectionDetail.searchPlaceholder": "Title or ingredient …",
  "groups.collectionDetail.loadingRecipes": "Loading recipes …",
  "groups.collectionDetail.noRecipesFound": "No recipes found.",
  "groups.collectionDetail.included": "Included",
  "groups.collectionDetail.addedToast": "Added",
  "groups.collectionDetail.addFailedToast": "Add failed",
  "groups.collectionDetail.done": "Done",
};
