/**
 * @toon/shared — the single source of truth for the toon-recipe API contract.
 *
 * Contains ONLY pure code: Zod schemas, inferred types and parsers.
 * Never import node/bun APIs here — the web bundle imports this module too.
 */

// --- contract: schemas + types ---------------------------------------------
export * from "./schemas/common.ts";
export * from "./schemas/user.ts";
export * from "./schemas/auth.ts";
export * from "./schemas/group.ts";
export * from "./schemas/recipe.ts";
export * from "./schemas/import.ts";
export * from "./schemas/shopping.ts";
export * from "./schemas/card.ts";

// --- pure parsers / helpers -------------------------------------------------
export * from "./numbers.ts";
export * from "./text.ts";
export * from "./units.ts";
export * from "./ingredients.ts";
export * from "./duration.ts";
export * from "./shopping.ts";
export * from "./barcode.ts";
export * from "./qr.ts";

// --- interface language: the i18n runtime + server catalogs ----------------
export * from "./i18n/index.ts";
