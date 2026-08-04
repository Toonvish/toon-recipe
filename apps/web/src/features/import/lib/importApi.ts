/**
 * API client for the import endpoints.
 *
 * This module is deliberately self-contained (no dependency on the shell's
 * generic `src/lib/api.ts`) because the upload calls need XHR to report real
 * progress and a long timeout for server-side OCR — neither of which a generic
 * JSON fetch helper provides. Cookies are always sent (`credentials: include` /
 * `xhr.withCredentials`), exactly like the rest of the app.
 *
 * Every failure is mapped to an ImportApiError with a specific German message,
 * so no screen ever has to render a bare "Fehler".
 */
import {
  ImportDraftListResponseSchema,
  ImportDraftResponseSchema,
  CommitImportDraftResponseSchema,
  TagListResponseSchema,
  type CommitImportDraftRequest,
  type CommitImportDraftResponse,
  type ImportDraft,
  type ImportDraftListQuery,
  type ImportDraftListResponse,
  type ImportDraftStatus,
  type Tag,
  type UpdateImportDraftRequest,
} from "@toon/shared";
import type { ZodType } from "zod";
import { API_BASE_URL } from "@/lib/api";

/** Base URL of the API without trailing slash (single source of truth: @/lib/api). */
export function apiBaseUrl(): string {
  return API_BASE_URL;
}

/* -------------------------------------------------------------------------- */
/* errors                                                                      */
/* -------------------------------------------------------------------------- */

export type ImportErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "too_large"
  | "unsupported_media_type"
  | "no_recipe_data"
  | "fetch_failed"
  | "ocr_failed"
  | "ocr_timeout"
  | "pdf_no_text_layer"
  | "validation"
  | "rate_limited"
  | "server"
  | "aborted"
  | "unknown";

export class ImportApiError extends Error {
  readonly kind: ImportErrorKind;
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  /** Long, actionable German explanation for the UI. */
  readonly hint: string;
  /** True when simply pressing the button again can help. */
  readonly retryable: boolean;

  constructor(init: {
    kind: ImportErrorKind;
    code: string;
    status: number;
    message: string;
    hint: string;
    retryable: boolean;
    details?: unknown;
  }) {
    super(init.message);
    this.name = "ImportApiError";
    this.kind = init.kind;
    this.code = init.code;
    this.status = init.status;
    this.hint = init.hint;
    this.retryable = init.retryable;
    this.details = init.details;
  }
}

interface ServerError {
  code?: string;
  message?: string;
  details?: unknown;
}

function readServerError(body: unknown): ServerError {
  if (typeof body !== "object" || body === null) return {};
  const envelope = (body as { error?: unknown }).error;
  if (typeof envelope !== "object" || envelope === null) return {};
  const { code, message, details } = envelope as ServerError;
  return {
    code: typeof code === "string" ? code : undefined,
    message: typeof message === "string" ? message : undefined,
    details,
  };
}

