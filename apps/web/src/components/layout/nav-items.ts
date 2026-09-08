import {
  BookOpen,
  CalendarDays,
  CircleUser,
  Folder,
  ShoppingBasket,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

export interface NavItem {
  to: "/" | "/plan" | "/groups" | "/settings" | "/collections" | "/tags" | "/shopping";
  /**
   * A catalog key, not a translated string (§10 rule 8): resolving it at
   * IMPORT time would freeze the label at whatever locale was active on
   * first load, in both the tab bar and the sidebar.
   */
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Only the recipe list must match exactly; the rest match their subtree. */
  exact: boolean;
}

/**
 * The primary destinations — bottom tab bar on phones, sidebar from lg up.
 *
 * FOUR items, and the two that used to be here are gone on purpose:
 *
 *  - **"Suche" is not a destination.** Searching is what you do *to* the recipe list, so
 *    it lives on `/` as the always-visible search field plus the "Erweiterte Suche"
 *    panel. A separate tab meant two screens that both listed recipes.
 *  - **"Gruppen" moved into Profil.** Managing groups and invites is account admin, not
 *    a daily destination; the everyday action (switching the active group) was never
 *    here anyway — that is the `GroupSwitcher`, in the sidebar from `lg` and in each
 *    screen's own `PhoneHeaderRow` below it. `/settings` links to group management,
 *    which is how phones reach it, and the sidebar still lists it below.
 *
 * **Plan took Import's slot.** Importing a recipe is now a one-off action, not a place
 * you come back to, so it moved off the tab bar entirely — it is the `+` sheet in the
 * library header (`/` only). The planner, by contrast, is somewhere you return to every
 * day to see what's for dinner, which is what a tab is for.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", labelKey: "ui.nav.recipes", icon: BookOpen, exact: true },
  { to: "/plan", labelKey: "ui.nav.plan", icon: CalendarDays, exact: false },
  { to: "/shopping", labelKey: "ui.nav.shopping", icon: ShoppingBasket, exact: false },
  { to: "/settings", labelKey: "ui.nav.profile", icon: CircleUser, exact: false },
];

/**
 * Secondary destinations — the artboard's "Organise" group. Shown in the SIDEBAR only
 * (there is no sidebar on a phone), so every one of these must also be reachable from a
 * screen in {@link NAV_ITEMS}:
 *
 *  - **Gruppen**: the `GroupsCard` on `/settings`.
 *  - **Sammlungen** and **Tags**: the recipe filters on `/` — the two management links
 *    live in `RecipeFilterRail` (desktop) and `RecipeFilterSheet` (phone). Until those
 *    land, neither has a phone route at all: the pre-redesign claim that "Erweiterte
 *    Suche" linked to them was never true.
 */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { to: "/collections", labelKey: "ui.nav.collections", icon: Folder, exact: false },
  { to: "/tags", labelKey: "ui.nav.tags", icon: Tag, exact: false },
  { to: "/groups", labelKey: "ui.nav.groups", icon: Users, exact: false },
];
