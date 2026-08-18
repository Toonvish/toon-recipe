/**
 * The web app's catalog registry: every UI namespace, merged, for both
 * locales. FINAL — a port agent extends its own two namespace files, never
 * this one (docs/i18n.md §1/§9). Namespace prefixes are disjoint by
 * construction (`NamespaceCatalog<Prefix>`), so this merge is order-independent
 * — a runtime test in `i18n.test.ts` asserts that anyway.
 */
import { authDe } from "./auth.de.ts";
import { authEn } from "./auth.en.ts";
import { cardsDe } from "./cards.de.ts";
import { cardsEn } from "./cards.en.ts";
import { groupsDe } from "./groups.de.ts";
import { groupsEn } from "./groups.en.ts";
import { importDe } from "./import.de.ts";
import { importEn } from "./import.en.ts";
import { recipesDe } from "./recipes.de.ts";
import { recipesEn } from "./recipes.en.ts";
import { shoppingDe } from "./shopping.de.ts";
import { shoppingEn } from "./shopping.en.ts";
import { uiDe } from "./ui.de.ts";
import { uiEn } from "./ui.en.ts";

const de = { ...authDe, ...recipesDe, ...importDe, ...shoppingDe, ...cardsDe, ...groupsDe, ...uiDe };
const en = { ...authEn, ...recipesEn, ...importEn, ...shoppingEn, ...cardsEn, ...groupsEn, ...uiEn };

export const CATALOGS = { de, en } as const;
export type MessageKey = keyof typeof de;
