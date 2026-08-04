import { z } from "zod";

/** All ids are crypto.randomUUID() strings. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** All timestamps travel over the wire as ISO-8601 strings (stored as unix ms). */
export const IsoDateSchema = z.iso.datetime({ offset: true });
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** True for `http:`/`https:` URLs and nothing else. */
export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * A link that is safe to put into an `href`. Used for every URL a CLIENT may
 * send (recipe `sourceUrl`, draft `sourceUrl`): without it, a group member could
 * store `javascript:…` and have it execute on the app origin, with the victim's
 * session, as soon as an admin clicked the "Quelle" link.
 *
 * Response schemas stay a plain string on purpose so a legacy row can still be
 * read — the UI defends itself with `safeHttpUrl()` in apps/web/src/lib/format.ts.
 */
export const HttpUrlSchema = z
  .string()
  .max(2000)
  .refine(isHttpUrl, { message: "Nur http(s)-Links sind erlaubt" });

/** Machine-readable error codes. `ApiError.code` is a plain string for forward compat. */
export const ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "unauthorized",
  "invalid_credentials",
  "forbidden",
  "not_found",
  "conflict",
  "email_taken",
  "group_name_taken",
  "tag_name_taken",
  "shopping_list_name_taken",
  /** The list already holds `SHOPPING_LIMITS.itemsPerList` lines. */
  "shopping_list_full",
  /** The group already has `SHOPPING_LIMITS.listsPerGroup` lists. */
  "too_many_shopping_lists",
  "invite_invalid",
  "invite_expired",
  /**
   * A password-reset token is unknown, expired or already used. ONE code for all
   * three on purpose: telling them apart would confirm that a token existed.
   */
  "reset_token_invalid",
  /** An e-mail-confirmation token is unknown, expired or already used. */
  "verification_token_invalid",
  "last_owner",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "fetch_failed",
  "parse_failed",
  "ocr_failed",
  "pdf_no_text_layer",
  "oauth_failed",
  "oauth_not_configured",
  /** The provider identity is already attached to another account. */
  "oauth_already_linked",
  /** Unlinking would leave the user with no way to sign in. */
  "last_login_method",
  "internal_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** The one and only error envelope every endpoint uses. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Shared list envelope: `{ items, total, limit, offset }`. */
export function listResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

/** Query params for every paginated list endpoint (strings are coerced). */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** GET /api/health */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  time: IsoDateSchema,
  database: z.enum(["file", "remote"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Response of every "no body needed but say something" mutation. */
export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;

/** Result of an upload endpoint (recipe image, avatar). */
export const UploadResponseSchema = z.object({
  url: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

/** Hard limit for every upload (bytes). Enforced by the API, mirrored in the UI. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
] as const;

export const ACCEPTED_PDF_MIME_TYPES = ["application/pdf"] as const;
