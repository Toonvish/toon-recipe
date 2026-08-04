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

/** Placeholder that matches the recipe card grid — used while a list loads. */
export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Rezepte werden geladen"
    >
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
