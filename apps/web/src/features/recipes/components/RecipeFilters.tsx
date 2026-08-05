/**
 * Search + filter bar of the recipe list. Debounced search over title, description and
 * ingredient names, plus an "Erweiterte Suche" panel with tag chips and the collection /
 * difficulty / time / sort selects. Fully controlled — the page owns the state.
 *
 * This IS the app's search: there is no separate `/search` screen any more (it redirected
 * to a second list of recipes with the same hook behind it), so the placeholder has to
 * say what is searched, and the panel toggle has to read as search rather than as a
 * secondary filter control.
 */
import { useEffect, useState } from "react";
import { FilterX, Search, SlidersHorizontal } from "lucide-react";
import type { Collection, Difficulty, RecipeSort, Tag } from "@toon/shared";
import { cn } from "@/lib/cn";
import { Badge, Button, Input, Select, Skeleton } from "@/components/ui";
import { DIFFICULTY_LABEL_KEYS } from "../lib/difficultyLabels";
import { useT } from "@/lib/i18n";
import { TagFilterButton } from "@/features/tags/components/TagChip";
import { SORT_LABELS } from "../lib/format";
import type { RecipeListFilters } from "../lib/queries";

export interface RecipeFiltersProps {
  /** Raw text of the search box (not debounced — the page debounces it). */
  searchText: string;
  onSearchTextChange: (value: string) => void;
  filters: RecipeListFilters;
  onFiltersChange: (filters: RecipeListFilters) => void;
  tags: readonly Tag[];
  tagsLoading?: boolean;
  collections: readonly Collection[];
  /** Number of matches, announced politely. */
  total?: number;
  isFetching?: boolean;
}

export function countActiveFilters(filters: RecipeListFilters): number {
  let count = 0;
  if (filters.tagIds && filters.tagIds.length > 0) count += filters.tagIds.length;
  if (filters.collectionId) count += 1;
  if (filters.maxMinutes !== undefined) count += 1;
  if (filters.difficulty) count += 1;
  return count;
}

export function RecipeFilters({
  searchText,
  onSearchTextChange,
  filters,
  onFiltersChange,
  tags,
  tagsLoading = false,
  collections,
  total,
  isFetching = false,
}: RecipeFiltersProps) {
  const t = useT();
  const activeCount = countActiveFilters(filters);
  const [advancedOpen, setAdvancedOpen] = useState(activeCount > 0);

  const sortOptions = (Object.keys(SORT_LABELS) as RecipeSort[]).map((value) => ({
    value,
    label: t(SORT_LABELS[value]),
  }));

  const timeOptions = [
    { value: "", label: t("recipes.filters.maxDuration.any") },
    { value: "15", label: t("recipes.filters.maxDuration.upTo15") },
    { value: "30", label: t("recipes.filters.maxDuration.upTo30") },
    { value: "45", label: t("recipes.filters.maxDuration.upTo45") },
    { value: "60", label: t("recipes.filters.maxDuration.upTo60") },
    { value: "120", label: t("recipes.filters.maxDuration.upTo120") },
  ];

  const difficultyOptions = [
    { value: "", label: t("recipes.filters.difficulty.any") },
    { value: "einfach", label: t(DIFFICULTY_LABEL_KEYS.einfach) },
    { value: "mittel", label: t(DIFFICULTY_LABEL_KEYS.mittel) },
    { value: "schwer", label: t(DIFFICULTY_LABEL_KEYS.schwer) },
  ];

  // Reveal the advanced panel when a filter is set from the outside (e.g. deep link).
  useEffect(() => {
    if (activeCount > 0) setAdvancedOpen(true);
  }, [activeCount]);

  const selectedTagIds = filters.tagIds ?? [];

  function toggleTag(tagId: string) {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onFiltersChange({ ...filters, tagIds: next });
  }

  function reset() {
    onSearchTextChange("");
    onFiltersChange({ sort: filters.sort });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="search"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder={t("recipes.filters.searchPlaceholder")}
          aria-label={t("recipes.filters.searchAriaLabel")}
          leftIcon={<Search />}
          containerClassName="flex-1"
          autoComplete="off"
        />
        <Button
          type="button"
          variant={advancedOpen ? "primary" : "outline"}
          onClick={() => setAdvancedOpen((value) => !value)}
          aria-expanded={advancedOpen}
          aria-controls="recipe-filter-panel"
          aria-label={t("recipes.filters.advancedToggle")}
          leftIcon={<SlidersHorizontal className="size-4" />}
          className="shrink-0"
        >
          <span className="hidden sm:inline">{t("recipes.filters.advancedToggle")}</span>
          {activeCount > 0 ? (
            <Badge size="sm" variant={advancedOpen ? "neutral" : "brand"}>
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      <div
        id="recipe-filter-panel"
        hidden={!advancedOpen}
        className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label={t("recipes.filters.sort.label")}
            options={sortOptions}
            value={filters.sort ?? "newest"}
            onChange={(event) =>
              onFiltersChange({ ...filters, sort: event.target.value as RecipeSort })
            }
          />
          <Select
            label={t("recipes.filters.collection.label")}
            options={[
              { value: "", label: t("recipes.filters.collection.all") },
              ...collections.map((collection) => ({
                value: collection.id,
                label: collection.name,
              })),
            ]}
            value={filters.collectionId ?? ""}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                collectionId: event.target.value === "" ? undefined : event.target.value,
              })
            }
          />
          <Select
            label={t("recipes.filters.maxDuration.label")}
            options={timeOptions}
            value={filters.maxMinutes === undefined ? "" : String(filters.maxMinutes)}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                maxMinutes:
                  event.target.value === "" ? undefined : Number.parseInt(event.target.value, 10),
              })
            }
          />
          <Select
            label={t("recipes.filters.difficulty.label")}
            options={difficultyOptions}
            value={filters.difficulty ?? ""}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                difficulty:
                  event.target.value === "" ? undefined : (event.target.value as Difficulty),
              })
            }
          />
        </div>

        {/*
          `min-w-0` is load-bearing: a <fieldset> carries the browser's own
          `min-inline-size: min-content`, so without it the chip row below cannot
          shrink, the fieldset grows to fit every chip (580px on a 390px phone) and the
          WHOLE PAGE scrolls sideways — the `scroll-x` on the row never gets a chance.
        */}
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t("recipes.filters.tagsLegend")}</legend>
          {tagsLoading ? (
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20" rounded="full" />
              <Skeleton className="h-7 w-24" rounded="full" />
              <Skeleton className="h-7 w-16" rounded="full" />
            </div>
          ) : tags.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("recipes.filters.tagsEmpty")}</p>
          ) : (
            <div className="scroll-x no-scrollbar -mx-1 flex min-w-0 gap-1.5 px-1 pb-1">
              {tags.map((tag) => (
                <TagFilterButton
                  key={tag.id}
                  tag={tag}
                  active={selectedTagIds.includes(tag.id)}
                  onToggle={toggleTag}
                />
              ))}
            </div>
          )}
          {selectedTagIds.length > 1 ? (
            <p className="text-xs text-fg-subtle">{t("recipes.filters.tagsAllRequired")}</p>
          ) : null}
        </fieldset>

        <div className="flex items-center justify-between gap-2">
          <p aria-live="polite" className={cn("text-sm", isFetching ? "text-fg-subtle" : "text-fg-muted")}>
            {typeof total === "number" ? t("recipes.filters.resultsCount", { count: total }) : ""}
          </p>
          {activeCount > 0 || searchText.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              leftIcon={<FilterX className="size-4" />}
            >
              {t("recipes.filters.reset")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