/** Maps status + error code to a specific German message. */
export function toImportApiError(status: number, body: unknown, fallbackMessage?: string): ImportApiError {
  const server = readServerError(body);
  const code = server.code ?? "unknown";
  const serverMessage = server.message;
  const make = (
    kind: ImportErrorKind,
    message: string,
    hint: string,
    retryable = false,
  ): ImportApiError =>
    new ImportApiError({ kind, code, status, message, hint, retryable, details: server.details });

  if (status === 0) {
    return make(
      "network",
      "Keine Verbindung zum Server",
      "Prüfe deine Internetverbindung. Der Import wurde nicht gestartet, du kannst es einfach nochmal versuchen.",
      true,
    );
  }
  if (status === 401 || code === "unauthorized") {
    return make(
      "unauthorized",
      "Du bist nicht mehr angemeldet",
      "Deine Sitzung ist abgelaufen. Melde dich neu an – dein Entwurf bleibt gespeichert.",
    );
  }
  if (status === 403 || code === "forbidden") {
    return make(
      "forbidden",
      "Kein Zugriff auf diese Gruppe",
      "Du bist kein Mitglied der Gruppe, in die importiert werden soll. Wechsle die Gruppe oder lass dich einladen.",
    );
  }
  if (status === 404 || code === "not_found") {
    return make(
      "not_found",
      "Entwurf nicht gefunden",
      "Der Import-Entwurf existiert nicht mehr – vielleicht wurde er schon gespeichert oder verworfen.",
    );
  }
  if (status === 413 || code === "payload_too_large") {
    return make(
      "too_large",
      "Datei zu groß",
      "Die Datei ist größer als 15 MB. Mach ein Foto mit geringerer Auflösung oder verkleinere die PDF-Datei.",
    );
  }
  if (status === 415 || code === "unsupported_media_type") {
    return make(
      "unsupported_media_type",
      "Dateityp nicht unterstützt",
      "Erlaubt sind Fotos (JPEG, PNG, WebP, HEIC) und PDF-Dateien.",
    );
  }
  if (code === "pdf_no_text_layer") {
    return make(
      "pdf_no_text_layer",
      "PDF ohne Textebene",
      "Dieses PDF enthält keinen auslesbaren Text und konnte auch nicht in Bilder umgewandelt werden. Bitte lade ein Foto der Seite hoch.",
    );
  }
  if (code === "ocr_failed") {
    return make(
      "ocr_failed",
      "Text konnte nicht erkannt werden",
      "Die Texterkennung hat auf diesem Bild nichts gefunden. Tipps: gerade von oben fotografieren, gutes Licht, keine Schatten, Seite ganz im Bild.",
      true,
    );
  }
  if (code === "parse_failed") {
    return make(
      "no_recipe_data",
      "Auf dieser Seite wurden keine Rezeptdaten gefunden",
      "Die Seite liefert kein maschinenlesbares Rezept. Du kannst die Seite stattdessen abfotografieren oder den Text von Hand einfügen.",
    );
  }
  if (code === "fetch_failed") {
    return make(
      "fetch_failed",
      "Seite konnte nicht geladen werden",
      "Der Server konnte die URL nicht abrufen (offline, Login-Pflicht oder Bot-Schutz). Prüfe die Adresse oder importiere die Seite als Foto.",
      true,
    );
  }
  if (status === 504 || status === 408 || code === "timeout") {
    return make(
      "ocr_timeout",
      "Die Texterkennung hat zu lange gedauert",
      "Der Server hat abgebrochen. Versuche es mit einem kleineren Ausschnitt oder einem Foto pro Seite nochmal.",
      true,
    );
  }
  if (status === 429 || code === "rate_limited") {
    return make("rate_limited", "Zu viele Anfragen", "Bitte warte einen Moment und versuche es dann erneut.", true);
  }
  if (status === 422 || code === "validation_failed" || status === 400) {
    return make(
      "validation",
      serverMessage ?? "Die Daten wurden nicht akzeptiert",
      "Bitte prüfe die markierten Felder. Ein Titel ist Pflicht, Mengen müssen Zahlen sein.",
    );
  }
  if (status >= 500) {
    return make(
      "server",
      "Serverfehler",
      "Auf dem Server ist etwas schiefgelaufen. Bitte versuche es in einem Moment erneut.",
      true,
    );
  }
  return make(
    "unknown",
    serverMessage ?? fallbackMessage ?? "Unerwarteter Fehler",
    "Bitte versuche es erneut. Falls es wieder passiert, notiere dir was du getan hast.",
    true,
  );
}

export function isImportApiError(error: unknown): error is ImportApiError {
  return error instanceof ImportApiError;
}

/** Never returns a bare "Fehler": always a title + explanation. */
export function describeError(error: unknown): { title: string; hint: string; retryable: boolean } {
  if (isImportApiError(error)) return { title: error.message, hint: error.hint, retryable: error.retryable };
  // Errors thrown by the shell's generic client (@/lib/api ApiError) carry the
  // same code/status pair, so they get the same specific German messages.
  if (typeof error === "object" && error !== null) {
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    if (typeof candidate.status === "number" && typeof candidate.code === "string") {
      const mapped = toImportApiError(candidate.status, {
        error: { code: candidate.code, message: typeof candidate.message === "string" ? candidate.message : "" },
      });
      return { title: mapped.message, hint: mapped.hint, retryable: mapped.retryable };
    }
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { title: "Abgebrochen", hint: "Der Vorgang wurde abgebrochen.", retryable: true };
  }
  if (error instanceof Error && error.message === "no_files") {
    return { title: "Keine Datei ausgewählt", hint: "Bitte wähle zuerst ein Foto oder eine Datei aus.", retryable: true };
  }
  return {
    title: "Unerwarteter Fehler",
    hint: error instanceof Error && error.message.length > 0 ? error.message : "Bitte versuche es erneut.",
    retryable: true,
  };
}

