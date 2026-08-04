/**
 * "Zur Einkaufsliste" — pick a list, pick the portions, add the recipe.
 *
 * The portion stepper is the same `ServingsScaler` the recipe page uses, and it opens
 * on whatever the cook is currently LOOKING at (the scaled value, not the stored one),
 * because "I'm cooking this for six" is the state they are already in. Changing it here
 * re-scales the ingredients before they land on the list — the API applies the same
 * `scaleIngredients` the screen does, so the amounts match what was on screen.
 *
 * A live preview of the resulting lines is shown, since scaling plus merging plus
 * nicest-unit conversion means the list will not read exactly like the recipe
 * ("500 ml Milch" x3 becomes "1,5 l").
 */
import { useEffect, useState } from "react";
import { ShoppingBasket } from "lucide-react";
import {
  formatQuantity,
  formatShoppingAmount,
  recipeToShoppingItems,
  scaleIngredients,
  type RecipeDetail,
  type ShoppingList,
} from "@toon/shared";
import { Button, Dialog, Field, Select, Spinner } from "@/components/ui";
import { ServingsScaler } from "@/features/recipes/components/ServingsScaler";

export interface AddRecipeToListDialogProps {
  open: boolean;
  onClose: () => void;
  recipe: RecipeDetail;
  /** Servings the recipe screen is currently showing. */
  initialServings: number;
  lists: ShoppingList[];
  listsLoading: boolean;
  submitting: boolean;
  onSubmit: (input: { listId: string; servings: number | undefined }) => void;
}

export function AddRecipeToListDialog({
  open,
  onClose,
  recipe,
  initialServings,
  lists,
  listsLoading,
  submitting,
  onSubmit,
}: AddRecipeToListDialogProps) {
  const [listId, setListId] = useState("");
  const [servings, setServings] = useState(initialServings);

  // Re-seed whenever the dialog opens: the cook may have changed the portions on the
  // page between two openings, and a stale value would silently add the wrong amounts.
  useEffect(() => {
    if (!open) return;
    setServings(initialServings);
    setListId((current) => (current.length > 0 ? current : (lists[0]?.id ?? "")));
  }, [open, initialServings, lists]);

  const base = typeof recipe.servingsAmount === "number" && recipe.servingsAmount > 0
    ? recipe.servingsAmount
    : null;
  const scalable = base !== null;
  const factor = base === null ? 1 : servings / base;

  // Exactly what the API will compute, using the same pure functions.
  const preview = recipeToShoppingItems(
    factor === 1
      ? recipe.ingredients
      : scaleIngredients(recipe.ingredients, factor, { keepNonScalingUnits: true }),
    recipe.id,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Zur Einkaufsliste"
      description={recipe.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Abbrechen
          </Button>
          <Button
            leftIcon={<ShoppingBasket />}
            loading={submitting}
            disabled={listId.length === 0 || preview.length === 0}
            onClick={() =>
              onSubmit({ listId, servings: scalable ? servings : undefined })
            }
          >
            {preview.length === 1 ? "1 Position" : `${preview.length} Positionen`} hinzufügen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {listsLoading ? (
          <Spinner label="Einkaufslisten werden geladen" />
        ) : lists.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Diese Gruppe hat noch keine Einkaufsliste. Lege zuerst unter „Einkaufen“ eine an.
          </p>
        ) : (
          <Field label="Liste">
            {(props) => (
              <Select
                {...props}
                value={listId}
                onChange={(event) => setListId(event.target.value)}
                options={lists.map((list) => ({ value: list.id, label: list.name }))}
              />
            )}
          </Field>
        )}

        {scalable ? (
          <Field
            label="Portionen"
            hint="Die Mengen werden entsprechend umgerechnet."
          >
            {() => (
              <ServingsScaler
                value={servings}
                baseValue={base}
                unit={recipe.servingsUnit}
                onChange={setServings}
              />
            )}
          </Field>
        ) : (
          <p className="text-sm text-fg-muted">
            Dieses Rezept hat keine Portionsangabe, die Mengen werden unverändert übernommen.
          </p>
        )}

        {preview.length > 0 ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-fg">Kommt auf die Liste</p>
            <ul className="max-h-56 overflow-y-auto rounded-xl border border-line bg-surface-2/50 p-3 text-sm">
              {preview.map((item) => (
                <li key={`${item.name}-${item.unit ?? ""}`} className="flex gap-2 py-0.5">
                  <span className="min-w-16 shrink-0 text-right font-medium tabular-nums text-fg">
                    {formatShoppingAmount(item, formatQuantity)}
                  </span>
                  <span className="text-fg-muted">{item.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-fg-muted">
              Gleiche Artikel werden mit dem zusammengezählt, was schon auf der Liste steht.
            </p>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
