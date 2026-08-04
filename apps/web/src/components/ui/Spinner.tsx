import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SpinnerProps {
  /** sm = inline with text, md = buttons, lg = full page */
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Screen-reader label. Defaults to "Wird geladen". */
  label?: string;
}

const sizes = { sm: "size-4", md: "size-5", lg: "size-8" } as const;

export function Spinner({ size = "md", className, label = "Wird geladen" }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center", className)}>
      <LoaderCircle className={cn(sizes[size], "animate-spin")} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Centered spinner for route-level and section-level loading states. */
export function LoadingBlock({ label = "Wird geladen …" }: { label?: string }) {
  return (
    <div className="flex min-h-48 w-full flex-col items-center justify-center gap-3 py-12 text-fg-muted">
      <Spinner size="lg" label={label} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Full-screen loader used while the session bootstrap runs. */
export function FullPageLoader({ label = "Wird geladen …" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-bg">
      <LoadingBlock label={label} />
    </div>
  );
}
