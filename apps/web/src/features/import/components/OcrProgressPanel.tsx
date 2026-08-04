/**
 * The "OCR läuft…" state. Server-side tesseract cannot be interrupted, so this
 * panel explains the wait honestly, shows elapsed seconds and disables nothing
 * but the abort affordance.
 */
import { useEffect, useState } from "react";
import clsx from "clsx";
import { LoaderCircle, ScanText, WandSparkles } from "lucide-react";

export type ImportPhase = "idle" | "preparing" | "uploading" | "processing" | "done" | "error";

export interface OcrProgressPanelProps {
  phase: ImportPhase;
  /** What is being processed, e.g. "2 Fotos" or "rezept.pdf". */
  subject?: string;
  /** "ocr" for photos/scans, "text" for a PDF text layer, "url" for web imports. */
  mode?: "ocr" | "text" | "url";
  className?: string;
}

const MESSAGES: Record<"ocr" | "text" | "url", { title: string; body: string }> = {
  ocr: {
    title: "Texterkennung läuft…",
    body:
      "Der Server liest die Schrift aus dem Bild (Deutsch + Englisch). Das dauert je nach Bildgröße bis zu einer Minute und kann nicht abgebrochen werden. Du kannst das Fenster offen lassen – schließe es bitte nicht.",
  },
  text: {
    title: "PDF wird gelesen…",
    body:
      "Zuerst wird die Textebene des PDFs ausgelesen. Fehlt sie, werden die Seiten in Bilder umgewandelt und per Texterkennung gelesen – das dauert dann bis zu einer Minute.",
  },
  url: {
    title: "Seite wird geladen…",
    body: "Die Seite wird abgerufen und nach Rezeptdaten durchsucht. Das dauert meist nur wenige Sekunden.",
  },
};

export function OcrProgressPanel({ phase, subject, mode = "ocr", className }: OcrProgressPanelProps) {
  const [seconds, setSeconds] = useState(0);
  const active = phase === "processing" || phase === "uploading" || phase === "preparing";

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const copy = MESSAGES[mode];
  const heading =
    phase === "preparing"
      ? "Foto wird vorbereitet…"
      : phase === "uploading"
        ? "Datei wird übertragen…"
        : copy.title;

  return (
    <div
      className={clsx(
        "flex gap-3 rounded-xl border border-line bg-surface-2 p-4",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mt-0.5 shrink-0">
        {phase === "processing" ? (
          <ScanText aria-hidden className="h-5 w-5 animate-pulse text-brand" />
        ) : phase === "preparing" ? (
          <WandSparkles aria-hidden className="h-5 w-5 text-brand" />
        ) : (
          <LoaderCircle aria-hidden className="h-5 w-5 animate-spin text-brand" />
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-fg">
          {heading}
          {seconds >= 3 ? <span className="ml-2 tabular-nums text-fg-muted">{seconds}s</span> : null}
        </p>
        {subject !== undefined ? (
          <p className="truncate text-xs text-fg-muted">{subject}</p>
        ) : null}
        {phase === "processing" ? (
          <p className="text-xs leading-5 text-fg-muted">{copy.body}</p>
        ) : null}
        {phase === "processing" && seconds > 60 ? (
          <p className="text-xs leading-5 text-warning">
            Das dauert länger als üblich. Bitte noch etwas Geduld – abbrechen würde die Erkennung nicht beschleunigen.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default OcrProgressPanel;
