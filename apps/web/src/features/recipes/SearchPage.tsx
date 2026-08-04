/**
 * SearchPage — the "Suche" tab (and the magnifier in the top bar).
 *
 * This used to resolve to RecipeListPage, so one of the five primary mobile
 * destinations rendered the home screen again, headed "Rezepte", with no focused
 * input. It is now its own screen: an AUTOFOCUSED search field, tag chips, and the
 * same `useRecipeList` hook + URL state as the list (see lib/url-filters.ts), so
 * `/search?q=…&tags=…` is shareable and the back button works.
 */
import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Button, EmptyState, ErrorState, SkeletonCardGrid, Spinner } from "@/components/ui";
import { useActiveGroup } from "@/lib/session";
import { useTags } from "@/features/tags/lib/queries";
import { TagFilterButton } from "@/features/tags/components/TagChip";
import { flattenPages, totalCount, useRecipeList } from "./lib/queries";
import { useUrlRecipeFilters } from "./lib/url-filters";
import { RecipeCard } from "./components/RecipeCard";

export default function SearchPage() {
  const { groupId } = useActiveGroup();
  const { searchText, setSearchText, filters, setFilters, effectiveFilters, hasFilters, reset } =
    useUrlRecipeFilters("/search");

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // The whole point of a dedicated search screen: the keyboard opens itself.
    inputRef.current?.focus();
  }, []);

  const list = useRecipeList(groupId, effectiveFilters);
  const tags = useTags(groupId);

  const recipes = flattenPages(list.data);
  const total = totalCount(list.data);
  const activeTagIds = filters.tagIds ?? [];

  function toggleTag(tagId: string): void {
    const next = activeTagIds.includes(tagId)
      ? activeTagIds.filter((id) => id !== tagId)
      : [...activeTagIds, tagId];
    setFilters({ ...filters, tagIds: next });
  }

  return (
    <div className="flex flex-col gap-4 pb-tabbar">
      <h1 className="font-display text-2xl font-semibold text-fg">Suche</h1>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-fg-subtle"
        />
        <input
          ref={inputRef}
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Rezepte durchsuchen"
          placeholder="Titel, Beschreibung oder Zutat…"
          className="h-12 w-full rounded-xl border border-line bg-surface pr-10 pl-10 text-base text-fg placeholder:text-fg-subtle focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
        {searchText.length > 0 ? (
          <button
            type="button"
            onClick={() => setSearchText("")}
            aria-label="Suche leeren"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-fg-muted hover:bg-surface-2"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      {tags.data && tags.data.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tags.data.map((tag) => (
            <TagFilterButton
              key={tag.id}
              tag={tag}
              active={activeTagIds.includes(tag.id)}
              onToggle={() => toggleTag(tag.id)}
            />
          ))}
        </div>
      ) : null}

      {hasFilters ? (
        <div className="flex items-center justify-between gap-3 text-sm text-fg-muted">
          <span aria-live="polite">
            {list.isSuccess ? `${total} ${total === 1 ? "Treffer" : "Treffer"}` : "Suche läuft…"}
          </span>
          <Button variant="ghost" size="sm" onClick={reset}>
            Zurücksetzen
          </Button>
        </div>
      ) : null}

      {!hasFilters ? (
        <EmptyState
          icon={<Search />}
          title="Wonach suchst du?"
          description="Tippe einen Titel, eine Zutat oder wähle ein Tag aus."
        />
      ) : list.isPending ? (
        <SkeletonCardGrid count={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="Keine Treffer"
          description="Für diese Suche gibt es kein Rezept. Versuche einen kürzeren Begriff."
          action={
            <Button variant="secondary" onClick={reset} fullWidth>
              Suche zurücksetzen
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="flex">
                <RecipeCard recipe={recipe} className="w-full" />
              </li>
            ))}
          </ul>

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
              <Spinner label="Suche wird aktualisiert" />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { SearchPage };
