import { Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { GroupSwitcher } from "@/features/groups/GroupSwitcher";

/**
 * Sticky mobile top bar: active-group switcher on the left, search + "new recipe"
 * on the right. Hidden from `lg` up, where the sidebar carries the same controls.
 *
 * The magnifier points at `/`, not at a search screen — searching is part of the recipe
 * list now (see {@link NAV_ITEMS}). It stays useful on `/` itself: tapping it scrolls
 * back to the top, where the search field is.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-safe backdrop-blur-md lg:hidden">
      {/* `px-gutter`, never `px-2 px-safe` — see the utility: the inset would win and
          leave no padding at all in portrait. */}
      <div className="flex h-topbar items-center gap-2 px-gutter [--gutter:0.5rem]">
        <GroupSwitcher className="min-w-0 flex-1" />
        <Link
          to="/"
          aria-label="Rezepte suchen"
          title="Rezepte suchen"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Search className="size-5" aria-hidden="true" />
        </Link>
        <Link
          to="/recipes/new"
          aria-label="Rezept anlegen"
          title="Rezept anlegen"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg shadow-soft transition-colors duration-150 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Plus className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
