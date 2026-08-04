/**
 * "bitte prüfen" marker for low-confidence fields and rows.
 * Purely informational — it never blocks saving.
 */
import { CircleCheck, CircleQuestionMark, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { confidenceLevel, formatConfidence, type ConfidenceLevel } from "../lib/confidence";

export interface ConfidenceBadgeProps {
  /** Raw confidence 0..1 from the draft (optional). */
  value?: number | null;
  /** Overrides the level derived from `value`. */
  level?: ConfidenceLevel;
  /** Why the row is flagged — rendered as a title tooltip and optional hint text. */
  reasons?: readonly string[];
  /** Custom label; defaults to "bitte prüfen". */
  label?: string;
  /** Render even when the value looks good (shows a green check). */
  showWhenGood?: boolean;
  className?: string;
}

const STYLES: Record<ConfidenceLevel, string> = {
  low: "bg-warning-soft text-warning-soft-fg ring-warning/40",
  medium: "bg-warning-soft text-warning-soft-fg ring-warning/30",
  unknown: "bg-surface-2 text-fg-muted ring-line-strong",
  high: "bg-brand-soft text-success-soft-fg ring-brand/30",
};

export function ConfidenceBadge({
  value,
  level,
  reasons,
  label,
  showWhenGood = false,
  className,
}: ConfidenceBadgeProps) {
  const resolved: ConfidenceLevel = level ?? confidenceLevel(value ?? undefined);
  if (resolved === "high" && !showWhenGood) return null;

  const text = label ?? (resolved === "high" ? "sieht gut aus" : "bitte prüfen");
  const tooltipParts = [
    ...(reasons ?? []),
    typeof value === "number" ? `Erkennungsqualität: ${formatConfidence(value)}` : undefined,
  ].filter((part): part is string => typeof part === "string" && part.length > 0);

  const Icon = resolved === "high" ? CircleCheck : resolved === "unknown" ? CircleQuestionMark : TriangleAlert;

  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium ring-1 ring-inset",
        STYLES[resolved],
        className,
      )}
      title={tooltipParts.length > 0 ? tooltipParts.join(" · ") : undefined}
    >
      <Icon aria-hidden className="h-3 w-3" />
      {text}
    </span>
  );
}

/** Multi-line reason list under a flagged row. */
export function ConfidenceReasons({ reasons, className }: { reasons: readonly string[]; className?: string }) {
  if (reasons.length === 0) return null;
  return (
    <p className={clsx("text-[11px] leading-4 text-warning", className)}>
      {reasons.join(" · ")}
    </p>
  );
}

export default ConfidenceBadge;
