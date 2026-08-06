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
  "shopping.suggestion.dismissError": "Suggestion stays",

  // Clear-list confirm
  "shopping.clear.title": "Clear list?",
  "shopping.clear.description": "All {itemCount} will be removed. “{sectionName}” stays.",

  // AddItemBar
  "shopping.addItem.placeholder": "e.g. 500 g flour",
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

  // ShoppingItemCard (desktop row) + ShoppingItemTile (phone grid)
  "shopping.item.checkAriaLabel": "Check off {name}",
  "shopping.item.sources": "from {sources}",
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
};
