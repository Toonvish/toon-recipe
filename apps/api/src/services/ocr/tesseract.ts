/**
 * tesseract.js-backed `OcrEngine`.
 *
 * PERFORMANCE NOTE (the reason this file is not five lines):
 * creating a worker costs 2-6 s because the WASM core plus every `.traineddata`
 * file (deu is ~15 MB) has to be loaded and compiled. Doing that per request is
 * unusable. So:
 *   - ONE worker is created lazily on the first recognise call and kept warm,
 *   - concurrent requests are SERIALIZED through a promise chain (a tesseract
 *     worker is single-threaded and racing it corrupts results),
 *   - a failed init is not cached, so the next request retries,
 *   - `shutdown()` terminates the worker for a graceful process exit.
 *
 * Language data is cached on disk by tesseract.js itself (cachePath), so only the
 * very first run of a fresh deployment pays the ~15 MB deu+eng download. That
 * cache silently did NOTHING until the directory was created here: tesseract.js's
 * node adapter is a bare `fs.writeFile` with no mkdir, so every write ENOENTed and
 * was swallowed, and EVERY restart re-downloaded the traineddata — fatal on an
 * air-gapped self-host. Pre-seed `data/tessdata/*.traineddata` (or run
 * `bun run ocr:prefetch`) to make the first import work offline too.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";
import type { OcrBlock, OcrEngine, OcrOptions, OcrResult } from "./types.ts";

type TesseractModule = typeof import("tesseract.js");
type TesseractWorker = Awaited<ReturnType<TesseractModule["createWorker"]>>;

/** Where the downloaded `.traineddata` files live between restarts. */
export const LANG_CACHE_DIR = join(REPO_ROOT, "data", "tessdata");

/**
 * tesseract.js writes into `cachePath` with a plain `fs.writeFile` and never
 * creates the directory, so without this every cache write fails silently.
 */
