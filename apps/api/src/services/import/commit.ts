/**
 * Committing a reviewed draft into a real recipe.
 *
 * TRANSACTIONAL BY DESIGN: recipe + ingredients + steps + tag links + collection
 * links are written inside ONE `db.transaction`. The collection ownership check
 * runs LAST, inside the transaction, so a request naming a foreign collection
 * leaves no half-written recipe behind — that invariant is covered by a test.
 *
 * The draft is marked `reviewed` and gets `recipe_id` in the same transaction, so
 * "draft committed" and "recipe exists" can never disagree.
 */
import {
  type Difficulty,
  type ParsedRecipe,
  type PublicUser,
  type RecipeDetail,
  type RecipeIngredientRecord,
  type RecipeStepRecord,
  type Tag,
  foldText,
} from "@toon/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  collectionRecipes,
  collections,
  importDrafts,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipes,
  tags,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { toIso } from "../../lib/http.ts";
import { normalizeStoredUploadUrl, signUploadUrl } from "../../lib/uploadUrls.ts";
import { thumbnailUrlFor } from "../media/thumbnails.ts";
import { dedupeTags } from "./parsed.ts";

export interface CommitDraftInput {
  groupId: string;
  draftId: string;
  userId: string;
  /** The reviewed payload. Overrides whatever is stored on the draft. */
  parsed: ParsedRecipe;
  /** Extra tag NAMES from the review screen, merged with `parsed.tags`. */
  tagNames?: readonly string[];
  collectionIds?: readonly string[];
}

export interface CommitDraftResult {
  recipe: RecipeDetail;
  recipeId: string;
}

/**
 * Writes the recipe and links everything up.
 *
 * @throws ApiError 422 `validation_failed` when the reviewed draft has no title
 *   or no content, 404 when a collection does not belong to the group.
 */
export async function commitDraft(db: Database, input: CommitDraftInput): Promise<CommitDraftResult> {
  const parsed = input.parsed;

  const title = (parsed.title ?? "").trim();
  if (title.length === 0) {
    throw ApiError.validationFailed([{ path: "parsed.title", message: "Titel fehlt" }], "Bitte einen Titel eingeben.");
  }
  if (parsed.ingredients.length === 0 && parsed.steps.length === 0) {
    throw ApiError.validationFailed(
      [{ path: "parsed", message: "Weder Zutaten noch Zubereitung vorhanden" }],
      "Das Rezept braucht mindestens eine Zutat oder einen Zubereitungsschritt.",
    );
  }

  const recipeId = crypto.randomUUID();
  const now = Date.now();
  const tagNames = dedupeTags([...parsed.tags, ...(input.tagNames ?? [])]);
  const collectionIds = [...new Set(input.collectionIds ?? [])];

  const ingredientRows = parsed.ingredients.map((ingredient, index) => ({
    id: crypto.randomUUID(),
    recipeId,
    position: index,
    section: ingredient.section ?? null,
    quantity: ingredient.quantity ?? null,
    quantityMax: ingredient.quantityMax ?? null,
    unit: ingredient.unit ?? null,
    name: ingredient.name,
    // Pre-folded for search; see src/db/schema.ts. A committed import that skipped
    // this would be a recipe nobody can find by its ingredients.
    nameFold: foldText(ingredient.name),
    note: ingredient.note ?? null,
    raw: ingredient.raw,
  }));

  const stepRows = parsed.steps.map((step, index) => ({
    id: crypto.randomUUID(),
    recipeId,
    position: index,
    section: step.section ?? null,
    text: step.text,
  }));

  const linkedTags = await db.transaction(async (tx) => {
    await tx.insert(recipes).values({
      id: recipeId,
      groupId: input.groupId,
      title,
      titleFold: foldText(title),
      description: parsed.description ?? null,
      descriptionFold: foldText(parsed.description ?? ""),
      // The review screen PATCHes back the signed hero-image URL it was served,
      // so reduce it to the bare `/uploads/<file>` before it becomes a column.
      imageUrl: normalizeStoredUploadUrl(parsed.imageUrl) ?? null,
      sourceUrl: parsed.sourceUrl ?? null,
      sourceName: parsed.sourceName ?? null,
      servingsAmount: parsed.servings?.amount ?? null,
      servingsUnit: parsed.servings?.unit ?? null,
      prepMinutes: parsed.prepMinutes ?? null,
      cookMinutes: parsed.cookMinutes ?? null,
      totalMinutes: parsed.totalMinutes ?? null,
      difficulty: (parsed.difficulty ?? null) as Difficulty | null,
      rating: null,
      notes: parsed.notes ?? null,
      language: parsed.language ?? "de",
      createdBy: input.userId,
      createdAt: now,
      updatedAt: now,
    });

    if (ingredientRows.length > 0) await tx.insert(recipeIngredients).values(ingredientRows);
    if (stepRows.length > 0) await tx.insert(recipeSteps).values(stepRows);

    const resolved = await resolveTags(tx, input.groupId, tagNames, now);
    if (resolved.length > 0) {
      await tx.insert(recipeTags).values(resolved.map((tag) => ({ recipeId, tagId: tag.id })));
    }

    // LAST, and inside the transaction: a foreign collection id must roll the
    // whole recipe back rather than leave an orphan.
    if (collectionIds.length > 0) {
      const owned = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.groupId, input.groupId), inArray(collections.id, collectionIds)));
      const ownedIds = new Set(owned.map((row) => row.id));
      const unknown = collectionIds.filter((id) => !ownedIds.has(id));
      if (unknown.length > 0) {
        throw ApiError.notFound(
          unknown.length === 1
            ? "Die gewählte Sammlung existiert nicht in dieser Gruppe."
            : "Mindestens eine der gewählten Sammlungen existiert nicht in dieser Gruppe.",
        );
      }
      await tx.insert(collectionRecipes).values(
        collectionIds.map((collectionId, index) => ({
          collectionId,
          recipeId,
          position: index,
          addedAt: now,
        })),
      );
    }

    await tx
      .update(importDrafts)
      .set({ status: "reviewed", recipeId, parsed, confidence: parsed.confidence.overall, updatedAt: now })
      .where(and(eq(importDrafts.id, input.draftId), eq(importDrafts.groupId, input.groupId)));

    return resolved;
  });

  const recipe = await loadRecipeDetail(db, {
    recipeId,
    groupId: input.groupId,
    userId: input.userId,
    createdAt: now,
    title,
    parsed,
    ingredientRows,
    stepRows,
    tagList: linkedTags,
    collectionIds,
  });

  return { recipe, recipeId };
}

