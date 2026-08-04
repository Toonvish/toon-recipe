/**
 * PDF text acquisition, in the order the brief demands:
 *
 *   1. TEXT LAYER first (`unpdf`). Digital PDFs (Thermomix exports, blog
 *      print-views, publisher PDFs) carry perfect text — OCR would only make it
 *      worse, so we never rasterize when a usable layer exists.
 *   2. If the layer is missing or too sparse (scanned page → the layer holds
 *      only a header or nothing at all), RASTERIZE with `pdf-to-img` and OCR the
 *      pages.
 *   3. If rasterization is unavailable at runtime (the @napi-rs/canvas native
 *      binary is missing on this platform), fail with 422 `pdf_no_text_layer`
 *      and an actionable German message.
 *
 * Hard cap: 10 pages. A cookbook chapter dump would otherwise burn minutes of
 * OCR for a single recipe.
 */
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";
import { preprocessImage } from "./preprocess.ts";
import type { OcrEngine, OcrOptions, OcrResult } from "./types.ts";

export const MAX_PDF_PAGES = 10;
/** Below this many characters the "text layer" is scanner noise, not content. */
export const MIN_TEXT_LAYER_CHARS = 200;
/** …and it must contain at least this many alphanumeric words. */
export const MIN_TEXT_LAYER_WORDS = 20;
/** Rasterization scale: 2.0 ≈ 144 dpi for an A4 page, enough for Tesseract. */
export const RASTER_SCALE = 2;

export const PDF_NO_TEXT_LAYER_MESSAGE =
  "Das PDF enthält keinen Text — bitte ein Foto der Seite hochladen.";

export interface PdfTextLayer {
  /** Page texts, index 0 = page 1. */
  pages: string[];
  /** Pages in the document (may exceed `pages.length` because of the cap). */
  totalPages: number;
  text: string;
}

/** True when the extracted text is rich enough to skip OCR entirely. */
export function isUsableTextLayer(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < MIN_TEXT_LAYER_CHARS) return false;
  const words = trimmed.split(" ").filter((word) => /[\p{L}\p{N}]{2,}/u.test(word));
  return words.length >= MIN_TEXT_LAYER_WORDS;
}

/**
 * Extracts the embedded text layer.
 * @returns the layer, or undefined when the PDF cannot be opened at all.
 */
export async function extractPdfTextLayer(bytes: Uint8Array): Promise<PdfTextLayer | undefined> {
  return await withPdfjsLock(async () => {
    try {
      const { extractText } = await import("unpdf");
      // A fresh copy: pdf.js transfers/detaches the buffer it is handed.
      const result = await extractText(new Uint8Array(bytes), { mergePages: false });
      const pages = (Array.isArray(result.text) ? result.text : [String(result.text)])
        .slice(0, MAX_PDF_PAGES)
        .map((page) => normalizePdfText(page));
      return { pages, totalPages: result.totalPages, text: pages.join("\n\n").trim() };
    } catch (error) {
      // Expected for scanned/broken PDFs — the caller falls back to rasterizing.
      if (!env.isTest) {
        console.warn("[import] PDF text layer extraction failed:", error instanceof Error ? error.message : error);
      }
      return undefined;
    }
  });
}

/* ------------------------- the two pdf.js problem ------------------------- */

/**
 * TWO INCOMPATIBLE pdf.js COPIES LIVE IN THIS PROCESS:
 *   - `unpdf` bundles pdf.js 6.x and installs `globalThis.pdfjsWorker`/`pdfjsLib`
 *     as a side effect of the first `extractText()` call;
 *   - `pdf-to-img` uses `pdfjs-dist` 5.x, which VERSION-CHECKS that very global
 *     and throws `The API version "5.x" does not match the Worker version "6.x"`.
 *
 * Because the text-layer probe always runs first, the rasterize+OCR fallback for
 * scanned PDFs used to be dead: every such upload answered 422
 * `pdf_no_text_layer` / `rasterization_unavailable`. So rasterization runs with
 * those globals temporarily removed, and both phases are serialized through one
 * lock so a concurrent import can never observe the swapped state.
 */
const PDFJS_GLOBAL_KEYS = ["pdfjsWorker", "pdfjsLib"] as const;

let pdfjsLock: Promise<unknown> = Promise.resolve();

/** Serializes everything that touches a pdf.js global. */
function withPdfjsLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = pdfjsLock.then(operation, operation);
  pdfjsLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Runs `operation` with unpdf's pdf.js globals stashed away and then restored. */
async function withoutPdfjsGlobals<T>(operation: () => Promise<T>): Promise<T> {
  const scope = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<string, unknown>();
  for (const key of PDFJS_GLOBAL_KEYS) {
    if (key in scope) {
      saved.set(key, scope[key]);
      delete scope[key];
    }
  }
  try {
    return await operation();
  } finally {
    for (const [key, value] of saved) scope[key] = value;
  }
}

