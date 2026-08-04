/**
 * `import_drafts` repository + wire mapping.
 *
 * The draft is the ONLY thing an import creates — nothing reaches `recipes`
 * until the user commits the reviewed draft (see commit.ts).
 *
 * Defensive read path: `parsed` is a JSON column, so a row written by an older
 * version (or hand-edited in the DB) might not satisfy `ParsedRecipeSchema`.
 * `toDraftWire()` therefore validates and falls back to an empty parse instead
 * of throwing a 500 on a GET.
 */
import {
  type ImportDraft,
  type ImportDraftStatus,
  type ImportSourceMeta,
  type ImportSourceType,
  type ParsedRecipe,
  ImportSourceMetaSchema,
  ParsedRecipeSchema,
  emptyParsedRecipe,
} from "@toon/shared";
import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { type ImportDraftRow, importDrafts } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { toIso } from "../../lib/http.ts";

/** Row -> contract shape. Never throws on malformed JSON columns. */
export function toDraftWire(row: ImportDraftRow): ImportDraft {
  const parsedResult = ParsedRecipeSchema.safeParse(row.parsed);
  const parsed: ParsedRecipe = parsedResult.success
    ? parsedResult.data
    : emptyParsedRecipe({ confidence: { overall: 0 } });

  const metaResult = row.sourceMeta === null ? undefined : ImportSourceMetaSchema.safeParse(row.sourceMeta);
  const sourceMeta: ImportSourceMeta | null = metaResult?.success === true ? metaResult.data : null;

  return {
    id: row.id,
    groupId: row.groupId,
    createdBy: row.createdBy,
    status: row.status as ImportDraftStatus,
    sourceType: row.sourceType as ImportSourceType,
    sourceUrl: row.sourceUrl,
    rawText: row.rawText,
    parsed,
    confidence: row.confidence,
    sourceMeta,
    recipeId: row.recipeId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export interface CreateDraftInput {
  groupId: string;
  createdBy: string;
  sourceType: ImportSourceType;
  parsed: ParsedRecipe;
  rawText?: string | null;
  sourceUrl?: string | null;
  sourceMeta?: ImportSourceMeta | null;
}

/** Inserts a pending draft and returns it in wire shape. */
export async function createDraft(db: Database, input: CreateDraftInput): Promise<ImportDraft> {
  const now = Date.now();
  const row: ImportDraftRow = {
    id: crypto.randomUUID(),
    groupId: input.groupId,
    createdBy: input.createdBy,
    status: "pending",
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl ?? null,
    rawText: input.rawText ?? null,
    parsed: input.parsed,
    confidence: input.parsed.confidence.overall,
    sourceMeta: input.sourceMeta ?? null,
    recipeId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(importDrafts).values(row);
  return toDraftWire(row);
}

/**
 * Loads a draft and verifies it belongs to `groupId`.
 * @throws ApiError 404 when it does not exist in that group (never leaks
 *   whether the id exists in a different group).
 */
export async function getDraftOr404(db: Database, groupId: string, draftId: string): Promise<ImportDraftRow> {
  const rows = await db
    .select()
    .from(importDrafts)
    .where(and(eq(importDrafts.id, draftId), eq(importDrafts.groupId, groupId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound("Dieser Import-Entwurf existiert nicht (mehr).");
  return row;
}

export interface ListDraftsQuery {
  status?: ImportDraftStatus;
  limit: number;
  offset: number;
}

export interface DraftList {
  items: ImportDraft[];
  total: number;
  limit: number;
  offset: number;
}

/** Paginated draft listing for a group, newest first. */
export async function listDrafts(db: Database, groupId: string, query: ListDraftsQuery): Promise<DraftList> {
  const where =
    query.status === undefined
      ? eq(importDrafts.groupId, groupId)
      : and(eq(importDrafts.groupId, groupId), eq(importDrafts.status, query.status));

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(importDrafts)
      .where(where)
      .orderBy(desc(importDrafts.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(importDrafts).where(where),
  ]);

  return {
    items: rows.map(toDraftWire),
    total: Number(totals[0]?.value ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export interface UpdateDraftInput {
  parsed?: ParsedRecipe;
  status?: ImportDraftStatus;
  recipeId?: string | null;
}

/** Applies review-screen edits. Keeps `confidence` in sync with `parsed`. */
export async function updateDraft(
  db: Database,
  draftId: string,
  input: UpdateDraftInput,
): Promise<void> {
  const patch: Partial<ImportDraftRow> = { updatedAt: Date.now() };
  if (input.parsed !== undefined) {
    patch.parsed = input.parsed;
    patch.confidence = input.parsed.confidence.overall;
  }
  if (input.status !== undefined) patch.status = input.status;
  if (input.recipeId !== undefined) patch.recipeId = input.recipeId;
  await db.update(importDrafts).set(patch).where(eq(importDrafts.id, draftId));
}

/** Hard-deletes a draft row. The caller unlinks the stored upload. */
export async function deleteDraft(db: Database, draftId: string): Promise<void> {
  await db.delete(importDrafts).where(eq(importDrafts.id, draftId));
}

/** Stored upload filename of a draft, if it had one. */
export function storedFilenameOf(row: ImportDraftRow): string | undefined {
  const meta = row.sourceMeta;
  if (meta === null || typeof meta !== "object") return undefined;
  const storedPath = (meta as ImportSourceMeta).storedPath;
  return typeof storedPath === "string" && storedPath.length > 0 ? storedPath : undefined;
}
