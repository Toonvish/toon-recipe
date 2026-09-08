/**
 * "Rezept für {day} wählen" — an empty day card's own picker. Reuses
 * `RecipeEditorialRow`'s `as="button"`/`onSelect` seam (T7.5) rather than a second
 * row implementation, exactly as `docs/redesign/specs/05-frontend-shell.md` §10.7
 * specifies: a compact search over the group's recipes, one tap plans the day.
 *
 * Deliberately NOT a second recipe-list hook: `useRecipeList` (T2.2/T7.5's
 * dependency, already infinite-paginated) is the one this reuses, same as every
 * other recipe search in the app.
 */
import { useState } from "react";
import { Search } from "lucide-react";
import type { RecipeListItem } from "@toon/shared";
import { Dialog, Input, SkeletonList } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { formatShortWeekdayDate } from "@/lib/format";
import {
  flattenPages,
  useDebouncedValue,
  useRecipeList,
  type RecipeListFilters,
} from "@/features/recipes";
import { RecipeEditorialRow } from "@/features/recipes/components/RecipeEditorialRow";

export interface PlanRecipePickerProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  /** The day being planned — only used for the dialog's title copy. */
  date: string;
  onSelect: (recipe: RecipeListItem) => void;
}

export function PlanRecipePicker({ open, onClose, groupId, date, onSelect }: PlanRecipePickerProps) {
  const t = useT();
  const [text, setText] = useState("");
  const q = useDebouncedValue(text, 300);

  const filters: RecipeListFilters = q.trim().length > 0 ? { q: q.trim(), limit: 20 } : { limit: 20 };
  const list = useRecipeList(open ? groupId : null, filters);
  const recipes = flattenPages(list.data);

  function select(recipe: RecipeListItem) {
    onSelect(recipe);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("plan.picker.title", { day: formatShortWeekdayDate(date) })}
      size="md"
    >
      <div className="flex flex-col gap-3">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("plan.picker.search")}
          aria-label={t("plan.picker.searchAriaLabel")}
          leftIcon={<Search className="size-4" />}
          autoFocus
        />

        {list.isPending ? (
          <>
            <p role="status" className="sr-only">
              {t("plan.picker.loading")}
            </p>
            <SkeletonList variant="editorial" count={4} />
          </>
        ) : recipes.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">{t("plan.picker.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <RecipeEditorialRow recipe={recipe} as="button" onSelect={() => select(recipe)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
