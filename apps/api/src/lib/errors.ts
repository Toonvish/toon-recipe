/**
 * The single error path of the API.
 *
 * Throw `ApiError` (or one of the static helpers) anywhere in a handler; the
 * `onErrorHandler` mounted in src/index.ts turns it into the standard envelope
 *   { error: { code, message, details? } }
 * with the right HTTP status. Stack traces are logged, never sent.
 */
import type { ApiError as ApiErrorBody, ErrorCode } from "@toon/shared";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { env } from "../env.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode | string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: this.details === undefined
        ? { code: this.code, message: this.message }
        : { code: this.code, message: this.message, details: this.details },
    };
  }

  static badRequest(message = "Ungültige Anfrage", details?: unknown): ApiError {
    return new ApiError(400, "bad_request", message, details);
  }

  static unauthorized(message = "Nicht angemeldet"): ApiError {
    return new ApiError(401, "unauthorized", message);
  }

  static invalidCredentials(message = "E-Mail oder Passwort ist falsch"): ApiError {
    return new ApiError(401, "invalid_credentials", message);
  }

  static forbidden(message = "Keine Berechtigung"): ApiError {
    return new ApiError(403, "forbidden", message);
  }

  static notFound(message = "Nicht gefunden"): ApiError {
    return new ApiError(404, "not_found", message);
  }

  static conflict(code: ErrorCode | string = "conflict", message = "Konflikt"): ApiError {
    return new ApiError(409, code, message);
  }

  static payloadTooLarge(message = "Datei ist zu groß (max. 15 MB)"): ApiError {
    return new ApiError(413, "payload_too_large", message);
  }

  static unsupportedMediaType(message = "Dateityp wird nicht unterstützt"): ApiError {
    return new ApiError(415, "unsupported_media_type", message);
  }

  static validationFailed(details: unknown, message = "Eingabe ist ungültig"): ApiError {
    return new ApiError(422, "validation_failed", message, details);
  }

  static internal(message = "Interner Serverfehler"): ApiError {
    return new ApiError(500, "internal_error", message);
  }
}

/** Builds the standard envelope from any thrown value. */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validationFailed(
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      })),
    );
  }

  if (error instanceof HTTPException) {
    const status = error.status;
    const code =
      status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not_found" : "bad_request";
    return new ApiError(status, code, error.message || "Anfrage fehlgeschlagen");
  }

  return ApiError.internal();
}

/** Hono `app.onError` handler. */
export const onErrorHandler: ErrorHandler = (error, c: Context) => {
  const apiError = toApiError(error);
  if (apiError.status >= 500) {
    console.error(`[api] ${c.req.method} ${c.req.path} ->`, error);
  } else if (env.NODE_ENV === "development") {
    console.warn(`[api] ${c.req.method} ${c.req.path} -> ${apiError.status} ${apiError.code}: ${apiError.message}`);
  }
  return c.json(apiError.toBody(), apiError.status as 400);
};

/** Hono `app.notFound` handler — same envelope as every other error. */
export const notFoundHandler: NotFoundHandler = (c: Context) =>
  c.json(ApiError.notFound(`Route ${c.req.method} ${c.req.path} existiert nicht`).toBody(), 404);
