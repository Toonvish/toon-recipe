/**
 * Debounced autosave for the draft review screen.
 *
 * A phone interruption (call, app switch, tab discard) must never lose OCR
 * corrections, so besides the ~1s debounce we force a save when the page goes
 * to the background (`visibilitychange` / `pagehide`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedRecipe } from "@toon/shared";
import { useUnsavedWork } from "@/lib/unsavedWork";
import { isSameParsedRecipe, normalizeParsedRecipe } from "./draftEdit";
import { describeError } from "./importApi";
import { useSaveDraft } from "./queries";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveResult {
  state: SaveState;
  /** German label for the indicator next to the title. */
  label: string;
  errorHint?: string;
  lastSavedAt?: Date;
  /** Save immediately (used by "Speichern" and by retry). */
  saveNow: () => Promise<boolean>;
}

export interface AutosaveOptions {
  groupId: string | undefined;
  draftId: string | undefined;
  value: ParsedRecipe | undefined;
  /** Server state to compare against; pass the freshly loaded draft's parsed. */
  baseline: ParsedRecipe | undefined;
  enabled?: boolean;
  delayMs?: number;
}

export function useDraftAutosave(options: AutosaveOptions): AutosaveResult {
  const { groupId, draftId, value, baseline, enabled = true, delayMs = 1000 } = options;
  const save = useSaveDraft();
  // useMutation returns a fresh object every render; keeping it in a ref stops the
  // debounce timer from being reset by unrelated re-renders.
  const saveRef = useRef(save);
  saveRef.current = save;
  const [state, setState] = useState<SaveState>("idle");
  const [errorHint, setErrorHint] = useState<string | undefined>(undefined);
  const [lastSavedAt, setLastSavedAt] = useState<Date | undefined>(undefined);

  const savedRef = useRef<ParsedRecipe | undefined>(baseline);
  const valueRef = useRef<ParsedRecipe | undefined>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlightRef = useRef<Promise<boolean> | undefined>(undefined);

  valueRef.current = value;

  // A fresh server payload becomes the new baseline (e.g. after a refetch).
  useEffect(() => {
    if (baseline !== undefined && savedRef.current === undefined) savedRef.current = baseline;
  }, [baseline]);

  const runSave = useCallback(async (): Promise<boolean> => {
    const current = valueRef.current;
    if (groupId === undefined || draftId === undefined || current === undefined) return false;
    const normalized = normalizeParsedRecipe(current);
    const previous = savedRef.current;
    if (previous !== undefined && isSameParsedRecipe(normalized, normalizeParsedRecipe(previous))) {
      setState((old) => (old === "error" ? "error" : old === "idle" ? "idle" : "saved"));
      return true;
    }
    if (inFlightRef.current !== undefined) return inFlightRef.current;

    setState("saving");
    setErrorHint(undefined);
    const promise = (async () => {
      try {
        const draft = await saveRef.current.mutateAsync({ groupId, draftId, parsed: normalized });
        savedRef.current = draft.parsed ?? normalized;
        setLastSavedAt(new Date());
        setState("saved");
        return true;
      } catch (error) {
        setErrorHint(describeError(error).hint);
        setState("error");
        return false;
      } finally {
        inFlightRef.current = undefined;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [draftId, groupId]);

  // debounce
  useEffect(() => {
    if (!enabled || value === undefined || groupId === undefined || draftId === undefined) return;
    const previous = savedRef.current;
    if (previous !== undefined && isSameParsedRecipe(normalizeParsedRecipe(value), normalizeParsedRecipe(previous))) {
      return;
    }
    setState((old) => (old === "saving" ? old : "dirty"));
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSave();
    }, delayMs);
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    };
  }, [value, enabled, delayMs, groupId, draftId, runSave]);

  // flush when the app goes to the background
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (document.visibilityState === "hidden") void runSave();
    };
    const onPageHide = () => {
      void runSave();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, runSave]);

  // An app update reloads the document, which would drop edits the debounce has not
  // flushed yet (and a failed save has nowhere else to live). Registering the state here
  // means the update waits and the UpdateBanner asks instead — see lib/pwa.ts.
  useUnsavedWork(state === "dirty" || state === "saving" || state === "error");

  const label =
    state === "saving"
      ? "Speichert…"
      : state === "dirty"
        ? "Änderungen noch nicht gespeichert"
        : state === "saved"
          ? lastSavedAt === undefined
            ? "Gespeichert"
            : `Gespeichert um ${lastSavedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
          : state === "error"
            ? "Speichern fehlgeschlagen"
            : "Automatisch gespeichert";

  return { state, label, errorHint, lastSavedAt, saveNow: runSave };
}
