/**
 * One shared `zValidator` hook for both routers.
 *
 * @hono/zod-validator answers 400 with a raw ZodError by default; the contract
 * wants 422 `validation_failed` with a compact `details` array, so every
 * validator in routes/groups.ts and routes/recipes.ts passes this hook.
 */
import { ApiError } from "../../lib/errors.ts";

interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

interface ZodLikeError {
  issues?: ReadonlyArray<{ path: ReadonlyArray<string | number | symbol>; code: string; message: string }>;
}

function toIssues(error: unknown): ValidationIssue[] | undefined {
  const issues = (error as ZodLikeError | undefined)?.issues;
  if (!issues) return undefined;
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));
}

/** Throws 422 `validation_failed`; the global onError builds the envelope. */
export function onValidationError(result: { success: boolean; error?: unknown }): void {
  if (result.success) return;
  throw ApiError.validationFailed(toIssues(result.error) ?? "Eingabe ist ungültig");
}

/**
 * CONTRACT WORKAROUND (frozen @toon/shared schemas, cannot be changed here):
 * `UpdateRecipeRequestSchema` / `UpdateCollectionRequestSchema` are
 * `CreateXRequestSchema.partial()`, and zod KEEPS the `.default([])` of the
 * replace-all child arrays. `PATCH { title: "neu" }` therefore parses to
 * `{ title, ingredients: [], steps: [], tags: [], collectionIds: [] }`, which
 * would wipe every child row — while docs/API.md says absent means untouched.
 *
 * So we drop the listed keys again unless they really were in the JSON body.
 * Hono caches the parsed body, so reading it after the validator is free.
 */
export function keepOnlySentKeys<T extends object>(
  validated: T,
  rawBody: unknown,
  keys: readonly (keyof T & string)[],
): T {
  const sent =
    rawBody !== null && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : {};
  const result = { ...validated };
  for (const key of keys) {
    if (!Object.hasOwn(sent, key)) delete result[key];
  }
  return result;
}