/**
 * Finds existing group tags by case-insensitive name and creates the missing
 * ones. Matching is case-insensitive on purpose: "Vegan" and "vegan" must not
 * become two tags in the same group.
 */
async function resolveTags(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  groupId: string,
  names: readonly string[],
  now: number,
): Promise<Tag[]> {
  if (names.length === 0) return [];

  const existing = await tx.select().from(tags).where(eq(tags.groupId, groupId));
  const byLower = new Map(existing.map((tag) => [tag.name.toLocaleLowerCase("de-DE"), tag]));

  const out: Tag[] = [];
  const toInsert: Array<{ id: string; groupId: string; name: string; color: null; createdAt: number }> = [];

  for (const name of names) {
    const key = name.toLocaleLowerCase("de-DE");
    const found = byLower.get(key);
    if (found) {
      out.push({
        id: found.id,
        groupId: found.groupId,
        name: found.name,
        color: found.color,
        createdAt: toIso(found.createdAt),
      });
      continue;
    }
    const row = { id: crypto.randomUUID(), groupId, name, color: null, createdAt: now };
    toInsert.push(row);
    byLower.set(key, { ...row, color: null });
    out.push({ id: row.id, groupId, name, color: null, createdAt: toIso(now) });
  }

  if (toInsert.length > 0) await tx.insert(tags).values(toInsert);
  return out;
}

interface LoadRecipeDetailInput {
  recipeId: string;
  groupId: string;
  userId: string;
  createdAt: number;
  title: string;
  parsed: ParsedRecipe;
  ingredientRows: Array<Omit<RecipeIngredientRecord, "position"> & { position: number }>;
  stepRows: Array<Omit<RecipeStepRecord, "position"> & { position: number }>;
  tagList: Tag[];
  collectionIds: string[];
}

/**
 * Builds the `RecipeDetail` response for the freshly created recipe.
 *
 * Deliberately assembled from the rows we just wrote plus one author lookup,
 * instead of re-reading five tables: this module must not depend on the recipes
 * router (owned by another agent) to stay merge-conflict free.
 */
async function loadRecipeDetail(db: Database, input: LoadRecipeDetailInput): Promise<RecipeDetail> {
  const authorRows = await db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  const found = authorRows[0];
  const author: PublicUser = found
    ? { ...found, avatarUrl: signUploadUrl(found.avatarUrl) }
    : {
    id: input.userId,
    name: "Unbekannt",
    email: "",
    avatarUrl: null,
  };

  const iso = toIso(input.createdAt);
  const parsed = input.parsed;

  return {
    id: input.recipeId,
    groupId: input.groupId,
    title: input.title,
    description: parsed.description ?? null,
    // Same wire shape as toRecipe(): what was stored is bare, what is sent is signed.
    imageUrl: signUploadUrl(normalizeStoredUploadUrl(parsed.imageUrl)) ?? null,
    thumbnailUrl: signUploadUrl(thumbnailUrlFor(parsed.imageUrl)),
    sourceUrl: parsed.sourceUrl ?? null,
    sourceName: parsed.sourceName ?? null,
    servingsAmount: parsed.servings?.amount ?? null,
    servingsUnit: parsed.servings?.unit ?? null,
    prepMinutes: parsed.prepMinutes ?? null,
    cookMinutes: parsed.cookMinutes ?? null,
    totalMinutes: parsed.totalMinutes ?? null,
    difficulty: parsed.difficulty ?? null,
    rating: null,
    notes: parsed.notes ?? null,
    language: parsed.language ?? "de",
    createdBy: input.userId,
    createdAt: iso,
    updatedAt: iso,
    ingredients: input.ingredientRows.map((row) => ({
      id: row.id,
      recipeId: row.recipeId,
      position: row.position,
      section: row.section ?? null,
      quantity: row.quantity ?? null,
      quantityMax: row.quantityMax ?? null,
      unit: row.unit ?? null,
      name: row.name,
      note: row.note ?? null,
      raw: row.raw,
    })),
    steps: input.stepRows.map((row) => ({
      id: row.id,
      recipeId: row.recipeId,
      position: row.position,
      section: row.section ?? null,
      text: row.text,
    })),
    tags: input.tagList,
    collectionIds: input.collectionIds,
    author,
  };
}

/** Count of recipes in a group — used by tests to assert rollback. */
export async function countRecipes(db: Database, groupId: string): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(recipes)
    .where(eq(recipes.groupId, groupId));
  return Number(rows[0]?.value ?? 0);
}
