import {
  BookOpen,
  FolderHeart,
  ScanText,
  Search,
  Settings,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: "/" | "/search" | "/import" | "/groups" | "/settings" | "/collections" | "/tags";
  label: string;
  icon: LucideIcon;
  /** Only the recipe list must match exactly; the rest match their subtree. */
  exact: boolean;
}

/** The five primary destinations — bottom tab bar on phones, sidebar from lg up. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Rezepte", icon: BookOpen, exact: true },
  { to: "/search", label: "Suche", icon: Search, exact: false },
  { to: "/import", label: "Importieren", icon: ScanText, exact: false },
  { to: "/groups", label: "Gruppen", icon: Users, exact: false },
  { to: "/settings", label: "Profil", icon: Settings, exact: false },
];

/**
 * Secondary destinations. Shown in the sidebar only — the phone tab bar stays at five
 * items (both screens are also reachable from the recipe-list filters).
 */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { to: "/collections", label: "Sammlungen", icon: FolderHeart, exact: false },
  { to: "/tags", label: "Tags", icon: Tag, exact: false },
];
