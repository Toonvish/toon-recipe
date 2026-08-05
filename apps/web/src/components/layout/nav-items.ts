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
import type { MessageKey } from "@/lib/i18n";

export interface NavItem {
  to: "/" | "/import" | "/groups" | "/settings" | "/collections" | "/tags" | "/shopping";
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
 *    here anyway — that is the `GroupSwitcher` in the top bar / sidebar. `/settings`
 *    links to it, which is how phones reach it, and the sidebar still lists it below.
 *
 * Four labels also means "Importieren" fits again.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", labelKey: "ui.nav.recipes", icon: BookOpen, exact: true },
  { to: "/shopping", labelKey: "ui.nav.shopping", icon: ShoppingBasket, exact: false },
  { to: "/import", labelKey: "ui.nav.import", icon: ScanText, exact: false },
  { to: "/settings", labelKey: "ui.nav.profile", icon: Settings, exact: false },
];

/**
 * Secondary destinations. Shown in the SIDEBAR only (there is no sidebar on a phone), so
 * every one of these must also be reachable from a screen in {@link NAV_ITEMS}:
 * Gruppen from Profil, Sammlungen and Tags from the recipe-list filters.
 */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { to: "/groups", labelKey: "ui.nav.groups", icon: Users, exact: false },
  { to: "/collections", labelKey: "ui.nav.collections", icon: FolderHeart, exact: false },
  { to: "/tags", labelKey: "ui.nav.tags", icon: Tag, exact: false },
];
