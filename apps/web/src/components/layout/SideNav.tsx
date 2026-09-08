import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { useActiveGroup, useSession } from "@/lib/session";
import { useShoppingLists } from "@/features/shopping/lib/queries";
import { GroupSwitcher } from "@/features/groups/GroupSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Logo } from "./Logo";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./nav-items";

/**
 * Desktop sidebar (>= lg). Transcribed from artboards 1a/1c/1d, which draw an
 * identical sidebar on all three, so nothing here is extrapolated.
 *
 * `bg-bg-sunken` — one step *below* `--bg` — not `bg-bg-elevated`, which in dark mode
 * is lighter than the page and would invert the intended depth. Every internal divider
 * is `border-surface-2`, the artboard's quieter line, not `border-line`.
 *
 * `data-app-shell` makes `apps/web/src/features/recipes/print.css`'s
 * `aside[data-app-shell]` rule actually match something: before the redesign no
 * element ever carried the attribute, so a printed recipe always included the sidebar.
 */
export function SideNav() {
  const { user } = useSession();
  const { group, groupId } = useActiveGroup();
  const { data: shoppingLists } = useShoppingLists(groupId);
  const t = useT();

  // The sum of `itemCount` over the group's lists — cheap, because that query is
  // already fetched and cached for `/shopping`. `itemCount` is optional (an older
  // server may omit it), so ANY missing value makes the total itself unknown: render
  // no count at all rather than a `0` that looks like an empty list.
  const shoppingCount = shoppingLists?.reduce<number | undefined>((total, list) => {
    if (total === undefined || list.itemCount === undefined) return undefined;
    return total + list.itemCount;
  }, 0);

  return (
    <aside
      data-app-shell
      className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col gap-[22px] border-r border-surface-2 bg-bg-sunken px-3.5 py-5 lg:flex"
    >
      <Link to="/" className="flex items-center gap-2.5 px-1.5">
        <Logo className="size-8" />
        <span className="font-display text-display-md font-medium text-fg">Rezepte</span>
      </Link>

      <GroupSwitcher variant="block" />

      <nav aria-label={t("ui.nav.mainNavLabel")}>
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            // The count trailing slot is per-item, not part of `NavItem` — the sidebar
            // and the tab bar draw different chrome for the same destination, and only
            // Recipes/Shopping carry a count at all. `undefined` renders NOTHING (never
            // a flashing "0") while the source query hasn't resolved yet.
            const count =
              item.to === "/" ? group?.recipeCount : item.to === "/shopping" ? shoppingCount : undefined;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                  activeProps={{
                    className: "bg-brand-soft text-brand-soft-fg hover:bg-brand-soft",
                    "aria-current": "page",
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className="size-[18px] shrink-0"
                        strokeWidth={isActive ? 2.3 : 2}
                        aria-hidden="true"
                      />
                      {t(item.labelKey)}
                      {item.to === "/plan" ? (
                        <Badge variant="accent" size="sm" className="ml-auto">
                          {t("ui.nav.planNewBadge")}
                        </Badge>
                      ) : count !== undefined ? (
                        <span
                          className={cn(
                            "ml-auto text-xs font-medium tabular-nums",
                            isActive ? "text-brand-hover" : "text-fg-subtle",
                          )}
                        >
                          {count}
                        </span>
                      ) : null}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-surface-2 pt-3.5">
        <span className="eyebrow px-3 pb-1.5 text-fg-faint">{t("ui.nav.organiseLabel")}</span>
        <nav aria-label={t("ui.nav.organiseLabel")}>
          <ul className="flex flex-col gap-0.5">
            {SECONDARY_NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="flex items-center gap-3 rounded-control px-3 py-2 text-control font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                  activeProps={{
                    className: "bg-brand-soft text-brand-soft-fg hover:bg-brand-soft",
                    "aria-current": "page",
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className="size-4 shrink-0"
                        strokeWidth={isActive ? 2.3 : 2}
                        aria-hidden="true"
                      />
                      {t(item.labelKey)}
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/*
        The footer row is ONE link, not a row-plus-button (R34): the artboard's
        sidebar has no logout icon and no "Neues Rezept" button. Logout lives on
        `/settings` only (AccountSettingsPage's sign-out card); creating a recipe from
        a non-library screen is the library header's own buttons (area 04). The gear
        is inside the link, so the link's accessible name has to carry the destination
        — the visible name is the user's own name, which doesn't say where it goes.
      */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-surface-2 px-2 py-2.5">
        <Link
          to="/settings"
          aria-label={t("ui.sidenav.accountAction")}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Avatar name={user?.name} src={user?.avatarUrl} size="sm" tone="accent" />
          <span className="min-w-0">
            <span className="block truncate text-[0.81rem] font-semibold text-fg">
              {user?.name ?? t("ui.nav.profile")}
            </span>
            <span className="block truncate text-[0.72rem] text-fg-subtle">{user?.email}</span>
          </span>
          <Settings className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
