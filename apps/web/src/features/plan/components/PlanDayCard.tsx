/**
 * PlanDayCard — one day of `/plan`'s week, in its three drawn states
 * (`planned` / `empty` / `today`, A05 §10.7). No artboard exists for `/plan`
 * itself — the tokens are the same ones the library's week strip already draws,
 * mapped hex-for-hex through SPEC.md §2's audit table.
 *
 * A day may carry several entries (`(group_id, planned_on, recipe_id)` is unique,
 * not `(group_id, planned_on)` — a flatshare plans lunch AND dinner). PLAN.md §4
 * R36 draws the line between the two places this card is used: "the library
 * strip renders the first entry plus a +N affordance; /plan's day column renders
 * all of them." `/plan` is the ONLY place any of entries 2..`entriesPerDay` can be
 * opened, moved, marked cooked or unplanned, so this card renders every entry it
 * is given — `maxEntries` exists only for the library strip's first-plus-+N shape
 * (T8.3), and when it folds entries away the `+N` is a real link to `/plan`, never
 * inert text.
 *
 * ONE `ActionMenu` PER ENTRY — never a row of icon buttons — and every one of its
 * items is `canMutate && {...}`, so the whole trigger disappears (ActionMenu
 * renders nothing for an empty item list) the moment writes are blocked: that is
 * what makes the "every entry's only action disappears" read-only state (R44)
 * fall out of the existing gating rather than needing a separate branch.
 * `compact` is the second reason the trigger can be absent, and the only one that
 * is about WIDTH rather than permission — see the prop.
 */
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import {
  startOfPlanWeek,
  type MealPlanEntry,
  type PlanDate,
  type RecipeListItem,
} from "@toon/shared";
import { ActionMenu, Button, ConfirmDialog, Dialog, Input, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { thumbnailUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useMediaQuery } from "@/lib/viewport";
import { formatDayOfMonth, formatMinutes, formatShortWeekdayDate, formatWeekdayShort } from "@/lib/format";
import { AppLink } from "@/features/recipes/lib/nav";
import { useRecipe } from "@/features/recipes/lib/queries";
import { AddRecipeToListDialog } from "@/features/shopping/components/AddRecipeToListDialog";
import {
  useAddRecipeToShoppingList,
  useCreateShoppingList,
  useShoppingLists,
} from "@/features/shopping/lib/queries";
import {
  usePlanEntryCooked,
  usePlanEntryCookedUndo,
  usePlanEntryCreate,
  usePlanEntryDelete,
  usePlanEntryUpdate,
} from "../lib/queries";
import { PlanRecipePicker } from "./PlanRecipePicker";
import { PlanServingsDialog } from "./PlanServingsDialog";

/**
 * Mirrors the server's `COOK_UNDO_WINDOW_MS` (`apps/api/src/services/recipes/cookLog.ts`),
 * which is not exposed to the client — there is no shared constant to import, so
 * this is the same ten minutes, kept in sync by hand. Worth a second look if the
 * server's value ever changes.
 */
const CLIENT_COOK_UNDO_WINDOW_MS = 10 * 60 * 1000;

/** Desktop card (>= `lg`) vs phone row — see A05 §10.7: the thumbnail is row-only. */
const LG_QUERY = "(min-width: 64rem)";

export interface PlanDayCardProps {
  groupId: string;
  date: PlanDate;
  /** The day's entries, position-sorted. Empty for a day with nothing planned. */
  entries: MealPlanEntry[];
  /**
   * Cap on how many entries this card renders before folding the rest into a
   * `+N` link — for the library strip's compact shape (T8.3). Omitted (the
   * default) renders every entry, which is what `/plan` itself needs (R36).
   */
  maxEntries?: number;
  isToday: boolean;
  /**
   * Compact PREVIEW shape — the library's week strip (T8.3), nothing else.
   * Measured, its cards are 117px wide at 1440 and 80px on a 390px phone while
   * this card's content needs 153px, so the 44px `ActionMenu` trigger bled 37px
   * over the NEXT day's card on the desktop strip and 74px on a phone. Compact
   * therefore drops BOTH oversized pieces — the per-entry menu and the phone
   * thumbnail — and keeps the title, the meta line and the recipe link. Nothing
   * is lost: R36 already makes `/plan` the place an entry is opened, moved,
   * marked cooked or unplanned, and the strip's heading links straight to it.
   * Omitted (the default) is `/plan`'s own full-width card.
   */
  compact?: boolean;
  canMutate: boolean;
  /** Why not, when `canMutate` is false — the `title` on the disabled affordance. */
  reason?: string;
}

const CARD_CLASSES = {
  planned: "border-line bg-surface",
  empty: "border-surface-2 bg-transparent",
  today: "border-brand bg-brand-soft",
} as const;

const EYEBROW_CLASSES = {
  planned: "text-brand-hover",
  empty: "text-fg-subtle",
  today: "text-brand-soft-fg",
} as const;

function dayState(hasEntries: boolean, isToday: boolean): keyof typeof CARD_CLASSES {
  if (isToday) return "today";
  return hasEntries ? "planned" : "empty";
}

function Thumbnail({ entry }: { entry: MealPlanEntry }) {
  const image = thumbnailUrl(entry.recipe);
  if (!image) return null;
  return (
    <img
      src={image}
      alt=""
      loading="lazy"
      decoding="async"
      className="size-14 shrink-0 rounded-lg bg-surface-2 object-cover"
    />
  );
}

interface PlanDayEntryProps {
  groupId: string;
  entry: MealPlanEntry;
  isToday: boolean;
  isWide: boolean;
  compact: boolean;
  canMutate: boolean;
}

/** One entry's body + its own `ActionMenu` and dialogs — a day can hold several. */
function PlanDayEntry({ groupId, entry, isToday, isWide, compact, canMutate }: PlanDayEntryProps) {
  const t = useT();
  const toast = useToast();
  const { isOnline } = useSession();

  const [servingsOpen, setServingsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState(entry.plannedOn);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);

  const updateEntry = usePlanEntryUpdate(groupId);
  const deleteEntry = usePlanEntryDelete(groupId);
  const markCooked = usePlanEntryCooked(groupId);
  const undoCooked = usePlanEntryCookedUndo(groupId);

  // The recipe used by "Zutaten zur Einkaufsliste": the plan entry only carries
  // `PlanRecipeSchema`'s slim shape (thumb, title, meta), not the ingredients
  // `AddRecipeToListDialog` needs, so the full detail is fetched on demand — only
  // once the dialog is actually opened.
  const fullRecipe = useRecipe(shoppingOpen ? groupId : null, entry.recipeId);
  const shoppingLists = useShoppingLists(shoppingOpen ? groupId : null);
  const addToShoppingList = useAddRecipeToShoppingList();
  const createShoppingList = useCreateShoppingList(groupId);

  const withinUndoWindow =
    entry.cookedAt != null && Date.now() - new Date(entry.cookedAt).getTime() < CLIENT_COOK_UNDO_WINDOW_MS;

  function runMarkCooked() {
    markCooked.mutate(
      { recipeId: entry.recipeId, mealPlanEntryId: entry.id },
      { onSuccess: () => toast.success(t("plan.toast.cooked")) },
    );
  }

  function runUndoCooked() {
    undoCooked.mutate(
      { recipeId: entry.recipeId },
      { onSuccess: () => toast.success(t("recipes.detail.cookedUndoneToast")) },
    );
  }

  function submitMove() {
    updateEntry.mutate(
      { entryId: entry.id, patch: { plannedOn: moveDate } },
      {
        onSuccess: () => {
          toast.success(t("plan.toast.moved"));
          setMoveOpen(false);
        },
        onError: (error) => toast.fromError(error, t("plan.toast.failed")),
      },
    );
  }

  async function confirmRemove() {
    try {
      await deleteEntry.mutateAsync(entry.id);
      toast.success(t("plan.toast.removed"));
    } catch (error) {
      toast.fromError(error, t("plan.toast.failed"));
      // Rethrown so ConfirmDialog keeps itself open on failure.
      throw error;
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {isWide || compact ? null : <Thumbnail entry={entry} />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/*
          THE TITLE OWNS THE WHOLE CARD WIDTH AND THE MENU SITS ON THE META LINE,
          and both halves of that are measured rather than stylistic. A recipe
          title carries no clamp and no truncation anywhere in this app, so the
          only way it can be honest inside a 154px `/plan` column is to have all
          of it: beside a 44px trigger it had 80px and broke mid-word
          ("Schokokuch en"). `min-w-0` on the title is what gives it a
          min-content width to shrink to at all, and `break-words` is what makes
          that width a broken word rather than an overflow — its absence on the
          old title/menu ROW is what pushed the trigger 37px out over the next
          day's card in the library strip. The meta line is ~40px ("55 min"), so
          the trigger fits beside it with room to spare, and the negative margins
          keep a 44px tap target from inflating a 86px card. No `hyphens-auto`:
          the title is German CONTENT but `<html lang>` follows the INTERFACE
          locale, so an English UI would hyphenate it by English rules (same
          rule as `ShoppingItemTile`).
        */}
        <AppLink
          to="/recipes/$recipeId"
          params={{ recipeId: entry.recipeId }}
          className="min-w-0 font-display text-display-xs font-medium text-fg text-pretty break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {entry.recipe.title}
        </AppLink>
        <div className="flex min-w-0 items-center justify-between gap-1.5">
          <p className="min-w-0 text-xs text-fg-subtle tabular-nums">
            {formatMinutes(entry.recipe.totalMinutes)}
            {isToday ? ` · ${t("plan.day.today")}` : ""}
            {entry.cookedAt != null ? (
              <>
                {" · "}
                <Check aria-hidden="true" className="inline size-3 align-text-bottom" />{" "}
                {t("plan.day.cooked")}
              </>
            ) : null}
          </p>
          {compact ? null : (
            <ActionMenu
              label={t("plan.entry.menuLabel", { title: entry.recipe.title })}
              className="-my-1.5 -mr-1.5 shrink-0"
              items={[
                canMutate && {
                  label: t("plan.entry.servings"),
                  onSelect: () => setServingsOpen(true),
                },
                canMutate &&
                  entry.cookedAt == null && {
                    label: t("plan.entry.markCooked"),
                    onSelect: runMarkCooked,
                  },
                canMutate &&
                  withinUndoWindow && {
                    label: t("recipes.detail.cookedUndo"),
                    onSelect: runUndoCooked,
                  },
                canMutate && {
                  label: t("plan.entry.move"),
                  onSelect: () => {
                    setMoveDate(entry.plannedOn);
                    setMoveOpen(true);
                  },
                },
                canMutate && {
                  label: t("plan.entry.addToList"),
                  onSelect: () => setShoppingOpen(true),
                },
                canMutate && {
                  label: t("plan.entry.remove"),
                  variant: "danger" as const,
                  onSelect: () => setRemoveOpen(true),
                },
              ]}
            />
          )}
        </div>
      </div>

      <PlanServingsDialog
        open={servingsOpen}
        onClose={() => setServingsOpen(false)}
        groupId={groupId}
        entry={entry}
      />

      <Dialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={t("plan.move.title", { title: entry.recipe.title })}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)} fullWidth>
              {t("plan.action.cancel")}
            </Button>
            <Button onClick={submitMove} loading={updateEntry.isPending} fullWidth>
              {t("plan.move.submit")}
            </Button>
          </>
        }
      >
        <Input
          type="date"
          label={t("plan.move.dateLabel")}
          value={moveDate}
          onChange={(event) => setMoveDate(event.target.value)}
        />
      </Dialog>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={confirmRemove}
        title={t("plan.remove.confirmTitle", { title: entry.recipe.title })}
        destructive
      />

      {shoppingOpen && fullRecipe.data ? (
        <AddRecipeToListDialog
          open={shoppingOpen}
          onClose={() => setShoppingOpen(false)}
          recipe={fullRecipe.data}
          initialServings={entry.servings ?? entry.recipe.servingsAmount ?? 1}
          lists={shoppingLists.data ?? []}
          listsLoading={shoppingLists.isPending}
          submitting={addToShoppingList.isPending}
          canCreateList={isOnline}
          creatingList={createShoppingList.isPending}
          onCreateList={(name) => createShoppingList.mutateAsync({ name })}
          onSubmit={async ({ listId, servings, ingredientIds }) => {
            try {
              const result = await addToShoppingList.addRecipe({
                groupId,
                listId,
                recipeId: entry.recipeId,
                servings,
                ingredientIds,
              });
              setShoppingOpen(false);
              toast.success(
                t("recipes.detail.addedToListToast"),
                t("recipes.detail.addedToListDetail", {
                  listName: result.list.name,
                  count: result.items.length,
                }),
              );
            } catch (error) {
              toast.fromError(error, t("recipes.detail.addToListFailedToast"));
            }
          }}
        />
      ) : null}
    </div>
  );
}

