/**
 * RecipeListPage — the app's home screen.
 *
 * Responsive card grid (1 col phone / 2 / 3–4 desktop), debounced search, tag chips,
 * collection/difficulty/time filters, sort control and a "Mehr laden" button that
 * matches the API's `{items,total,limit,offset}` pagination.
 *
 * All filters live in the URL (see lib/url-filters.ts), so a filtered view can be
 * shared and the back button restores it.
 */
import { ChefHat, Plus, ScanText } from "lucide-react";
import { Button, EmptyState, ErrorState, SkeletonCardGrid, Spinner } from "@/components/ui";
import { buttonClasses } from "@/components/ui";
import { useActiveGroup } from "@/lib/session";
import { useTags } from "@/features/tags/lib/queries";
import { useCollections } from "@/features/collections/lib/queries";
import { AppLink } from "./lib/nav";
import { flattenPages, totalCount, useRecipeList } from "./lib/queries";
import { useUrlRecipeFilters } from "./lib/url-filters";
import { RecipeCard } from "./components/RecipeCard";
import { RecipeFilters } from "./components/RecipeFilters";

export default function RecipeListPage() {
  const { groupId, group } = useActiveGroup();
  const { searchText, setSearchText, filters, setFilters, effectiveFilters, hasFilters, reset } =
    useUrlRecipeFilters("/");

  const list = useRecipeList(groupId, effectiveFilters);
  const tags = useTags(groupId);
  const collections = useCollections(groupId);

  const recipes = flattenPages(list.data);
  const total = totalCount(list.data);

  return (
    <div className="flex flex-col gap-4 pb-tabbar">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-fg">Rezepte</h1>
          {group ? (
            <p className="truncate text-sm text-fg-muted">
              {group.name} · {group.recipeCount} {group.recipeCount === 1 ? "Rezept" : "Rezepte"}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <AppLink to="/import" className={buttonClasses({ variant: "outline", size: "md" })}>
            <ScanText aria-hidden="true" className="size-4" />
            Importieren
          </AppLink>
          <AppLink to="/recipes/new" className={buttonClasses({ variant: "primary", size: "md" })}>
            <Plus aria-hidden="true" className="size-4" />
            Neu
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
        <SkeletonCardGrid count={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : recipes.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<ChefHat />}
            title="Keine Treffer"
            description="Für diese Suche und Filter gibt es kein Rezept. Setze die Filter zurück oder suche anders."
            action={
              <Button variant="secondary" onClick={reset} fullWidth>
                Filter zurücksetzen
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ChefHat />}
            title="Noch keine Rezepte"
            description="Lege dein erstes Rezept an oder importiere es aus einer Website, einem Foto oder einem PDF."
            action={
              <AppLink
                to="/recipes/new"
                className={buttonClasses({ variant: "primary", fullWidth: true })}
              >
                <Plus aria-hidden="true" className="size-4" />
                Rezept anlegen
              </AppLink>
            }
            secondaryAction={
              <AppLink to="/import" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                <ScanText aria-hidden="true" className="size-4" />
                Rezept importieren
              </AppLink>
            }
          />
        )
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="flex">
                <RecipeCard recipe={recipe} className="w-full" />
              </li>
            ))}
          </ul>

          <p aria-live="polite" className="text-center text-sm text-fg-muted">
            {recipes.length} von {total} {total === 1 ? "Rezept" : "Rezepten"}
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
              Mehr laden
            </Button>
          ) : null}

          {list.isFetching && !list.isFetchingNextPage ? (
            <div className="flex justify-center">
              <Spinner label="Liste wird aktualisiert" />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { RecipeListPage };
