import {
  BookOpen,
  FolderHeart,
  ScanText,
  Settings,
  ShoppingBasket,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: "/" | "/import" | "/groups" | "/settings" | "/collections" | "/tags" | "/shopping";
  label: string;
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
 *    here anyway — that is the `GroupSwitcher` in the top bar / sidebar. `/settings`
 *    links to it, which is how phones reach it, and the sidebar still lists it below.
 *
 * Four labels also means "Importieren" fits again.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Rezepte", icon: BookOpen, exact: true },
  { to: "/shopping", label: "Einkauf", icon: ShoppingBasket, exact: false },
  { to: "/import", label: "Importieren", icon: ScanText, exact: false },
  { to: "/settings", label: "Profil", icon: Settings, exact: false },
];

/**
 * Secondary destinations. Shown in the SIDEBAR only (there is no sidebar on a phone), so
 * every one of these must also be reachable from a screen in {@link NAV_ITEMS}:
 * Gruppen from Profil, Sammlungen and Tags from the recipe-list filters.
 */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { to: "/groups", label: "Gruppen", icon: Users, exact: false },
  { to: "/collections", label: "Sammlungen", icon: FolderHeart, exact: false },
  { to: "/tags", label: "Tags", icon: Tag, exact: false },
];
