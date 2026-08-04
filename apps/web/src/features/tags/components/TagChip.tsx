/**
 * Tag chips. Built on the shared `Badge` (which already picks a legible text colour for
 * a user-chosen hex value) so tags look identical everywhere.
 */
import type { Tag } from "@toon/shared";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";

export interface TagChipProps {
  tag: Pick<Tag, "name" | "color"> & { recipeCount?: number };
  size?: "sm" | "md";
  showCount?: boolean;
  className?: string;
}

export function TagChip({ tag, size = "md", showCount = false, className }: TagChipProps) {
  return (
    <Badge
      size={size}
      variant="neutral"
      color={tag.color ?? undefined}
      className={className}
    >
      {showCount && typeof tag.recipeCount === "number"
        ? `${tag.name} · ${tag.recipeCount}`
        : tag.name}
    </Badge>
  );
}

export interface TagFilterButtonProps {
  tag: Tag;
  active: boolean;
  onToggle: (tagId: string) => void;
}

/**
 * Keyboard-operable filter chip for the recipe list. Active state is conveyed by
 * `aria-pressed` plus a ring, never by colour alone.
 */
export function TagFilterButton({ tag, active, onToggle }: TagFilterButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(tag.id)}
      className={cn(
        "shrink-0 rounded-full transition-shadow",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active && "ring-2 ring-brand ring-offset-1 ring-offset-bg",
      )}
    >
      <TagChip
        tag={tag}
        showCount
        className={cn("cursor-pointer", active && !tag.color && "bg-brand-soft text-brand-soft-fg")}
      />
    </button>
  );
}
