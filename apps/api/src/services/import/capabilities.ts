/**
 * Which import sources this deployment offers.
 *
 * WHY THIS EXISTS. URL and text import are pure fetch-and-parse: no native
 * binaries, nothing large resident. Photo and PDF import are the opposite — they
 * need `tesseract` and `pdftoppm` installed (~120 MB of packages plus language
 * data), and while a job runs they hold `sharp`, a preprocessed bitmap and, for a
 * PDF, `unpdf`'s whole parsed document in memory. On a small VPS that is the
 * difference between comfortable and swapping, so it is opt-in: `IMPORT_OCR_ENABLED`
 * is **off unless set**.
 *
 * WHAT IT GATES. Only the three upload endpoints (`/imports/image`, `/imports/pdf`,
 * `/imports/file`), which answer **501 `ocr_disabled`** when it is off. Everything
 * else is untouched: `/imports/url`, `/imports/text`, drafts, review and commit all
 * work, and a draft created earlier by OCR stays reviewable and committable. The
 * services themselves are NOT gated — they keep their unit tests, and a route that
 * is never reached never loads sharp, unpdf or spawns tesseract.
 *
 * IT IS A CAPABILITY, NOT AN AUTHORISATION CHECK. The client is told the answer up
 * front (`features.ocrImport` on `/api/health`) so the UI can stop offering photo
 * and PDF import, but the 501 is what actually enforces it — an installed PWA can
 * be running a bundle from before the flag was flipped, and it will still POST.
 *
 * THE SEAM (`setOcrImportEnabled`) exists because `env` is validated once and
 * frozen at module load, so a test cannot flip the variable. Same discipline as
 * `setMailer` / `setOcrEngine` / `setPdfRasterizer`: `bun test` runs every file in
 * ONE process, so a file that overrides this MUST hand it back
 * (`afterAll(() => setOcrImportEnabled(null))`) or the next file inherits it.
 */
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";

/** Test override; `null` means "ask env". */
let override: boolean | null = null;

/** True when photo/PDF import is available on this deployment. */
export function isOcrImportEnabled(): boolean {
  return override ?? env.ocrImportEnabled;
}

/**
 * Forces the flag for a test. Pass `null` to restore the environment's value —
 * and do it in `afterAll`, or every later test file inherits this one's setting.
 */
export function setOcrImportEnabled(value: boolean | null): void {
  override = value;
}

/**
 * Guard for the upload endpoints. Call it FIRST in the handler — before the rate
 * limiter and before the multipart body is read — so a disabled server does not
 * accept 15 MB it is only going to throw away.
 */
export function assertOcrImportEnabled(): void {
  if (isOcrImportEnabled()) return;
  throw new ApiError(501, "ocr_disabled", "server.import.ocrDisabled");
}

/** The capability block `/api/health` reports, so the UI can hide what is off. */
export function serverFeatures(): { ocrImport: boolean } {
  return { ocrImport: isOcrImportEnabled() };
}
