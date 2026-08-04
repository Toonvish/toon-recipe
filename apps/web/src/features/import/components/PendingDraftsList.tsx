/**
 * Offene Import-Entwürfe. An interrupted import (phone call during OCR, closed
 * tab) is never lost: the draft already exists server-side, so it can be resumed
 * from here.
 */
import clsx from "clsx";
import { Camera, FileText, Globe, PenLine, Trash2 } from "lucide-react";
import type { ImportDraft } from "@toon/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { describeError } from "../lib/importApi";

export interface PendingDraftsListProps {
  drafts: readonly ImportDraft[];
  isLoading?: boolean;
  error?: unknown;
  onOpen: (draftId: string) => void;
  onDelete: (draftId: string) => void;
  deletingDraftId?: string;
  className?: string;
}

export function describeDraftSource(draft: ImportDraft): { label: string; icon: typeof Camera } {
  const method = draft.sourceMeta?.method;
  if (draft.sourceType === "url") return { label: draft.sourceMeta?.host ?? "Webseite", icon: Globe };
  if (method === "pdf-text") return { label: "PDF (Textebene)", icon: FileText };
  if (method === "ocr") {
    const isPdf = typeof draft.sourceMeta?.mimeType === "string" && draft.sourceMeta.mimeType.includes("pdf");
    return { label: isPdf ? "PDF (Texterkennung)" : "Foto (Texterkennung)", icon: isPdf ? FileText : Camera };
  }
  if (draft.sourceType === "manual") return { label: "Eingefügter Text", icon: PenLine };
  return { label: "Import", icon: FileText };
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
  if (diffMinutes < 24 * 60) return `vor ${Math.round(diffMinutes / 60)} Std.`;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PendingDraftsList({
  drafts,
  isLoading = false,
  error,
  onOpen,
  onDelete,
  deletingDraftId,
  className,
}: PendingDraftsListProps) {
  if (isLoading) {
    return (
      <ul className={clsx("space-y-2", className)} aria-busy="true">
        {[0, 1].map((key) => (
          <li key={key} className="h-16 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </ul>
    );
  }

  if (error !== undefined && error !== null) {
    const described = describeError(error);
    return (
      <div
        className={clsx(
          "rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm",
          className,
        )}
      >
        <p className="font-medium text-warning-soft-fg">
          Offene Entwürfe konnten nicht geladen werden: {described.title}
        </p>
        <p className="mt-1 text-xs text-warning-soft-fg">{described.hint}</p>
      </div>
    );
  }

  if (drafts.length === 0) return null;

  return (
    <ul className={clsx("space-y-2", className)}>
      {drafts.map((draft) => {
        const source = describeDraftSource(draft);
        const Icon = source.icon;
        const title = (draft.parsed.title ?? "").trim();
        const isDeleting = deletingDraftId === draft.id;
        return (
          <li
            key={draft.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
          >
            <Icon aria-hidden className="h-5 w-5 shrink-0 text-fg-subtle" />
            <button
              type="button"
              onClick={() => onOpen(draft.id)}
              className="min-w-0 flex-1 text-left"
              aria-label={`Entwurf ${title.length > 0 ? title : "ohne Titel"} weiter bearbeiten`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-fg">
                  {title.length > 0 ? title : "Ohne Titel"}
                </span>
                <ConfidenceBadge value={draft.confidence ?? draft.parsed.confidence.overall} />
              </span>
              <span className="mt-0.5 block truncate text-xs text-fg-muted">
                {source.label} · {draft.parsed.ingredients.length} Zutaten · {draft.parsed.steps.length} Schritte ·{" "}
                {formatDate(draft.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(draft.id)}
              disabled={isDeleting}
              aria-label="Entwurf verwerfen"
              title="Entwurf verwerfen"
              className="shrink-0 rounded-md p-2 text-fg-subtle transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default PendingDraftsList;
