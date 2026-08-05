/**
 * Ingredient list for the detail screen: grouped by section, amounts already scaled
 * by the servings stepper and rendered as German fractions.
 */
import type { RecipeIngredient } from "@toon/shared";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { formatAmountWithUnit, groupBySection } from "../lib/format";

export interface IngredientListProps {
  ingredients: readonly RecipeIngredient[];
  /** True when the shown amounts differ from the stored ones. */
  scaled?: boolean;
  className?: string;
}

export function IngredientList({ ingredients, scaled = false, className }: IngredientListProps) {
  const t = useT();
  if (ingredients.length === 0) {
    return <p className="text-sm text-fg-muted">{t("recipes.ingredients.empty")}</p>;
  }

  const groups = groupBySection(ingredients);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {groups.map((group, groupIndex) => (
        <section key={group.section ?? `group-${groupIndex}`} className="flex flex-col gap-1">
          {group.section ? (
            <h3 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
              {group.section}
            </h3>
          ) : null}
          <ul className="divide-y divide-line">
            {group.items.map((ingredient, index) => {
              const amount = formatAmountWithUnit(ingredient);
              return (
                <li
                  key={`${group.section ?? ""}-${ingredient.position}-${index}`}
                  className="flex gap-3 py-2"
                >
                  <span
                    className={cn(
                      "min-w-20 shrink-0 text-right font-medium tabular-nums",
                      scaled && amount.length > 0 ? "text-brand" : "text-fg",
                    )}
                  >
                    {amount}
                  </span>
                  <span className="flex-1 text-fg">
                    {ingredient.name}
                    {ingredient.note ? (
                      <span className="text-fg-muted"> ({ingredient.note})</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
