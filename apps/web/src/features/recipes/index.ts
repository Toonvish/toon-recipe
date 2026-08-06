/**
 * Recipe feature barrel.
 *
 * THE ROUTE SCREENS ARE DELIBERATELY NOT RE-EXPORTED HERE. `router.tsx` reaches them
 * with `lazyRouteComponent(() => import("@/features/recipes/RecipeListPage"))`; a
 * static re-export from a barrel anything else imports would pull the same module
 * into the main chunk, and rollup would report the dynamic import as ineffective —
 * i.e. the code splitting would silently stop working. Import a screen by its own
 * path if you ever need it directly.
 */
export { RecipeCard, type RecipeCardProps } from "./components/RecipeCard";
export { RecipeRow, type RecipeRowProps } from "./components/RecipeRow";
export { RecipeFilters, countActiveFilters } from "./components/RecipeFilters";
export { RecipeForm, type RecipeFormProps, type RecipeFormSubmit } from "./components/RecipeForm";
export { IngredientList } from "./components/IngredientList";
export { StepList } from "./components/StepList";
export { ServingsScaler } from "./components/ServingsScaler";
export { CookMode } from "./components/CookMode";
export { IngredientsEditor } from "./components/IngredientsEditor";
export { StepsEditor } from "./components/StepsEditor";
export { RecipeImagePicker } from "./components/RecipeImagePicker";

export { AppLink, useAppNavigate, useRouteParam, useRouteParams, type AppLinkProps } from "./lib/nav";
export {
  useCheckedSteps,
  useDebouncedValue,
  useUnsavedChangesWarning,
  useWakeLock,
  copyToClipboard,
  shareOrCopy,
  moveItem,
  localId,
  type CheckedSteps,
} from "./lib/hooks";
export {
  formatAmount,
  formatAmountWithUnit,
  formatIngredientLine,
  groupBySection,
  optionalMinutes,
  optionalServings,
  recipeToPlainText,
  sectionNames,
  SORT_LABELS,
} from "./lib/format";
export { canModifyOwn, hasAtLeast } from "./lib/permissions";
export {
  useUrlRecipeFilters,
  filtersFromSearch,
  searchFromFilters,
  DEFAULT_SORT,
  type RecipeSearchParams,
  type UrlRecipeFilters,
} from "./lib/url-filters";
export {
  useRecipe,
  useRecipeList,
  useCreateRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useUploadRecipeImage,
  useScaledRecipe,
  duplicatePayload,
  flattenPages,
  totalCount,
  RECIPE_PAGE_SIZE,
  type RecipeListFilters,
} from "./lib/queries";
export {
  emptyRecipeForm,
  recipeToForm,
  formToRequest,
  rowsFromPastedIngredients,
  rowsFromPastedSteps,
  type IngredientRow,
  type RecipeFormValues,
  type StepRow,
} from "./lib/formState";
