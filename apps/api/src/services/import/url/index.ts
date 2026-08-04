/**
 * URL import pipeline.
 *
 *   fetch (SSRF-guarded, per-redirect-hop)
 *     -> JSON-LD schema.org Recipe        (best, method "json-ld")
 *     -> microdata itemprop Recipe        (method "microdata")
 *     -> site adapter / generic selectors (method "selector")
 *     -> <meta> / <title> gap filling
 *     -> hero image download
 *     -> ParsedRecipe + confidence + sourceMeta
 *
 * The layers are always merged in that order via `mergeParsedFields` (first
 * source wins per field), so a page with JSON-LD still gains the ingredient
 * GROUP headings only its markup has. `method` reports the layer that supplied
 * the ingredients, because that is the one the user cares about.
 */
import type {
  ExtractionMethod,
  ImportSourceMeta,
  ParsedRecipe,
  ParsedRecipeConfidence,
  RecipeIngredient,
} from "@toon/shared";
import { ApiError } from "../../../lib/errors.ts";
import { type ElementNode, parseHtml } from "../html/parse.ts";
import { type ParsedFields, adoptIngredientSections, finalizeParsed, mergeParsedFields } from "../parsed.ts";
import { adaptersFor, normalizeHost } from "./adapters/index.ts";
import { type FetchHtmlOptions, fetchHtml } from "./fetch.ts";
import { findRecipeNodes, extractJsonLd } from "./jsonld.ts";
import { extractMetaFields, siteNameFromHost } from "./meta.ts";
import { findMicrodataRecipe } from "./microdata.ts";
import { downloadHeroImage, type DownloadHeroImageOptions } from "./image.ts";
import { mapSchemaRecipe, scoreStructuredFields } from "./schema-map.ts";

/** Base confidence per extraction layer — structured data is simply better. */
const METHOD_BASE_CONFIDENCE: Record<Extract<ExtractionMethod, "json-ld" | "microdata" | "selector">, number> = {
  "json-ld": 0.95,
  microdata: 0.85,
  selector: 0.7,
};

export interface ExtractFromHtmlOptions {
  /** Final page URL (after redirects). */
  url: string;
}

export interface HtmlExtraction {
  parsed: ParsedRecipe;
  method: ExtractionMethod;
  /** Which layers contributed anything, for diagnostics/tests. */
  layers: ExtractionMethod[];
  host: string;
  /** Remote hero image URL before it was (maybe) downloaded. */
  remoteImageUrl?: string;
  /** Cleaned page text kept as `rawText` so the review screen can show it. */
  rawText: string;
}

/**
 * Pure HTML -> ParsedRecipe extraction (no network). Exported separately from
 * `importFromUrl` so the whole mapping is testable against saved fixtures.
 */
export function extractRecipeFromHtml(html: string, options: ExtractFromHtmlOptions): HtmlExtraction {
  const doc: ElementNode = parseHtml(html);
  const host = safeHost(options.url);
  const sourceName = siteNameFromHost(host);
  const context = { url: options.url, host };

  const layers: ExtractionMethod[] = [];
  let fields: ParsedFields = {};
  let ingredientMethod: ExtractionMethod | undefined;
  let bestBase = 0;
  /** Ingredients of a layer we did NOT use, kept only for their group headings. */
  let sectionDonor: readonly RecipeIngredient[] | undefined;

  const consider = (candidate: ParsedFields, method: ExtractionMethod, base: number): void => {
    const contributes = Object.values(candidate).some(
      (value) => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0),
    );
    if (!contributes) return;
    layers.push(method);
    const hadIngredients = (fields.ingredients?.length ?? 0) > 0;
    if (
      hadIngredients &&
      sectionDonor === undefined &&
      (candidate.ingredients ?? []).some((ingredient) => typeof ingredient.section === "string")
    ) {
      sectionDonor = candidate.ingredients;
    }
    fields = mergeParsedFields(fields, candidate);
    if (!hadIngredients && (fields.ingredients?.length ?? 0) > 0) {
      ingredientMethod = method;
      bestBase = base;
    }
  };

  // 1. JSON-LD
  const jsonLdNodes = findRecipeNodes(extractJsonLd(doc));
  for (const node of jsonLdNodes.slice(0, 3)) {
    consider(mapSchemaRecipe(node, { baseUrl: options.url, sourceName }), "json-ld", METHOD_BASE_CONFIDENCE["json-ld"]);
    if ((fields.ingredients?.length ?? 0) > 0 && (fields.steps?.length ?? 0) > 0) break;
  }

  // 2. microdata
  const microdataNode = findMicrodataRecipe(doc);
  if (microdataNode) {
    consider(
      mapSchemaRecipe(microdataNode, { baseUrl: options.url, sourceName }),
      "microdata",
      METHOD_BASE_CONFIDENCE.microdata,
    );
  }

  // 3. site adapters (last resort AND gap filler)
  for (const adapter of adaptersFor(host, doc)) {
    let candidate: ParsedFields = {};
    try {
      candidate = adapter.extract(doc, context);
    } catch {
      // An adapter must never break an import.
      continue;
    }
    consider(candidate, "selector", METHOD_BASE_CONFIDENCE.selector);
    if ((fields.ingredients?.length ?? 0) > 0 && (fields.steps?.length ?? 0) > 0) break;
  }

  // 4. head metadata — title/description/image/language only
  consider(extractMetaFields(doc, context), "selector", METHOD_BASE_CONFIDENCE.selector);

  // JSON-LD flattens ingredient groups away; adopt them from the markup parse.
  if (sectionDonor !== undefined && fields.ingredients !== undefined) {
    adoptIngredientSections(fields.ingredients, sectionDonor);
  }

  fields.sourceUrl = options.url;
  if (fields.sourceName === undefined || fields.sourceName.length === 0) fields.sourceName = sourceName;
  if (fields.language === undefined) fields.language = "de";

  const method = ingredientMethod ?? layers[0] ?? "selector";
  const base = bestBase > 0 ? bestBase : METHOD_BASE_CONFIDENCE.selector;
  const confidence = scoreStructuredFields(fields, base);

  const remoteImageUrl = fields.imageUrl;
  const extraction: HtmlExtraction = {
    parsed: finalizeParsed(fields, confidence),
    method,
    layers: [...new Set(layers)],
    host,
    rawText: buildRawText(fields),
  };
  if (remoteImageUrl !== undefined) extraction.remoteImageUrl = remoteImageUrl;
  return extraction;
}

