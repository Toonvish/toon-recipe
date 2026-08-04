import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-items";

/**
 * Fixed bottom tab bar for phones (hidden from `lg` up, where the sidebar takes over).
 * Every tab is a >=56px tall touch target and respects the home-indicator inset.
 */
export function BottomTabBar() {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch justify-around px-safe">
        {NAV_ITEMS.map((item) => (
          <li key={item.to} className="flex-1">
            <Link
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="group flex h-tabbar flex-col items-center justify-center gap-1 text-fg-muted transition-colors duration-150"
              activeProps={{ className: "text-brand", "aria-current": "page" }}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150",
                      isActive && "bg-brand-soft",
                    )}
                  >
                    <item.icon
                      className="size-5"
                      strokeWidth={isActive ? 2.4 : 1.9}
                      aria-hidden="true"
                    />
                  </span>
                  <span className={cn("text-[0.68rem] leading-none", isActive && "font-semibold")}>
                    {item.label}
                  </span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