/**
 * pdf.js emits one text item per glyph run, so the naive join produces
 * "Z u t a t e n" style artefacts and lost line breaks. Repair the worst of it.
 */
export function normalizePdfText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\u00ad/g, "")
    // hyphenation across line breaks: "Kar-\ntoffeln" -> "Kartoffeln"
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface RasterizedPage {
  pageNumber: number;
  /** PNG bytes. */
  bytes: Uint8Array;
}

/**
 * Renders PDF pages to PNG.
 *
 * @throws ApiError 422 `pdf_no_text_layer` when the rasterizer (or its native
 *   canvas binary) is unavailable — that is the documented fallback contract.
 */
export async function rasterizePdf(bytes: Uint8Array, maxPages = MAX_PDF_PAGES): Promise<RasterizedPage[]> {
  return await withPdfjsLock(async () =>
    // See withoutPdfjsGlobals: unpdf's pdf.js 6 globals make pdfjs-dist 5 refuse
    // to start, which used to kill this whole fallback path.
    withoutPdfjsGlobals(async () => {
      let pdf: typeof import("pdf-to-img").pdf;
      try {
        // Dynamic import on purpose: bun's isolated install layout only exposes
        // @napi-rs/canvas to pdf-to-img, and a missing native binary must surface
        // here as the documented 422 rather than as a module-load crash.
        ({ pdf } = await import("pdf-to-img"));
      } catch (error) {
        throw noTextLayerError(error);
      }

      try {
        const document = await pdf(new Uint8Array(bytes), { scale: RASTER_SCALE });
        const pageCount = Math.min(document.length, maxPages);
        const out: RasterizedPage[] = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          out.push({ pageNumber, bytes: new Uint8Array(page) });
        }
        await document.destroy().catch(() => undefined);
        if (out.length === 0) throw new Error("rasterizer produced no pages");
        return out;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw noTextLayerError(error);
      }
    }),
  );
}

function noTextLayerError(error: unknown): ApiError {
  return new ApiError(422, "pdf_no_text_layer", PDF_NO_TEXT_LAYER_MESSAGE, {
    reason: "rasterization_unavailable",
    cause: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
  });
}

export interface PdfTextResult {
  text: string;
  /** How the text was obtained. */
  method: "pdf-text" | "ocr";
  /** Pages actually processed. */
  pages: number;
  /** Pages in the document. */
  totalPages: number;
  /** 0..1; 1 for a text layer (it is exact), engine confidence for OCR. */
  confidence: number;
  engine?: string;
  langs?: string;
}

export interface PdfToTextOptions extends OcrOptions {
  maxPages?: number;
  /** Set false to force OCR (used by tests). */
  useTextLayer?: boolean;
}

/**
 * Turns a PDF into text: layer first, OCR fallback, 422 when neither works.
 *
 * @throws ApiError 422 `pdf_no_text_layer` when there is no usable text layer
 *   AND rasterization is unavailable.
 */
export async function pdfToText(
  bytes: Uint8Array,
  engine: OcrEngine,
  options: PdfToTextOptions = {},
): Promise<PdfTextResult> {
  const maxPages = options.maxPages ?? MAX_PDF_PAGES;

  const layer = options.useTextLayer === false ? undefined : await extractPdfTextLayer(bytes);
  if (layer !== undefined && isUsableTextLayer(layer.text)) {
    return {
      text: layer.text,
      method: "pdf-text",
      pages: layer.pages.length,
      totalPages: layer.totalPages,
      confidence: 1,
    };
  }

  const rasterized = await rasterizePdf(bytes, maxPages);
  const texts: string[] = [];
  let confidenceSum = 0;
  let engineName: string | undefined;
  let langs: string | undefined;

  for (const page of rasterized) {
    options.signal?.throwIfAborted();
    const prepared = await preprocessImage(page.bytes);
    const result: OcrResult = await engine.recognize(prepared.bytes, {
      ...(options.langs === undefined ? {} : { langs: options.langs }),
      layout: options.layout ?? "page",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    texts.push(result.text.trim());
    confidenceSum += result.confidence;
    engineName = result.engine;
    langs = result.langs;
  }

  const text = texts.filter((part) => part.length > 0).join("\n\n").trim();
  if (text.length === 0) {
    throw new ApiError(422, "pdf_no_text_layer", PDF_NO_TEXT_LAYER_MESSAGE, { reason: "ocr_empty" });
  }

  return {
    text,
    method: "ocr",
    pages: rasterized.length,
    totalPages: layer?.totalPages ?? rasterized.length,
    confidence: rasterized.length > 0 ? confidenceSum / rasterized.length : 0,
    ...(engineName === undefined ? {} : { engine: engineName }),
    ...(langs === undefined ? {} : { langs }),
  };
}
