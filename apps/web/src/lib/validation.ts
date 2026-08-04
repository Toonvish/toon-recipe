/**
 * Form validation glue: run the SAME Zod schemas the API uses (from @toon/shared)
 * in the browser and turn failures into `{ field: "message" }` maps that the
 * `<Input error>` prop understands.
 */
import type { z } from "zod";
import { isApiError } from "./api";

/** `{ email: "Bitte eine gültige E-Mail-Adresse angeben" }` */
export type FieldErrors = Record<string, string>;

/** First message per field path, joined with "." for nested paths. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map((part) => String(part)).join(".") : "_form";
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export type ValidationResult<T> =
  | { ok: true; data: T; errors: null }
  | { ok: false; data: null; errors: FieldErrors };

/**
 * `const result = validate(LoginRequestSchema, values)` —
 * on success `result.data` is fully typed and normalised (e-mails are trimmed and
 * lower-cased by the shared schema).
 */
export function validate<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): ValidationResult<z.output<Schema>> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data, errors: null };
  return { ok: false, data: null, errors: zodFieldErrors(parsed.error) };
}

/**
 * Pulls field errors out of a 422 `ApiError` (`details` carries the server-side Zod
 * issues). Falls back to `{ _form: message }` so nothing is ever swallowed.
 *
 * NOTHING is the one input that must produce no error at all. A TanStack mutation
 * reports `error: null` while it is idle, so a form rendering
 * `apiFieldErrors(mutation.error)` on every pass would otherwise greet the user with
 * "Etwas ist schiefgelaufen / Unbekannter Fehler." on a blank form they have not
 * submitted yet — which is exactly what /recipes/new and /recipes/:id/edit did.
 */
export function apiFieldErrors(error: unknown): FieldErrors {
  if (error === null || error === undefined) return {};
  if (!isApiError(error)) {
    return { _form: error instanceof Error ? error.message : "Unbekannter Fehler." };
  }

  const details = error.details;
  let errors: FieldErrors = {};

  if (Array.isArray(details)) {
    errors = fromIssues(details);
  } else if (typeof details === "object" && details !== null) {
    const record = details as { fieldErrors?: unknown; issues?: unknown };
    if (Array.isArray(record.issues)) {
      errors = fromIssues(record.issues);
    } else if (typeof record.fieldErrors === "object" && record.fieldErrors !== null) {
      for (const [key, value] of Object.entries(record.fieldErrors as Record<string, unknown>)) {
        const first = Array.isArray(value) ? value[0] : value;
        if (typeof first === "string") errors[key] = first;
      }
    }
  }

  if (Object.keys(errors).length === 0) errors._form = error.message;
  return errors;
}

/** Server-side Zod issues: `[{ path: ["email"], message: "..." }]`. */
function fromIssues(issues: readonly unknown[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const entry of issues) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as { path?: unknown; message?: unknown };
    const message = typeof record.message === "string" ? record.message : undefined;
    if (!message) continue;
    const key = Array.isArray(record.path)
      ? record.path.map((part) => String(part)).join(".") || "_form"
      : "_form";
    if (!(key in errors)) errors[key] = message;
  }
  return errors;
}

/** Convenience for controlled forms: clears one field's error on change. */
export function clearField(errors: FieldErrors, field: string): FieldErrors {
  if (!(field in errors)) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}