function ensureLangCacheDir(): void {
  try {
    mkdirSync(LANG_CACHE_DIR, { recursive: true });
  } catch (error) {
    // A read-only volume is survivable — it only means re-downloading.
    console.warn(
      "[ocr] could not create the language cache directory:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Page segmentation modes, keyed by our layout hint. */
const PSM_BY_LAYOUT: Record<NonNullable<OcrOptions["layout"]>, string> = {
  page: "3", // fully automatic, no OSD
  block: "6", // a single uniform block of text
  line: "7", // a single text line
  sparse: "11", // sparse text, find as much as possible
};

export class TesseractEngine implements OcrEngine {
  readonly name = "tesseract.js@7";

  private readonly langs: string;
  private worker: TesseractWorker | null = null;
  private initPromise: Promise<TesseractWorker> | null = null;
  /** Tail of the serialization chain; every job awaits the previous one. */
  private queue: Promise<unknown> = Promise.resolve();
  private currentPsm: string | null = null;
  private terminated = false;

  constructor(langs: string = env.TESSERACT_LANGS) {
    this.langs = normalizeLangs(langs);
  }

  /** Creates (or returns) the warm worker. Concurrent callers share one init. */
  private async ensureWorker(): Promise<TesseractWorker> {
    if (this.worker !== null) return this.worker;
    if (this.initPromise !== null) return await this.initPromise;

    this.initPromise = (async () => {
      ensureLangCacheDir();
      const tesseract = await loadTesseract();
      const worker = await tesseract.createWorker(this.langs, undefined, {
        cachePath: LANG_CACHE_DIR,
        // tesseract.js is chatty on stdout otherwise.
        logger: () => undefined,
        errorHandler: (error: unknown) => {
          console.error("[ocr] tesseract worker error:", error);
        },
      });
      this.worker = worker;
      this.terminated = false;
      return worker;
    })();

    try {
      return await this.initPromise;
    } catch (error) {
      // Do NOT cache a failed init — the next request should try again.
      this.initPromise = null;
      this.worker = null;
      throw new ApiError(
        422,
        "ocr_failed",
        "Die Texterkennung konnte nicht gestartet werden. Bitte später erneut versuchen.",
        { cause: error instanceof Error ? error.message : String(error), langs: this.langs },
      );
    } finally {
      if (this.worker !== null) this.initPromise = null;
    }
  }

  /**
   * Recognises text in preprocessed image bytes.
   *
   * Calls are queued, so a burst of imports runs one after another instead of
   * fighting over the single worker.
   */
  async recognize(input: Uint8Array, options: OcrOptions = {}): Promise<OcrResult> {
    if (this.terminated) throw ApiError.internal("Die Texterkennung wurde beendet.");
    const run = this.queue.then(
      () => this.recognizeNow(input, options),
      () => this.recognizeNow(input, options),
    );
    // Keep the chain alive even when this job rejects.
    this.queue = run.catch(() => undefined);
    return await run;
  }

  private async recognizeNow(input: Uint8Array, options: OcrOptions): Promise<OcrResult> {
    options.signal?.throwIfAborted();
    const worker = await this.ensureWorker();

    const psm = PSM_BY_LAYOUT[options.layout ?? "page"];
    if (psm !== this.currentPsm) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm as never,
        // Keep the column spacing of ingredient tables ("250 g   Mehl").
        preserve_interword_spaces: "1",
      });
      this.currentPsm = psm;
    }

    let page: { text: string; confidence: number; blocks: unknown };
    try {
      const result = await worker.recognize(Buffer.from(input), undefined, { text: true, blocks: true });
      page = result.data as unknown as { text: string; confidence: number; blocks: unknown };
    } catch (error) {
      throw new ApiError(422, "ocr_failed", "Die Texterkennung ist fehlgeschlagen.", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    options.signal?.throwIfAborted();

    const text = typeof page.text === "string" ? page.text : "";
    const confidence = Number.isFinite(page.confidence) ? Math.min(1, Math.max(0, page.confidence / 100)) : 0;
    const blocks = toBlocks(page.blocks);

    return {
      text,
      confidence,
      engine: this.name,
      langs: this.langs,
      ...(blocks.length > 0 ? { blocks } : {}),
    };
  }

  /** Terminates the worker. Idempotent; safe during shutdown handlers. */
  async shutdown(): Promise<void> {
    this.terminated = true;
    const worker = this.worker;
    this.worker = null;
    this.initPromise = null;
    this.currentPsm = null;
    if (worker === null) return;
    try {
      await worker.terminate();
    } catch {
      // the process is going away anyway
    }
  }
}

function toBlocks(raw: unknown): OcrBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: OcrBlock[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (text.length === 0) continue;
    const confidence = typeof record.confidence === "number" ? record.confidence : 0;
    const bbox = record.bbox as { x0?: number; y0?: number; x1?: number; y1?: number } | undefined;
    out.push({
      text,
      confidence,
      ...(bbox && typeof bbox.x0 === "number"
        ? { bbox: { x0: bbox.x0, y0: bbox.y0 ?? 0, x1: bbox.x1 ?? 0, y1: bbox.y1 ?? 0 } }
        : {}),
    });
  }
  return out;
}

/** "deu + eng", "de,en" -> "deu+eng"; guarantees a non-empty language string. */
export function normalizeLangs(raw: string | undefined): string {
  const parts = (raw ?? "")
    .split(/[+,\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
    .map((part) => LANG_ALIASES[part] ?? part);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join("+") : "deu+eng";
}

/** Two-letter codes people put in .env, mapped to tesseract's three-letter ones. */
const LANG_ALIASES: Record<string, string> = {
  de: "deu",
  german: "deu",
  en: "eng",
  english: "eng",
  fr: "fra",
  it: "ita",
  es: "spa",
  nl: "nld",
  pl: "pol",
  tr: "tur",
};

async function loadTesseract(): Promise<TesseractModule> {
  const module = (await import("tesseract.js")) as unknown as { default?: TesseractModule } & TesseractModule;
  return (module.default ?? module) as TesseractModule;
}