/* -------------------------------------------------------------------------- */
/* transport                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Validates a server payload but never fails the request over it: an additive
 * server change must not break the review screen, so a schema mismatch only logs.
 */
function parseOrPassThrough<T>(schema: ZodType<T>, payload: unknown, label: string): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  if (import.meta.env.DEV) {
    console.warn(`[import] Antwort von ${label} entspricht nicht dem Schema`, result.error);
  }
  return payload as T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { code: "internal_error", message: text.slice(0, 300) } };
  }
}

async function requestJson<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw toImportApiError(0, undefined);
  }
  const payload = await readJson(response);
  if (!response.ok) throw toImportApiError(response.status, payload, response.statusText);
  return parseOrPassThrough(schema, payload, path);
}

async function requestNoContent(path: string, init: RequestInit = {}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      credentials: "include",
      ...init,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw toImportApiError(0, undefined);
  }
  if (!response.ok) throw toImportApiError(response.status, await readJson(response), response.statusText);
}

export interface UploadHandle {
  /** 0..1 while bytes are on the wire; 1 means "server is working". */
  onProgress?: (fraction: number) => void;
  /** Called once all bytes are uploaded and OCR starts. */
  onUploadComplete?: () => void;
  /** Only useful during the upload phase — OCR itself cannot be interrupted. */
  signal?: AbortSignal;
  /** Server-side OCR can take a while; default 4 minutes. */
  timeoutMs?: number;
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 240_000;

/**
 * multipart upload with real progress via XHR (fetch cannot report request
 * progress in any shipping browser).
 */
function uploadFile<T>(path: string, file: File, schema: ZodType<T>, handle: UploadHandle = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBaseUrl()}${path}`, true);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.timeout = handle.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Accept", "application/json");

    const abort = () => xhr.abort();
    handle.signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => handle.signal?.removeEventListener("abort", abort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) handle.onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.upload.onload = () => {
      handle.onProgress?.(1);
      handle.onUploadComplete?.();
    };
    xhr.onerror = () => {
      cleanup();
      reject(toImportApiError(0, undefined));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(
        new ImportApiError({
          kind: "ocr_timeout",
          code: "timeout",
          status: 504,
          message: "Die Texterkennung hat zu lange gedauert",
          hint: "Der Server hat nicht rechtzeitig geantwortet. Versuche es mit einem Foto pro Seite oder einem kleineren Bild erneut.",
          retryable: true,
        }),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Upload abgebrochen", "AbortError"));
    };
    xhr.onload = () => {
      cleanup();
      let payload: unknown;
      try {
        payload = xhr.responseText.length > 0 ? (JSON.parse(xhr.responseText) as unknown) : undefined;
      } catch {
        payload = { error: { code: "internal_error", message: xhr.responseText.slice(0, 300) } };
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(toImportApiError(xhr.status, payload, xhr.statusText));
        return;
      }
      resolve(parseOrPassThrough(schema, payload, path));
    };

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

/* -------------------------------------------------------------------------- */
/* endpoints                                                                   */
/* -------------------------------------------------------------------------- */

const groupBase = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}`;

export async function importFromUrl(groupId: string, url: string, signal?: AbortSignal): Promise<ImportDraft> {
  const response = await requestJson(`${groupBase(groupId)}/imports/url`, ImportDraftResponseSchema, {
    method: "POST",
    body: JSON.stringify({ url }),
    signal,
  });
  return response.draft;
}

export async function importFromText(
  groupId: string,
  rawText: string,
  title?: string,
  signal?: AbortSignal,
): Promise<ImportDraft> {
  const response = await requestJson(`${groupBase(groupId)}/imports/text`, ImportDraftResponseSchema, {
    method: "POST",
    body: JSON.stringify(title === undefined || title.length === 0 ? { rawText } : { rawText, title }),
    signal,
  });
  return response.draft;
}

export async function importImage(groupId: string, file: File, handle?: UploadHandle): Promise<ImportDraft> {
  const response = await uploadFile(
    `${groupBase(groupId)}/imports/image`,
    file,
    ImportDraftResponseSchema,
    handle,
  );
  return response.draft;
}

export async function importPdf(groupId: string, file: File, handle?: UploadHandle): Promise<ImportDraft> {
  const response = await uploadFile(`${groupBase(groupId)}/imports/pdf`, file, ImportDraftResponseSchema, handle);
  return response.draft;
}

export async function listDrafts(
  groupId: string,
  query: Partial<ImportDraftListQuery> = {},
  signal?: AbortSignal,
): Promise<ImportDraftListResponse> {
  const search = new URLSearchParams();
  if (query.status !== undefined) search.set("status", query.status);
  if (query.limit !== undefined) search.set("limit", String(query.limit));
  if (query.offset !== undefined) search.set("offset", String(query.offset));
  const queryString = search.toString();
  const suffix = queryString.length > 0 ? `?${queryString}` : "";
  return requestJson(`${groupBase(groupId)}/imports${suffix}`, ImportDraftListResponseSchema, { signal });
}

export async function getDraft(groupId: string, draftId: string, signal?: AbortSignal): Promise<ImportDraft> {
  const response = await requestJson(
    `${groupBase(groupId)}/imports/${encodeURIComponent(draftId)}`,
    ImportDraftResponseSchema,
    { signal },
  );
  return response.draft;
}

export async function patchDraft(
  groupId: string,
  draftId: string,
  body: UpdateImportDraftRequest,
  signal?: AbortSignal,
): Promise<ImportDraft> {
  const response = await requestJson(
    `${groupBase(groupId)}/imports/${encodeURIComponent(draftId)}`,
    ImportDraftResponseSchema,
    { method: "PATCH", body: JSON.stringify(body), signal },
  );
  return response.draft;
}

export async function commitDraft(
  groupId: string,
  draftId: string,
  body: CommitImportDraftRequest,
  signal?: AbortSignal,
): Promise<CommitImportDraftResponse> {
  return requestJson(
    `${groupBase(groupId)}/imports/${encodeURIComponent(draftId)}/commit`,
    CommitImportDraftResponseSchema,
    { method: "POST", body: JSON.stringify(body), signal },
  );
}

export async function deleteDraft(groupId: string, draftId: string): Promise<void> {
  await requestNoContent(`${groupBase(groupId)}/imports/${encodeURIComponent(draftId)}`, { method: "DELETE" });
}

/**
 * Fetches the SOURCE SCAN of a draft (the uploaded photo or PDF) as an object URL.
 *
 * This deliberately goes through the membership-checked endpoint
 * `GET /api/groups/:groupId/imports/:draftId/source` rather than `/uploads/<file>`.
 * The scan can be a photo of a private page, and the public route used to hand it
 * to anyone who had ever seen the URL, forever — including a member who had since
 * been removed from the group. The public route now also demands a signature, and
 * the API mints none for source scans, so this is the ONLY way to read one.
 *
 * A cross-origin `<img src>` cannot send the session cookie, hence fetch + blob.
 * THE CALLER MUST `URL.revokeObjectURL()` the result when it stops rendering it,
 * or the bytes stay alive for the lifetime of the document.
 */
export async function fetchDraftSource(
  groupId: string,
  draftId: string,
  signal?: AbortSignal,
): Promise<{ objectUrl: string; mimeType: string }> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}${groupBase(groupId)}/imports/${encodeURIComponent(draftId)}/source`,
      { credentials: "include", ...(signal === undefined ? {} : { signal }) },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw toImportApiError(0, undefined);
  }
  if (!response.ok) {
    throw toImportApiError(response.status, await readJson(response), response.statusText);
  }
  const blob = await response.blob();
  return { objectUrl: URL.createObjectURL(blob), mimeType: blob.type };
}

/** Tag suggestions for the review screen's tag input. */
export async function listGroupTags(groupId: string, signal?: AbortSignal): Promise<Tag[]> {
  const response = await requestJson(`${groupBase(groupId)}/tags`, TagListResponseSchema, { signal });
  return response.items;
}

export type { ImportDraftStatus };
