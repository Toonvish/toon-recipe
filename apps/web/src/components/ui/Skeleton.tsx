import { cn } from "@/lib/cn";

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
 * Placeholder for the recipe list. `variant` must match the layout that will
 * replace it — `rows` for the compact phone list, `cards` for the grid from `sm` —
 * or the content visibly jumps when the data arrives.
 */
export function SkeletonList({
  count = 6,
  variant = "cards",
}: {
  count?: number;
  variant?: "cards" | "rows";
}) {
  const common = { "aria-busy": true as const, "aria-label": "Rezepte werden geladen" };

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
