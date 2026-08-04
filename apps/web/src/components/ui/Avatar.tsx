import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/api";
import { initials } from "@/lib/format";

export interface AvatarProps {
  name: string | null | undefined;
  src?: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
} as const;

/** Profile picture with an initials fallback (no layout shift, no broken image icon). */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const resolved = mediaUrl(src);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold text-brand-soft-fg select-none",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {resolved ? (
        <img src={resolved} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
