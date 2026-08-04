/**
 * Inline error panel. Every import failure is rendered with a concrete title,
 * an actionable German explanation and — where useful — escape hatches.
 * There is deliberately no generic "Fehler" path.
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { CircleAlert, RefreshCw } from "lucide-react";
import { describeError } from "../lib/importApi";

export interface ImportErrorPanelProps {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra buttons, e.g. "trotzdem als Foto importieren". */
  actions?: ReactNode;
  className?: string;
}

export function ImportErrorPanel({ error, onRetry, retryLabel = "Erneut versuchen", actions, className }: ImportErrorPanelProps) {
  if (error === undefined || error === null) return null;
  const described = describeError(error);
  return (
    <div
      className={clsx(
        "rounded-xl border border-danger/40 bg-danger-soft p-3",
        className,
      )}
      role="alert"
    >
      <div className="flex gap-2">
        <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-danger-soft-fg">{described.title}</p>
          <p className="text-xs leading-5 text-danger-soft-fg">{described.hint}</p>
          {(onRetry !== undefined && described.retryable) || actions !== undefined ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {onRetry !== undefined && described.retryable ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-xs font-medium text-danger-soft-fg hover:bg-danger-soft"
                >
                  <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                  {retryLabel}
                </button>
              ) : null}
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ImportErrorPanel;