/**
 * A readable plain-text rendering of what was extracted. Stored as the draft's
 * `rawText` so the review screen can show "source" next to the parsed fields
 * for URL imports too (for OCR imports it is the real OCR dump).
 */
function buildRawText(fields: ParsedFields): string {
  const parts: string[] = [];
  if (fields.title) parts.push(fields.title);
  if (fields.description) parts.push(fields.description);
  if ((fields.ingredients?.length ?? 0) > 0) {
    parts.push("Zutaten:");
    let section: string | null | undefined;
    for (const ingredient of fields.ingredients ?? []) {
      if (ingredient.section !== section) {
        section = ingredient.section;
        if (section) parts.push(`${section}:`);
      }
      parts.push(ingredient.raw);
    }
  }
  if ((fields.steps?.length ?? 0) > 0) {
    parts.push("Zubereitung:");
    let section: string | null | undefined;
    for (const [index, step] of (fields.steps ?? []).entries()) {
      if (step.section !== section) {
        section = step.section;
        if (section) parts.push(`${section}:`);
      }
      parts.push(`${index + 1}. ${step.text}`);
    }
  }
  if (fields.notes) parts.push(fields.notes);
  return parts.join("\n").slice(0, 100_000);
}

function safeHost(url: string): string {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

export interface ImportFromUrlOptions extends FetchHtmlOptions {
  /** Set to false to keep the remote image URL instead of downloading it. */
  downloadImage?: boolean;
  imageOptions?: DownloadHeroImageOptions;
}

export interface UrlImportResult {
  parsed: ParsedRecipe;
  confidence: ParsedRecipeConfidence;
  rawText: string;
  sourceMeta: ImportSourceMeta;
  /** Final URL after redirects. */
  sourceUrl: string;
}

/**
 * Fetches a recipe page and returns everything the draft row needs.
 *
 * @throws ApiError 400 `fetch_failed` (network/SSRF/non-HTML),
 *   422 `parse_failed` when the page yields neither ingredients nor steps.
 */
export async function importFromUrl(rawUrl: string, options: ImportFromUrlOptions = {}): Promise<UrlImportResult> {
  const startedAt = Date.now();
  const fetched = await fetchHtml(rawUrl, options);
  const extraction = extractRecipeFromHtml(fetched.html, { url: fetched.url });

  const parsed = extraction.parsed;
  if (parsed.ingredients.length === 0 && parsed.steps.length === 0) {
    throw new ApiError(
      422,
      "parse_failed",
      "Auf dieser Seite wurde kein Rezept gefunden. Bitte den direkten Link zum Rezept verwenden oder ein Foto hochladen.",
      { host: extraction.host, layers: extraction.layers },
    );
  }

  // Store the hero image locally so the recipe keeps working if the site changes.
  if (options.downloadImage !== false && extraction.remoteImageUrl !== undefined) {
    const stored = await downloadHeroImage(extraction.remoteImageUrl, {
      refererUrl: fetched.url,
      ...(options.resolve === undefined ? {} : { resolve: options.resolve }),
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.imageOptions ?? {}),
    });
    if (stored) parsed.imageUrl = stored.url;
  }

  const sourceMeta: ImportSourceMeta = {
    method: extraction.method,
    host: extraction.host.slice(0, 200),
    durationMs: Date.now() - startedAt,
  };

  return {
    parsed,
    confidence: parsed.confidence,
    rawText: extraction.rawText,
    sourceMeta,
    sourceUrl: fetched.url,
  };
}
