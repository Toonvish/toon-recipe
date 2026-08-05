/**
 * RecipeListPage — the app's home screen.
 *
 * Compact rows on a phone, responsive card grid from `sm` (2 / 3–4 cols), debounced
 * search, tag chips, collection/difficulty/time filters, sort control and a "Mehr
 * laden" button that matches the API's `{items,total,limit,offset}` pagination.
 *
 * All filters live in the URL (see lib/url-filters.ts), so a filtered view can be
 * shared and the back button restores it.
 */
import { ChefHat, Plus, ScanText } from "lucide-react";
import { Button, EmptyState, ErrorState, SkeletonList, Spinner } from "@/components/ui";
import { buttonClasses } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useActiveGroup } from "@/lib/session";
import { useIsWideViewport } from "@/lib/viewport";
import { useTags } from "@/features/tags/lib/queries";
import { useCollections } from "@/features/collections/lib/queries";
import { AppLink } from "./lib/nav";
import { flattenPages, totalCount, useRecipeList } from "./lib/queries";
import { useUrlRecipeFilters } from "./lib/url-filters";
import { RecipeCard } from "./components/RecipeCard";
import { RecipeRow } from "./components/RecipeRow";
import { RecipeFilters } from "./components/RecipeFilters";

export default function RecipeListPage() {
  const t = useT();
  const { groupId, group } = useActiveGroup();
  /** Cards need width; a phone gets compact rows instead. */
  const wide = useIsWideViewport();
  const { searchText, setSearchText, filters, setFilters, effectiveFilters, hasFilters, reset } =
    useUrlRecipeFilters("/");

  const list = useRecipeList(groupId, effectiveFilters);
  const tags = useTags(groupId);
  const collections = useCollections(groupId);

  const recipes = flattenPages(list.data);
  const total = totalCount(list.data);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-fg">{t("recipes.list.title")}</h1>
          {group ? (
            <p className="truncate text-sm text-fg-muted">
              {t("recipes.list.groupSummary", { name: group.name, count: group.recipeCount })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <AppLink to="/import" className={buttonClasses({ variant: "outline", size: "md" })}>
            <ScanText aria-hidden="true" className="size-4" />
            {t("recipes.list.importAction")}
          </AppLink>
          <AppLink to="/recipes/new" className={buttonClasses({ variant: "primary", size: "md" })}>
            <Plus aria-hidden="true" className="size-4" />
            {t("recipes.list.newAction")}
          </AppLink>
        </div>
      </header>

      <RecipeFilters
        searchText={searchText}
        onSearchTextChange={setSearchText}
        filters={filters}
        onFiltersChange={setFilters}
        tags={tags.data ?? []}
        tagsLoading={tags.isPending}
        collections={collections.data ?? []}
        total={list.isSuccess ? total : undefined}
        isFetching={list.isFetching}
      />

      {list.isPending ? (
        <SkeletonList variant={wide ? "cards" : "rows"} count={wide ? 6 : 8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : recipes.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<ChefHat />}
            title={t("recipes.list.empty.filtered.title")}
            description={t("recipes.list.empty.filtered.description")}
            action={
              <Button variant="secondary" onClick={reset} fullWidth>
                {t("recipes.filters.reset")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ChefHat />}
            title={t("recipes.list.empty.none.title")}
            description={t("recipes.list.empty.none.description")}
            action={
              <AppLink
                to="/recipes/new"
                className={buttonClasses({ variant: "primary", fullWidth: true })}
              >
                <Plus aria-hidden="true" className="size-4" />
                {t("recipes.list.empty.createAction")}
              </AppLink>
            }
            secondaryAction={
              <AppLink to="/import" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                <ScanText aria-hidden="true" className="size-4" />
                {t("recipes.list.empty.importAction")}
              </AppLink>
            }
          />
        )
      ) : (
        <>
          {/*
            Two layouts, one rendered at a time (see lib/viewport.ts for why this is a
            JS branch and not `sm:hidden` on both): compact rows on a phone, where a
            card per screen made the list unscrollable, cards from `sm` up.
          */}
          {wide ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {recipes.map((recipe) => (
                <li key={recipe.id} className="flex">
                  <RecipeCard recipe={recipe} className="w-full" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2">
              {recipes.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeRow recipe={recipe} />
                </li>
              ))}
            </ul>
          )}

          <p aria-live="polite" className="text-center text-sm text-fg-muted">
            {t("recipes.list.resultsCount", { shown: recipes.length, count: total })}
          </p>

          {list.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              fullWidth
              className="sm:mx-auto sm:w-64"
            >
              {t("recipes.list.loadMore")}
            </Button>
          ) : null}

          {list.isFetching && !list.isFetchingNextPage ? (
            <div className="flex justify-center">
              <Spinner label={t("recipes.list.refreshing")} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { RecipeListPage };
