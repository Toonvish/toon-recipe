/**
 * REGRESSION TEST — the ONLY import test that uses the REAL rasterizer.
 *
 * Background: `unpdf` (text layer) bundles pdf.js 6 and installs
 * `globalThis.pdfjsWorker`; `pdf-to-img` uses pdfjs-dist 5 and refuses to start
 * when it sees that global ("The API version 5.x does not match the Worker
 * version 6.x"). Since pdfToText() always probes the text layer first, the
 * rasterize+OCR fallback required by the brief (5c) was completely dead in the
 * real server while every other test passed, because they `mock.module`
 * "pdf-to-img" away.
 *
 * Therefore: NEVER call mock.module("pdf-to-img") in this file, and assert the
 * rendered page size so a leaked mock from another file cannot make it pass.
 */
import { describe, expect, test } from "bun:test";
import {
  RASTER_SCALE,
  extractPdfTextLayer,
  isUsableTextLayer,
  pdfToText,
  rasterizePdf,
} from "../../src/services/ocr/pdf.ts";
import { TEXTLESS_PDF_SIZE, createFakeOcrEngine, makeTextlessPdf } from "./helpers.ts";

/** Width/height of a PNG, straight out of the IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const EXPECTED = {
  width: TEXTLESS_PDF_SIZE.width * RASTER_SCALE,
  height: TEXTLESS_PDF_SIZE.height * RASTER_SCALE,
};

describe("PDF rasterization with the real pdf-to-img", () => {
  test("a PDF without a text layer yields no usable text", async () => {
    const layer = await extractPdfTextLayer(makeTextlessPdf());
    expect(layer).toBeDefined();
    expect(layer?.totalPages).toBe(1);
    expect(isUsableTextLayer(layer?.text ?? "")).toBe(false);
  });

  test("rasterizes after unpdf installed its pdf.js globals in the same process", async () => {
    const bytes = makeTextlessPdf();
    // Order matters: this is the exact sequence pdfToText() performs.
    await extractPdfTextLayer(bytes);

    const pages = await rasterizePdf(bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.pageNumber).toBe(1);
    // Real render of a 595x842 MediaBox at RASTER_SCALE — a stubbed rasterizer
    // would return some other size and fail here.
    expect(pngSize(pages[0]!.bytes)).toEqual(EXPECTED);
  });

  test("the pdf.js globals are restored so a later text extraction still works", async () => {
    const bytes = makeTextlessPdf();
    await extractPdfTextLayer(bytes);
    await rasterizePdf(bytes);

    const again = await extractPdfTextLayer(bytes);
    expect(again).toBeDefined();
    expect(again?.totalPages).toBe(1);
  });

  test("concurrent extract + rasterize do not corrupt each other", async () => {
    const bytes = makeTextlessPdf();
    const results = await Promise.all([
      rasterizePdf(bytes),
      extractPdfTextLayer(bytes),
      rasterizePdf(bytes),
      extractPdfTextLayer(bytes),
    ]);
    expect((results[0] as Awaited<ReturnType<typeof rasterizePdf>>).length).toBe(1);
    expect((results[2] as Awaited<ReturnType<typeof rasterizePdf>>).length).toBe(1);
    expect(results[1]).toBeDefined();
    expect(results[3]).toBeDefined();
  });

  test("pdfToText falls back from the empty text layer to OCR", async () => {
    const engine = createFakeOcrEngine({
      text: "Apfelkuchen\nZutaten\n300 g Mehl\n4 Eier\nZubereitung\n1. Alles verruehren.",
      confidence: 0.82,
    });

    const result = await pdfToText(makeTextlessPdf(), engine);

    expect(result.method).toBe("ocr");
    expect(result.pages).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(engine.calls).toBe(1);
    expect(result.text).toContain("Apfelkuchen");
  });
});
