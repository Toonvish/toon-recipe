/**
 * The single place the rest of the API gets an `OcrEngine` from.
 *
 * `getOcrEngine()` returns the process-wide TesseractEngine; `setOcrEngine()`
 * replaces it, which is how tests inject a fake engine and never run real
 * Tesseract. `shutdownOcr()` is now a formality — the native engine holds no
 * worker between calls — but it stays on the interface so an engine that DOES own
 * a handle (a sidecar, a cloud client with a keep-alive pool) can be dropped in
 * without changing any caller.
 */
import { env } from "../../env.ts";
import { ApiError, type ErrorText } from "../../lib/errors.ts";
import { preprocessImage } from "./preprocess.ts";
import { TesseractEngine } from "./tesseract.ts";
import type { OcrEngine, OcrOptions, OcrResult } from "./types.ts";

export type { OcrBlock, OcrEngine, OcrOptions, OcrResult } from "./types.ts";
export { TesseractEngine, normalizeLangs } from "./tesseract.ts";
export { preprocessImage, TARGET_WIDTH } from "./preprocess.ts";

let engine: OcrEngine | null = null;
/** True while a test-provided engine is installed. */
let overridden = false;

/** The shared OCR engine, created on first use. */
export function getOcrEngine(): OcrEngine {
  engine ??= new TesseractEngine(env.TESSERACT_LANGS);
  return engine;
}

/**
 * Replaces the shared engine (tests, or a future alternative backend).
 * Pass `null` to restore the default Tesseract engine.
 */
export function setOcrEngine(next: OcrEngine | null): void {
  engine = next;
  overridden = next !== null;
}

/** True when a non-default engine is installed (used by diagnostics/tests). */
export function isOcrEngineOverridden(): boolean {
  return overridden;
}

/** Terminates the shared engine. Safe to call repeatedly. */
export async function shutdownOcr(): Promise<void> {
  const current = engine;
  engine = null;
  overridden = false;
  if (current) await current.shutdown();
}

/** Default hard limit for a single OCR operation. */
export const OCR_TIMEOUT_MS = 60_000;

/**
 * Runs `operation` with a hard timeout that is REALLY hard.
 *
 * The signal is only PARTLY honoured downstream, so this must stay a
 * `Promise.race`. The native OCR engine does respect it (aborting kills the
 * `tesseract` child), but `unpdf`'s extractText still ignores it entirely — and
 * awaiting the operation while merely relabelling its rejection meant a stuck
 * extraction held the request open forever, however loudly the constant was named
 * OCR_TIMEOUT_MS. So: the client always gets an answer at `timeoutMs`, and the
 * abandoned work is still aborted (best effort) so it stops burning CPU.
 *
 * @throws ApiError 504 `ocr_failed` when the budget is exhausted.
 */
export async function withOcrTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = OCR_TIMEOUT_MS,
  message: ErrorText = "server.ocr.recognitionTimedOut",
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("ocr_timeout"));
      reject(new ApiError(504, "ocr_failed", message, { timeoutMs }));
    }, timeoutMs);
  });

  const work = (async () => operation(controller.signal))();
  // Nothing may await `work` after the race is lost, or bun reports an unhandled
  // rejection when the abandoned operation eventually fails.
  work.catch(() => undefined);

  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (timedOut && !(error instanceof ApiError)) {
      throw new ApiError(504, "ocr_failed", message, { timeoutMs });
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/* --------------------------- concurrency gate ----------------------------- */

/**
 * How many OCR/PDF pipelines may run at the same time, process-wide.
 *
 * Each one holds up to 15 MB of image bytes, runs sharp, and spawns a `tesseract`
 * process; a handful of parallel uploads is enough to make a self-hosted box
 * unusable. Requests that arrive while the gate is full are REJECTED (429), not
 * queued — a queue would just move the timeout to a place where the user cannot
 * see it. The per-user `IMPORT_RULE` rate limit is the first line of defence; this
 * is the backstop against several users at once.
 *
 * SINCE THE ENGINE WENT NATIVE THIS IS THE ONLY BOUND ON OCR CONCURRENCY. The
 * tesseract.js engine also serialized internally, because one WASM worker cannot
 * run two recognitions at once; separate processes can, so this number is now
 * directly the peak number of concurrent tesseract processes — i.e. the app's
 * memory ceiling. Raise it only with a measurement.
 */
export const MAX_CONCURRENT_OCR = 2;

let inFlightOcr = 0;

/** For diagnostics/tests: pipelines currently holding a slot. */
export function ocrInFlight(): number {
  return inFlightOcr;
}

/**
 * Runs `operation` while holding one of {@link MAX_CONCURRENT_OCR} slots.
 *
 * @throws ApiError 429 `rate_limited` when every slot is taken.
 */
export async function withOcrSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (inFlightOcr >= MAX_CONCURRENT_OCR) {
    throw new ApiError(429, "rate_limited", "server.ocr.tooManyConcurrentRecognitions", {
      maxConcurrent: MAX_CONCURRENT_OCR,
    });
  }
  inFlightOcr += 1;
  try {
    return await operation();
  } finally {
    inFlightOcr -= 1;
  }
}

/** Convenience: preprocess + recognise in one call. */
export async function recognizeImage(
  bytes: Uint8Array,
  options: OcrOptions = {},
  ocrEngine: OcrEngine = getOcrEngine(),
): Promise<OcrResult> {
  const prepared = await preprocessImage(bytes);
  return await ocrEngine.recognize(prepared.bytes, options);
}
