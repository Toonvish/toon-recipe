import { Link } from "@tanstack/react-router";
import { LogOut, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { useLogout, useSession } from "@/lib/session";
import { GroupSwitcher } from "@/features/groups/GroupSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClasses } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Logo } from "./Logo";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./nav-items";

/** Desktop sidebar (>= lg). Same destinations as the mobile tab bar. */
export function SideNav() {
  const { user } = useSession();
  const logout = useLogout();
  const t = useT();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-4 border-r border-line bg-bg-elevated p-4 lg:flex">
      <Link to="/" className="flex items-center gap-2 rounded-xl px-1 py-1.5">
        <Logo className="size-9" />
        <span className="text-lg font-semibold tracking-tight text-fg">Rezepte</span>
      </Link>

      <GroupSwitcher variant="block" />

      <Link to="/recipes/new" className={buttonClasses({ fullWidth: true })}>
        <Plus className="size-4" aria-hidden="true" />
        {t("ui.sidenav.newRecipe")}
      </Link>

      <nav aria-label={t("ui.nav.mainNavLabel")} className="mt-1 flex-1">
        <ul className="flex flex-col gap-1">
          {[...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                activeProps={{
                  className: "bg-brand-soft text-brand-soft-fg hover:bg-brand-soft",
                  "aria-current": "page",
                }}
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={cn("size-5 shrink-0")}
                      strokeWidth={isActive ? 2.3 : 1.9}
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

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Link
          to="/settings"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 hover:bg-surface-2"
        >
          <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-fg">
              {user?.name ?? t("ui.nav.profile")}
            </span>
            <span className="block truncate text-xs text-fg-muted">{user?.email}</span>
          </span>
        </Link>
        <IconButton
          label={t("ui.sidenav.logout")}
          icon={<LogOut />}
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        />
      </div>
    </aside>
  );
}
