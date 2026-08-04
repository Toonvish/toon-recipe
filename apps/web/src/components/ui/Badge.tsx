import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { readableTextColor } from "@/lib/format";

export type BadgeVariant = "neutral" | "brand" | "accent" | "success" | "warning" | "danger";
export type BadgeSize = "sm" | "md";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-fg-muted",
  brand: "bg-brand-soft text-brand-soft-fg",
  accent: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success-soft text-success-soft-fg",
  warning: "bg-warning-soft text-warning-soft-fg",
  danger: "bg-danger-soft text-danger-soft-fg",
};

const sizes: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[0.7rem]",
  md: "px-2.5 py-1 text-xs",
};

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** User-chosen hex colour (tags). Overrides `variant` and picks a legible text colour. */
  color?: string | null | undefined;
  icon?: ReactNode;
}

export function Badge({
  variant = "neutral",
  size = "md",
  color,
  icon,
  className,
  children,
  style,
  ...rest
}: BadgeProps) {
  const custom = color ? { backgroundColor: color, color: readableTextColor(color) } : undefined;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium whitespace-nowrap [&_svg]:size-3.5",
        !custom && variants[variant],
        sizes[size],
        className,
      )}
      style={{ ...custom, ...style }}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
