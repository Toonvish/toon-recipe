import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BottomTabBar } from "./BottomTabBar";
import { InstallPrompt } from "./InstallPrompt";
import { OfflineBanner } from "./OfflineBanner";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

/**
 * The authenticated app frame.
 *  - phones: sticky top bar + fixed bottom tab bar, content padded for both,
 *  - >= lg: fixed sidebar + centred content column.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <SideNav />
      <div className="lg:pl-64">
        <TopBar />
        <OfflineBanner />
        <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-tabbar px-safe lg:px-8 lg:pt-8">
          <InstallPrompt />
          {children}
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right (desktop) / below the title (mobile). */
  actions?: ReactNode;
  /** Back link / breadcrumb slot above the title. */
  above?: ReactNode;
  className?: string;
}

/**
 * Consistent screen heading. Other feature agents should use this so every page
 * looks the same: `<PageHeader title="Rezepte" actions={<Button …/>} />`.
 */
export function PageHeader({ title, description, actions, above, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:mb-6", className)}>
      {above}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg sm:text-3xl">
            {title}
          </h1>
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
