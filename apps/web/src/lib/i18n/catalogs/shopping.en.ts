/**
 * English — namespace "shopping". See `shopping.de.ts` for who owns this file.
 */
import type { LocaleCatalog } from "@toon/shared";
import type { ShoppingCatalog } from "./shopping.de.ts";

export const shoppingEn: LocaleCatalog<ShoppingCatalog> = {
  // ShoppingListsPage — overview
  "shopping.lists.heading": "Shopping",
  "shopping.lists.subtitle": "Shared shopping lists for the whole group.",
  "shopping.lists.create": "Create list",
  "shopping.lists.offlineHint": "You need a connection for that",
  "shopping.lists.empty.title": "No shopping list yet",
  "shopping.lists.empty.description":
    "Create a list, add items, or send it a whole recipe — amounts are scaled to the servings you want.",
  "shopping.lists.empty.action": "Create first list",
  "shopping.lists.rename": "Rename",
  "shopping.lists.delete": "Delete list",
  "shopping.lists.sharedSummary": "Shared with {group} · {members}",
  "shopping.lists.sharedSummarySynced": "Shared with {group} · {members} · {synced}",
  "shopping.lists.syncedRelative": "Synced {relative}",
  "shopping.lists.shopperActive": "{name} is shopping right now",
  "shopping.lists.counts": "{open} to buy · {bought} bought today",
  "shopping.lists.openList": "Open",
  "shopping.lists.previewMore": { one: "+{count} more", other: "+{count} more" },
  "shopping.lists.progressAriaLabel": "Progress: {percent}%",
  "shopping.lists.cardMenuLabel": "Actions for “{name}”",
  "shopping.lists.allLists": "All lists",

  // Shared across list row, detail header, delete/clear confirms, AddRecipeToListDialog
  "shopping.list.empty": "empty",
  "shopping.list.itemCount": { one: "{count} item", other: "{count} items" },
  "shopping.list.name.label": "Name",
  "shopping.list.name.placeholder": "e.g. Rewe",
  "shopping.list.defaultName": "Shopping list",

  // Generic actions reused across the shopping dialogs
  "shopping.action.cancel": "Cancel",
  "shopping.action.save": "Save",
  "shopping.action.create": "Create",
  "shopping.action.delete": "Delete",
  "shopping.action.clear": "Clear",
  "shopping.action.add": "Add",

  // CreateListDialog
  "shopping.create.title": "Create shopping list",
  "shopping.create.success": "“{name}” created",

  // RenameListDialog
  "shopping.rename.title": "Rename list",

  // DeleteListDialog
  "shopping.delete.title": "Delete shopping list?",
  "shopping.delete.confirmDescription":
    "“{name}” and all {itemCount} will be deleted. This cannot be undone.",
  "shopping.delete.success": "“{name}” deleted",
  "shopping.delete.error": "Delete failed",

  // ShoppingListDetailPage
  "shopping.detail.backToLists": "All lists",
  "shopping.detail.backToListsShort": "Lists",
  "shopping.detail.allDone": "All done",
  "shopping.detail.queuedCount": {
    one: "{count} change pending",
    other: "{count} changes pending",
  },
  "shopping.detail.clearList": "Clear list",
  "shopping.detail.offlineBanner":
    "Offline — checking off and adding still work and will sync later.",
  "shopping.detail.empty.title": "Nothing left to buy",
  "shopping.detail.empty.descriptionWithCatalog":
    "Tap a suggestion below or enter something new.",
  "shopping.detail.empty.description":
    "Add items below — or send a whole recipe over from the recipe view.",
  "shopping.detail.subtitle": "{open} to buy · {bought} bought today · tap to tick off",
  "shopping.detail.subtitleShort": "{open} to buy · {bought} bought · tap to tick off",
  "shopping.detail.share": "Share",
  "shopping.detail.shareCopiedToast": "Copied to clipboard",
  "shopping.detail.shareUnavailableToast": "Sharing not possible",
  "shopping.detail.sort.label": "Sort",
  "shopping.detail.sort.position": "List order",
  "shopping.detail.sort.newest": "Newest first",
  "shopping.detail.sort.alpha": "A–Z",
  "shopping.suggestion.dismissError": "Suggestion stays",

  // Clear-list confirm
  "shopping.clear.title": "Clear list?",
  "shopping.clear.description": "All {itemCount} will be removed. “{sectionName}” stays.",

  // AddItemBar
  "shopping.addItem.placeholderExamples": "Add an item — “500 g flour, 2 lemons, milk”",
  "shopping.addItem.ariaLabel": "Add item",
  "shopping.addItem.previewLabel": "Will be added:",

  // AddRecipeToListDialog
  "shopping.addRecipe.title": "Add to shopping list",
  "shopping.addRecipe.submit": {
    one: "Add {count} item",
    other: "Add {count} items",
  },
  "shopping.addRecipe.listsLoading": "Loading shopping lists",
  "shopping.addRecipe.noLists": "This group has no shopping list yet. Create one right here.",
  "shopping.addRecipe.createListError": "Could not create the list.",
  "shopping.addRecipe.createOffline":
    "You need an internet connection for that — creating lists does not work offline.",
  "shopping.addRecipe.list.label": "List",
  "shopping.addRecipe.servings.label": "Servings",
  "shopping.addRecipe.servings.hint": "Amounts are scaled accordingly.",
  "shopping.addRecipe.noServings":
    "This recipe has no serving size, so the amounts are added unchanged.",
  "shopping.addRecipe.ingredients.heading": "Ingredients",
  "shopping.addRecipe.selectAll": "All",
  "shopping.addRecipe.selectAtLeastOne": "Select at least one ingredient.",
  "shopping.addRecipe.mergeNotice": {
    one: "Will be merged into {count} item. Matching items are added to what is already on the list.",
    other:
      "Will be merged into {count} items. Matching items are added to what is already on the list.",
  },
  "shopping.addRecipe.mergeHint":
    "Matching items are added to what is already on the list.",
  "shopping.addRecipe.noIngredients":
    "This recipe has no ingredients that fit on a shopping list.",

  // EditItemDialog
  "shopping.editItem.title": "Edit item",
  "shopping.editItem.name.label": "Item",
  "shopping.editItem.quantity.label": "Amount",
  "shopping.editItem.quantity.placeholder": "empty = no amount",
  "shopping.editItem.quantity.error": "Please enter a number",
  "shopping.editItem.unit.label": "Unit",
  "shopping.editItem.unit.placeholder": "g, ml, pcs …",
  "shopping.editItem.note.label": "Note",
  "shopping.editItem.note.placeholder": "e.g. lactose-free",
  "shopping.editItem.mergeWarning":
    "“{name}” is already on the list — the two items will be merged.",

  // FrequentlyUsed
  "shopping.frequentlyUsed.heading": "Frequently bought",
  "shopping.frequentlyUsed.dismissAriaLabel": "Stop suggesting {name}",
  "shopping.frequentlyUsed.dismissTitle": "Stop suggesting",
  "shopping.frequentlyUsed.showAll": "Show all {count}",
  "shopping.frequentlyUsed.hideHint": "Right-click or long-press a chip to hide it.",
  "shopping.frequentlyUsed.hideConfirm.title": "Stop suggesting “{name}”?",
  "shopping.frequentlyUsed.hideConfirm.description":
    "The suggestion disappears from “Frequently bought”. You can bring it back from “Show all”.",
  "shopping.frequentlyUsed.hiddenToast": "No longer suggested",
  "shopping.frequentlyUsed.showHidden": "Show hidden",
  "shopping.frequentlyUsed.unhide": "Suggest again",
  "shopping.frequentlyUsed.unhiddenToast": "Suggested again",
  "shopping.frequentlyUsed.addAriaLabel": "Add “{name}” to the list",

  // ShoppingItemCard (desktop row) + ShoppingItemTile (phone grid)
  "shopping.item.checkAriaLabel": "Check off {name}",
  "shopping.item.sources": "from {sources}",
  "shopping.item.sourcesMore": "from {name} +{count}",
  "shopping.item.edit": "Edit",
  "shopping.item.remove": "Remove from list",
  "shopping.item.check": "Check off",
  "shopping.item.details": "Details for {name}",
  "shopping.item.longPressHint": "Press and hold a card for details.",

  // ItemDetailDialog
  "shopping.item.detail.amount": "Amount",
  "shopping.item.detail.note": "Note",
  "shopping.item.detail.sources": { one: "From recipe", other: "From recipes" },
  "shopping.item.detail.empty": "No further details.",

  // Section headers + the bought section
  "shopping.toBuy.heading": "To buy",
  "shopping.toBuy.headingWithCount": "To buy · {count}",
  "shopping.bought.heading": "Bought today",
  "shopping.bought.headingWithCount": "Bought today · {count}",
  "shopping.bought.collapse": "Collapse bought items",
  "shopping.bought.expand": "Expand bought items",
  "shopping.bought.clear": "Clear bought",
  "shopping.bought.clearConfirm.title": "Remove bought items from this view?",
  "shopping.bought.clearConfirm.description":
    "The items stay in the bought history — only this view is cleared.",
  "shopping.bought.clearConfirm.confirm": "Remove from view",
  "shopping.bought.clearedToast": "View cleared",
  "shopping.bought.rowMeta": "{who} · {when}",
  "shopping.bought.you": "You",
  "shopping.bought.unknownBuyer": "Unknown",
  "shopping.bought.buyers": "{first} +{count}",
  "shopping.bought.undo": "Back on the list",
  "shopping.bought.undoMergeHint":
    "If “{name}” is on the list again, the amounts are added together.",
  "shopping.bought.undoSuccess": "“{name}” is back on the list",
  "shopping.bought.undoFailed": "Could not be put back",

  // "From this week's plan" (WeekPlanPanel)
  "shopping.fromPlan.title": "From this week's plan",
  "shopping.fromPlan.recipeCount": { one: "{count} recipe", other: "{count} recipes" },
  "shopping.fromPlan.ingredientCount": { one: "{count} ingredient", other: "{count} ingredients" },
  "shopping.fromPlan.missingCount": {
    one: "{count} ingredient not yet on a list",
    other: "{count} ingredients not yet on a list",
  },
  "shopping.fromPlan.subtitle": "{recipes} · {ingredients}",
  "shopping.fromPlan.rowMeta": "{weekday} · {ingredients}",
  "shopping.fromPlan.addAll": "Add everything to “{list}”",
  "shopping.fromPlan.dialog.title": "Add from this week's plan",
  "shopping.fromPlan.dialog.hint": "Untick what you already have at home.",
  "shopping.fromPlan.dialog.submit": {
    one: "{count} ingredient to “{list}”",
    other: "{count} ingredients to “{list}”",
  },
  "shopping.fromPlan.pickList": "Choose another list",
  "shopping.fromPlan.addedToast": "Added to “{list}”",
  "shopping.fromPlan.addFailedToast": "Could not be added",
  "shopping.fromPlan.empty": "Nothing from this week's plan is missing from the list.",
  "shopping.fromPlan.noList": "You need a shopping list before you can add the week's plan.",

  // Bought history: desktop panel + /shopping/history screen
  "shopping.history.title": "Bought history",
  "shopping.history.titleShort": "History",
  "shopping.history.subtitle": "Everything that was ticked off, by day.",
  "shopping.history.all": "All",
  "shopping.history.today": "Today",
  "shopping.history.itemCount": { one: "{count} item", other: "{count} items" },
  "shopping.history.dayMeta": "{items} · {who}",
  "shopping.history.dayMetaShort": "{day} · {count}",
  "shopping.history.empty": "Nothing bought yet.",
  "shopping.history.loadMore": "Load more",

  // ListRecipesPanel + provenance
  "shopping.listRecipe.heading": "Recipes on this list",
  "shopping.listRecipe.ingredientsOf": "{onList} of {total} ingredients",
  "shopping.listRecipe.meta": "{ingredients} · {servings}",
  "shopping.listRecipe.remove": "Remove",
  "shopping.listRecipe.addRecipe": "Add a recipe's ingredients",
  "shopping.listRecipe.remove.title": "Take “{title}” off the list?",
  "shopping.listRecipe.remove.description": {
    one: "One item will be removed.",
    other: "{count} items will be removed.",
  },
  "shopping.listRecipe.remove.sharedNote": {
    one: "One item stays because it also comes from another recipe — its amount does not change.",
    other:
      "{count} items stay because they also come from other recipes — their amounts do not change.",
  },
  "shopping.listRecipe.remove.descriptionExclusive": {
    one: "The only item from “{title}” will be removed.",
    other: "All {count} items from “{title}” will be removed.",
  },
  "shopping.listRecipe.removedToast": "“{title}” taken off the list",
  "shopping.listRecipe.removeFailedToast": "Removing failed",
};
