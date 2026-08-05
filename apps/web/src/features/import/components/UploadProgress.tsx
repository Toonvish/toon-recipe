/**
 * Real upload progress (fed by XHR upload events), plus the file it belongs to.
 */
import clsx from "clsx";
import { FileText, Image as ImageIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatBytes } from "../lib/image";

export interface UploadProgressProps {
  /** 0..1 */
  fraction: number;
  fileName?: string;
  bytes?: number;
  /** Shown above the bar; defaults to a percentage. */
  label?: string;
  /** Bar has no meaningful value yet (e.g. re-encoding before the upload). */
  indeterminate?: boolean;
  kind?: "image" | "pdf";
  className?: string;
}

export function UploadProgress({
  fraction,
  fileName,
  bytes,
  label,
  indeterminate = false,
  kind = "image",
  className,
}: UploadProgressProps) {
  const t = useT();
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  const Icon = kind === "pdf" ? FileText : ImageIcon;

  return (
    <div className={clsx("space-y-2", className)}>
      <div className="flex items-center gap-2 text-sm">
        <Icon aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1 truncate text-fg">
          {fileName ?? t("import.upload.defaultFileName")}
          {typeof bytes === "number" ? (
            <span className="text-fg-muted"> · {formatBytes(bytes)}</span>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums text-fg-muted">
          {label ?? (indeterminate ? "" : `${percent} %`)}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-skeleton"
        role="progressbar"
        aria-label={t("import.upload.ariaLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
      >
        <div
          className={clsx(
            "h-full rounded-full bg-brand transition-[width] duration-200 ease-out",
            indeterminate && "animate-pulse",
          )}
          style={{ width: indeterminate ? "100%" : `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default UploadProgress;
