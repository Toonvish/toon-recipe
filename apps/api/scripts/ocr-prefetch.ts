#!/usr/bin/env bun
/**
 * `bun run ocr:prefetch` — warms the Tesseract language cache ONCE, at deploy
 * time, so the first photo/scanned-PDF import does not have to download ~15 MB of
 * `deu+eng` traineddata while a user waits (and does not fail outright on a host
 * without outbound HTTPS).
 *
 * It runs a real recognition on a generated image, because tesseract.js only
 * fetches and caches the language data when a worker actually initialises.
 *
 * Needs outbound HTTPS to tessdata.projectnaptha.com exactly once. Afterwards
 * `data/tessdata/*.traineddata` can be copied to an air-gapped machine.
 */
import { readdirSync } from "node:fs";
import { env } from "../src/env.ts";
import { LANG_CACHE_DIR, TesseractEngine } from "../src/services/ocr/tesseract.ts";
import { preprocessImage } from "../src/services/ocr/preprocess.ts";

/** A tiny PNG with a bit of text-like contrast; the content does not matter. */
async function sampleImage(): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
    <rect width="600" height="200" fill="white"/>
    <text x="20" y="120" font-family="sans-serif" font-size="64" fill="black">Zutaten 250 g</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Uint8Array(buffer);
}

function listCache(): string[] {
  try {
    return readdirSync(LANG_CACHE_DIR).sort();
  } catch {
    return [];
  }
}

const engine = new TesseractEngine(env.TESSERACT_LANGS);
console.log(`[ocr:prefetch] Sprachen: ${env.TESSERACT_LANGS}`);
console.log(`[ocr:prefetch] Cache-Verzeichnis: ${LANG_CACHE_DIR}`);

const startedAt = Date.now();
try {
  const prepared = await preprocessImage(await sampleImage());
  const result = await engine.recognize(prepared.bytes, { layout: "page" });
  console.log(
    `[ocr:prefetch] OK in ${((Date.now() - startedAt) / 1000).toFixed(1)} s — erkannt: ${JSON.stringify(
      result.text.trim().slice(0, 60),
    )}`,
  );
} catch (error) {
  console.error(
    "[ocr:prefetch] FEHLGESCHLAGEN:",
    error instanceof Error ? error.message : error,
    "\n[ocr:prefetch] Braucht beim ersten Lauf ausgehendes HTTPS zu tessdata.projectnaptha.com.",
  );
  await engine.shutdown();
  process.exit(1);
}

const files = listCache();
if (files.length === 0) {
  console.warn(
    `[ocr:prefetch] WARNUNG: in ${LANG_CACHE_DIR} liegt nichts — der Cache ist nicht schreibbar, jeder Neustart lädt erneut.`,
  );
} else {
  console.log(`[ocr:prefetch] Zwischengespeichert: ${files.join(", ")}`);
}

await engine.shutdown();