export function PlanDayCard({
  groupId,
  date,
  entries,
  maxEntries,
  isToday,
  compact = false,
  canMutate,
  reason,
}: PlanDayCardProps) {
  const t = useT();
  const toast = useToast();
  const isWide = useMediaQuery(LG_QUERY);

  const [pickerOpen, setPickerOpen] = useState(false);

  const createEntry = usePlanEntryCreate(groupId);

  const hasEntries = entries.length > 0;
  const state = dayState(hasEntries, isToday);
  const dayLabel = formatShortWeekdayDate(date);
  const eyebrowText = t("plan.day.eyebrow", {
    weekday: formatWeekdayShort(date),
    day: formatDayOfMonth(date),
  });

  function selectRecipe(recipe: RecipeListItem) {
    createEntry.mutate(
      { recipeId: recipe.id, plannedOn: date },
      {
        onSuccess: () => toast.success(t("plan.toast.planned")),
        onError: (error) => toast.fromError(error, t("plan.toast.failed")),
      },
    );
  }

  if (!hasEntries) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={!canMutate}
          title={reason}
          aria-label={t("plan.day.addAriaLabel", { day: dayLabel })}
          className={cn(
            // `w-full`: a <button> is shrink-to-fit even as a flex container, and
            // the strip renders these inside an <li> rather than as a grid item —
            // so without it an empty day measured 72px against its 117px column
            // while a planned day filled it, and the strip's cards were visibly
            // unequal. On /plan the grid stretches them anyway; this is a no-op there.
            "flex min-h-[86px] w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-center",
            "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-70",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            CARD_CLASSES[state],
          )}
        >
          <span className={cn("eyebrow", EYEBROW_CLASSES[state])}>{eyebrowText}</span>
          <span
            className={cn(
              "flex items-center gap-1 font-display font-medium",
              state === "empty" ? "text-fg-subtle" : "text-fg",
            )}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t("plan.day.empty")}
          </span>
        </button>

        <PlanRecipePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          groupId={groupId}
          date={date}
          onSelect={selectRecipe}
        />
      </>
    );
  }

  const visible = maxEntries !== undefined ? entries.slice(0, maxEntries) : entries;
  const hiddenCount = entries.length - visible.length;

  return (
    <div
      className={cn(
        "flex min-h-[86px] min-w-0 flex-col gap-1.5 rounded-xl border p-2.5",
        CARD_CLASSES[state],
      )}
    >
      <span className={cn("eyebrow", EYEBROW_CLASSES[state])}>{eyebrowText}</span>

      <div className="flex flex-col gap-2">
        {visible.map((entry) => (
          <PlanDayEntry
            key={entry.id}
            groupId={groupId}
            entry={entry}
            isToday={isToday}
            isWide={isWide}
            compact={compact}
            canMutate={canMutate}
          />
        ))}
      </div>

      {hiddenCount > 0 ? (
        // A real affordance, not inert text (R36): the library strip folds the
        // rest of a busy day away, but the only place any of them can be opened
        // is /plan, so the fold has to link there rather than just naming a count.
        <AppLink
          to="/plan"
          search={{ week: startOfPlanWeek(date) }}
          className="text-xs text-fg-subtle underline underline-offset-2 hover:text-fg"
        >
          {t("plan.day.more", { count: hiddenCount })}
        </AppLink>
      ) : null}
    </div>
  );
}
