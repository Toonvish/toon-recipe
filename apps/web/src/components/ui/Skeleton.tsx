import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

export interface SkeletonProps {
  className?: string;
  /** Renders `lines` stacked bars with a shorter last line. */
  lines?: number;
  rounded?: "sm" | "md" | "full" | "card";
}

const radii = { sm: "rounded", md: "rounded-lg", full: "rounded-full", card: "rounded-card" } as const;

export function Skeleton({ className, lines, rounded = "md" }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className={cn(
              "h-4 animate-skeleton bg-skeleton",
              radii[rounded],
              index === lines - 1 && "w-2/3",
              className,
            )}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn("h-4 animate-skeleton bg-skeleton", radii[rounded], className)}
    />
  );
}

/**
 * Placeholder for a list. `variant` must match the layout that will replace it
 * or the content visibly jumps when the data arrives — see the conflict note in
 * A01 §7.
 *
 * `"cards"` and `"rows"` are the pre-redesign grid/list shapes.
 * @deprecated kept only because `RecipeListPage` still renders them before
 * T10.2's cutover, which deletes both; do not add a new caller for either — use
 * `"editorial"`/`"tiles"`, or `"daycards"` for a `WeekStrip`-shaped row.
 */
export function SkeletonList({
  count = 6,
  variant = "cards",
}: {
  count?: number;
  variant?: "cards" | "rows" | "editorial" | "tiles" | "daycards";
}) {
  const t = useT();
  const common = { "aria-busy": true as const, "aria-label": t("ui.skeletonList.loadingRecipes") };

  if (variant === "rows") {
    return (
      <div className="flex flex-col gap-2" {...common}>
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-card border border-line bg-surface p-2"
          >
            <Skeleton className="size-16 shrink-0" rounded="md" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "editorial") {
    // The artboard's editorial row: an 84px square plus three bars (eyebrow /
    // title / meta), borderless — `grid-template-columns:84px 1fr`, no card frame.
    return (
      <div className="flex flex-col gap-2" {...common}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="grid grid-cols-[5.25rem_1fr] items-center gap-3 p-2">
            <Skeleton className="size-21" rounded="md" />
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "tiles") {
    return (
      <div className="grid grid-cols-2 gap-3" {...common}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-card border border-line bg-surface">
            <Skeleton className="h-28 w-full" rounded="sm" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "daycards") {
    // Matches `WeekStrip`'s own branch — 7 equal-width cards from `lg`, 4 below —
    // so the strip does not pop in narrower or wider than the data it replaces.
    return (
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-7" {...common}>
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className={cn(
              "flex flex-col gap-2 rounded-card border border-line bg-surface p-3",
              index >= 4 && "hidden lg:flex",
            )}
          >
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" {...common}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-card border border-line bg-surface">
          <Skeleton className="h-40 w-full" rounded="sm" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
