/**
 * The typed API client — the ONLY place in the web app that talks to the network.
 *
 * Rules for every other frontend module:
 *  - never call `fetch` yourself, import a function from here,
 *  - every argument/return type comes from `@toon/shared` (the frozen contract),
 *  - errors are always an {@link ApiError} (code + message + HTTP status).
 *
 * Session handling: the API sets an HttpOnly cookie, so every request goes out with
 * `credentials: "include"`. A 401 on a guarded endpoint triggers the global
 * unauthorized handler (see {@link setUnauthorizedHandler}) which sends the user to
 * `/login?next=<current path>`.
 */
import {
  MAX_UPLOAD_BYTES,
  type AcceptInviteRequest,
  type AcceptInviteResponse,
  type AddRecipeToShoppingListRequest,
  type AddShoppingItemsRequest,
  type AuthSessionResponse,
  type ChangePasswordRequest,
  type CheckShoppingItemRequest,
  type CollectionDetailResponse,
  type CollectionListResponse,
  type CollectionResponse,
  type CommitImportDraftRequest,
  type CommitImportDraftResponse,
  type CreateCollectionRequest,
  type CreateGroupRequest,
  type CreateInviteRequest,
  type CreateRecipeRequest,
  type CreateShoppingListRequest,
  type CreateTagRequest,
  type ForgotPasswordRequest,
  type GroupDetailResponse,
  type GroupInviteListResponse,
  type GroupInviteResponse,
  type GroupListResponse,
  type GroupMemberListResponse,
  type GroupMemberResponse,
  type GroupResponse,
  type HealthResponse,
  type ImportDraftListQuery,
  type ImportDraftListResponse,
  type ImportDraftResponse,
  type ImportTextRequest,
  type ImportUrlRequest,
  type InvitePreviewResponse,
  type LoginRequest,
  type MeResponse,
  type OAuthProvider,
  type OAuthProvidersResponse,
  type OAuthStartResponse,
  type PaginationQuery,
  type RecipeListQuery,
  type RecipeListResponse,
  type RecipeResponse,
  type RegisterRequest,
  type ResetPasswordRequest,
  type ScaledRecipeResponse,
  type SessionListResponse,
  type ShoppingListDetailResponse,
  type ShoppingListListResponse,
  type ShoppingListResponse,
  type TagListResponse,
  type TagResponse,
  type UpdateCollectionRequest,
  type UpdateGroupRequest,
  type UpdateImportDraftRequest,
  type UpdateMemberRoleRequest,
  type UpdateProfileRequest,
  type UpdateRecipeRequest,
  type UpdateShoppingItemRequest,
  type UpdateShoppingListRequest,
  type UpdateTagRequest,
  type UploadResponse,
  type UserResponse,
  type VerifyEmailRequest,
} from "@toon/shared";

/* -------------------------------------------------------------------------- */
/* base url                                                                   */
/* -------------------------------------------------------------------------- */

const buildEnv = import.meta.env as unknown as Record<string, string | undefined>;

/**
 * Base URL of the API without a trailing slash.
 * `PUBLIC_API_URL` is the documented name (root .env, inlined by vite);
 * `VITE_API_URL` is accepted as an alias.
 */
export const API_BASE_URL: string = (
  buildEnv.PUBLIC_API_URL ??
  buildEnv.VITE_API_URL ??
  "http://localhost:3001"
).replace(/\/+$/, "");

/** Absolute URL for an API path (`/api/health` -> `http://localhost:3001/api/health`). */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Turns a stored media path into something an `<img src>` can use.
 * The API returns `/uploads/<uuid>.<ext>`; absolute URLs and data: URIs pass through.
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return apiUrl(url);
}

/**
 * `<img src>` for a LIST row or card: the downscaled derivative the API minted, and
 * the original only when there is none (an external hero image, an older payload).
 * A recipe list renders up to 24 of these, so it must never pull the full-size photo.
 * Detail screens keep using `mediaUrl(imageUrl)` — there the big one is the point.
 */
export function thumbnailUrl(
  media: { thumbnailUrl?: string | null; imageUrl?: string | null },
): string | undefined {
  return mediaUrl(media.thumbnailUrl ?? media.imageUrl);
}

/* -------------------------------------------------------------------------- */
/* errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every failed request throws this. `code` is one of `ERROR_CODES` from
 * `@toon/shared` (plus the client-only codes `network_error` / `client_error`).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(options: { code: string; message: string; status: number; details?: unknown }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }

  /** 4xx = the user can fix it; retrying is pointless. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isOffline(): boolean {
    return this.code === "network_error";
  }
}

/** Alias for code that already imports a type called `ApiError` from @toon/shared. */
export { ApiError as ApiClientError };

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** German, user-facing message for any thrown value. Safe to render directly. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Unbekannter Fehler. Bitte versuche es noch einmal.";
}

/* -------------------------------------------------------------------------- */
/* 401 handling                                                               */
/* -------------------------------------------------------------------------- */

type UnauthorizedHandler = (next: string) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let lastRedirectAt = 0;

/**
 * Registered once by the router/session provider so a 401 can be handled with a
 * client-side navigation instead of a full page load.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (pathname === "/login" || pathname === "/register" || pathname.startsWith("/invite/")) return;
  // Never loop: at most one redirect per second.
  const now = Date.now();
  if (now - lastRedirectAt < 1000) return;
  lastRedirectAt = now;

  const next = `${pathname}${search}${hash}`;
  if (unauthorizedHandler) {
    unauthorizedHandler(next);
    return;
  }
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

/* -------------------------------------------------------------------------- */
/* core request                                                               */
/* -------------------------------------------------------------------------- */

export type QueryValue = string | number | boolean | null | undefined;

/** Builds `?a=1&b=x`, skipping null/undefined/"" values. */
export function queryString(params: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export interface RequestOptions {
  signal?: AbortSignal | undefined;
  /** Skip the global 401 -> /login redirect (bootstrap + auth screens use this). */
  allowUnauthorized?: boolean;
}

interface RequestInput extends RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON body — serialised automatically. Use `form` for multipart. */
  body?: unknown;
  form?: FormData;
}

async function request<T>(path: string, input: RequestInput = {}): Promise<T> {
  const { method = "GET", body, form, signal, allowUnauthorized } = input;

  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (form) {
    payload = form; // fetch sets the multipart boundary itself
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      credentials: "include",
      headers,
      body: payload,
      signal: signal ?? null,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError({
      code: "network_error",
      status: 0,
      message: "Keine Verbindung zum Server. Bist du offline?",
      details: cause,
    });
  }

  if (response.status === 401 && !allowUnauthorized) handleUnauthorized();

  if (response.status === 204 || response.status === 205) return undefined as T;

  const raw = await response.text();
  let parsed: unknown = undefined;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) throw toApiError(response.status, parsed, raw);
  return parsed as T;
}

function toApiError(status: number, parsed: unknown, raw: string): ApiError {
  const envelope =
    typeof parsed === "object" && parsed !== null && "error" in parsed
      ? (parsed as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error
      : undefined;

  const code = typeof envelope?.code === "string" ? envelope.code : fallbackCode(status);
  const message =
    typeof envelope?.message === "string" && envelope.message.length > 0
      ? envelope.message
      : fallbackMessage(status, raw);

  return new ApiError({ code, message, status, details: envelope?.details });
}

function fallbackCode(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "payload_too_large";
  if (status === 415) return "unsupported_media_type";
  if (status === 422) return "validation_failed";
  if (status >= 500) return "internal_error";
  return "bad_request";
}

function fallbackMessage(status: number, raw: string): string {
  switch (status) {
    case 401:
      return "Bitte melde dich an.";
    case 403:
      return "Dazu hast du keine Berechtigung.";
    case 404:
      return "Nicht gefunden.";
    case 409:
      return "Das steht im Konflikt mit vorhandenen Daten.";
    case 413:
      return "Die Datei ist zu groß (max. 15 MB).";
    case 415:
      return "Dieser Dateityp wird nicht unterstützt.";
    case 422:
      return "Die Eingaben sind unvollständig oder ungültig.";
    default:
      return status >= 500
        ? "Serverfehler. Bitte versuche es später noch einmal."
        : raw.slice(0, 200) || "Anfrage fehlgeschlagen.";
  }
}

/** Client-side guard so a 15 MB+ file never leaves the phone. */
function assertUploadSize(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError({
      code: "payload_too_large",
      status: 413,
      message: `"${file.name}" ist ${(file.size / (1024 * 1024)).toFixed(1)} MB groß. Maximal 15 MB sind erlaubt.`,
    });
  }
}

function fileForm(file: File): FormData {
  assertUploadSize(file);
  const form = new FormData();
  // The API expects exactly one field named `file` (ImportFileFieldName).
  form.append("file", file, file.name);
  return form;
}

/* -------------------------------------------------------------------------- */
/* health                                                                     */
/* -------------------------------------------------------------------------- */

export function fetchHealth(options?: RequestOptions): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health", { ...options, allowUnauthorized: true });
}

/* -------------------------------------------------------------------------- */
/* auth                                                                       */
/* -------------------------------------------------------------------------- */

export function registerAccount(
  body: RegisterRequest,
  options?: RequestOptions,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>("/api/auth/register", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

export function loginWithPassword(
  body: LoginRequest,
  options?: RequestOptions,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>("/api/auth/login", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

export function logout(options?: RequestOptions): Promise<void> {
  return request<void>("/api/auth/logout", {
    ...options,
    method: "POST",
    allowUnauthorized: true,
  });
}

/** Bootstrap call: user + groups + activeGroupId. 401 here is normal (= logged out). */
export function fetchMe(options?: RequestOptions): Promise<MeResponse> {
  return request<MeResponse>("/api/auth/me", { ...options, allowUnauthorized: true });
}

export function updateProfile(
  body: UpdateProfileRequest,
  options?: RequestOptions,
): Promise<UserResponse> {
  return request<UserResponse>("/api/auth/me", { ...options, method: "PATCH", body });
}

export function changePassword(
  body: ChangePasswordRequest,
  options?: RequestOptions,
): Promise<void> {
  return request<void>("/api/auth/password", { ...options, method: "POST", body });
}

/**
 * "Passwort vergessen" — ALWAYS resolves for a syntactically valid address.
 *
 * The API answers 204 whether or not the account exists (no user enumeration), so
 * the calling screen must show the same confirmation either way and must NOT try to
 * infer anything from the result. A 429 still surfaces, which is intentional.
 */
export function requestPasswordReset(
  body: ForgotPasswordRequest,
  options?: RequestOptions,
): Promise<void> {
  return request<void>("/api/auth/password/forgot", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

/**
 * Spends a reset token from a mailed link. On success EVERY session of that user is
 * gone — including any this browser held — and the user must sign in again, so the
 * screen navigates to `/login`. 400 `reset_token_invalid` covers
 * unknown/expired/already-used alike.
 */
export function resetPassword(
  body: ResetPasswordRequest,
  options?: RequestOptions,
): Promise<void> {
  return request<void>("/api/auth/password/reset", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

/** Mails a confirmation link to the signed-in account's address. */
export function requestEmailVerification(options?: RequestOptions): Promise<void> {
  return request<void>("/api/auth/email/verify/request", { ...options, method: "POST", body: {} });
}

/**
 * Confirms an address from a mailed link. Works without a session — the link is
 * regularly opened on a different device than the one that is signed in.
 */
export function confirmEmailVerification(
  body: VerifyEmailRequest,
  options?: RequestOptions,
): Promise<UserResponse> {
  return request<UserResponse>("/api/auth/email/verify/confirm", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

export function fetchSessions(options?: RequestOptions): Promise<SessionListResponse> {
  return request<SessionListResponse>("/api/auth/sessions", options);
}

export function revokeSession(sessionId: string, options?: RequestOptions): Promise<void> {
  return request<void>(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
    ...options,
    method: "DELETE",
  });
}

/**
 * URL to send the browser to for an OAuth login. Must be a real navigation
 * (`window.location.assign`) — not fetch — because the API answers with a 302.
 */
export function oauthStartUrl(provider: OAuthProvider, next?: string): string {
  return apiUrl(`/api/auth/oauth/${provider}${queryString({ next })}`);
}

/** Same as {@link oauthStartUrl} but returns the provider URL as JSON (`?json=1`). */
export function fetchOAuthStartUrl(
  provider: OAuthProvider,
  options?: RequestOptions,
): Promise<OAuthStartResponse> {
  return request<OAuthStartResponse>(`/api/auth/oauth/${provider}?json=1`, {
    ...options,
    allowUnauthorized: true,
  });
}

/** Full-page navigation into the provider's consent screen. */
export function startOAuth(provider: OAuthProvider, next?: string): void {
  window.location.assign(oauthStartUrl(provider, next));
}

/**
 * Which providers this deployment configured (+ what the current user linked).
 * Public: a missing session just reports `linked: false`, so `allowUnauthorized`.
 */
export function fetchOAuthProviders(options?: RequestOptions): Promise<OAuthProvidersResponse> {
  return request<OAuthProvidersResponse>("/api/auth/oauth", {
    ...options,
    allowUnauthorized: true,
  });
}

/**
 * Attaches a provider to the account that is signed in RIGHT NOW. Also a full-page
 * navigation — the API answers with a 302 into the consent screen and bounces back
 * to `next` with `?linked=<provider>` (or `?error=…`).
 */
export function startOAuthLink(provider: OAuthProvider, next = "/settings"): void {
  window.location.assign(apiUrl(`/api/auth/oauth/${provider}/link${queryString({ next })}`));
}

/** Detaches a provider. 409 `last_login_method` when it is the only way in. */
export function unlinkOAuthProvider(
  provider: OAuthProvider,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/auth/oauth/${provider}`, { ...options, method: "DELETE" });
}

/* -------------------------------------------------------------------------- */
/* groups, members, invites                                                   */
/* -------------------------------------------------------------------------- */

export function fetchGroups(options?: RequestOptions): Promise<GroupListResponse> {
  return request<GroupListResponse>("/api/groups", options);
}

export function createGroup(
  body: CreateGroupRequest,
  options?: RequestOptions,
): Promise<GroupResponse> {
  return request<GroupResponse>("/api/groups", { ...options, method: "POST", body });
}

/** Public invite preview for the landing page — works without a session. */
export function fetchInvitePreview(
  token: string,
  options?: RequestOptions,
): Promise<InvitePreviewResponse> {
  return request<InvitePreviewResponse>(`/api/groups/invites/${encodeURIComponent(token)}`, {
    ...options,
    allowUnauthorized: true,
  });
}

export function acceptInvite(
  body: AcceptInviteRequest,
  options?: RequestOptions,
): Promise<AcceptInviteResponse> {
  return request<AcceptInviteResponse>("/api/groups/invites/accept", {
    ...options,
    method: "POST",
    body,
  });
}

export function fetchGroup(groupId: string, options?: RequestOptions): Promise<GroupDetailResponse> {
  return request<GroupDetailResponse>(`/api/groups/${groupId}`, options);
}

export function updateGroup(
  groupId: string,
  body: UpdateGroupRequest,
  options?: RequestOptions,
): Promise<GroupResponse> {
  return request<GroupResponse>(`/api/groups/${groupId}`, { ...options, method: "PATCH", body });
}

export function deleteGroup(groupId: string, options?: RequestOptions): Promise<void> {
  return request<void>(`/api/groups/${groupId}`, { ...options, method: "DELETE" });
}

export function fetchGroupMembers(
  groupId: string,
  options?: RequestOptions,
): Promise<GroupMemberListResponse> {
  return request<GroupMemberListResponse>(`/api/groups/${groupId}/members`, options);
}

export function updateMemberRole(
  groupId: string,
  userId: string,
  body: UpdateMemberRoleRequest,
  options?: RequestOptions,
): Promise<GroupMemberResponse> {
  return request<GroupMemberResponse>(`/api/groups/${groupId}/members/${userId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

/** Also used to leave a group (pass your own user id). */
export function removeGroupMember(
  groupId: string,
  userId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/members/${userId}`, {
    ...options,
    method: "DELETE",
  });
}

export function fetchGroupInvites(
  groupId: string,
  query: Partial<PaginationQuery> = {},
  options?: RequestOptions,
): Promise<GroupInviteListResponse> {
  return request<GroupInviteListResponse>(
    `/api/groups/${groupId}/invites${queryString({ limit: query.limit, offset: query.offset })}`,
    options,
  );
}

export function createGroupInvite(
  groupId: string,
  body: CreateInviteRequest,
  options?: RequestOptions,
): Promise<GroupInviteResponse> {
  return request<GroupInviteResponse>(`/api/groups/${groupId}/invites`, {
    ...options,
    method: "POST",
    body,
  });
}

export function revokeGroupInvite(
  groupId: string,
  inviteId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/invites/${inviteId}`, {
    ...options,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* recipes                                                                    */
/* -------------------------------------------------------------------------- */

export function fetchRecipes(
  groupId: string,
  query: Partial<RecipeListQuery> = {},
  options?: RequestOptions,
): Promise<RecipeListResponse> {
  return request<RecipeListResponse>(
    `/api/groups/${groupId}/recipes${queryString({
      q: query.q,
      tags: query.tags,
      collectionId: query.collectionId,
      maxMinutes: query.maxMinutes,
      difficulty: query.difficulty,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    })}`,
    options,
  );
}

export function createRecipe(
  groupId: string,
  body: CreateRecipeRequest,
  options?: RequestOptions,
): Promise<RecipeResponse> {
  return request<RecipeResponse>(`/api/groups/${groupId}/recipes`, {
    ...options,
    method: "POST",
    body,
  });
}

export function fetchRecipe(
  groupId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<RecipeResponse> {
  return request<RecipeResponse>(`/api/groups/${groupId}/recipes/${recipeId}`, options);
}

export function updateRecipe(
  groupId: string,
  recipeId: string,
  body: UpdateRecipeRequest,
  options?: RequestOptions,
): Promise<RecipeResponse> {
  return request<RecipeResponse>(`/api/groups/${groupId}/recipes/${recipeId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteRecipe(
  groupId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/recipes/${recipeId}`, {
    ...options,
    method: "DELETE",
  });
}

/** Recipe photo upload (camera or gallery). Max 15 MB, type sniffed server-side. */
export function uploadRecipeImage(
  groupId: string,
  recipeId: string,
  file: File,
  options?: RequestOptions,
): Promise<UploadResponse> {
  return request<UploadResponse>(`/api/groups/${groupId}/recipes/${recipeId}/image`, {
    ...options,
    method: "POST",
    form: fileForm(file),
  });
}

/** Server-side scaling so client and server always agree on rounding. */
export function fetchScaledRecipe(
  groupId: string,
  recipeId: string,
  servings: number,
  options?: RequestOptions,
): Promise<ScaledRecipeResponse> {
  return request<ScaledRecipeResponse>(
    `/api/groups/${groupId}/recipes/${recipeId}/scale${queryString({ servings })}`,
    options,
  );
}

/* -------------------------------------------------------------------------- */
/* tags                                                                       */
/* -------------------------------------------------------------------------- */

export function fetchTags(groupId: string, options?: RequestOptions): Promise<TagListResponse> {
  return request<TagListResponse>(`/api/groups/${groupId}/tags`, options);
}

export function createTag(
  groupId: string,
  body: CreateTagRequest,
  options?: RequestOptions,
): Promise<TagResponse> {
  return request<TagResponse>(`/api/groups/${groupId}/tags`, { ...options, method: "POST", body });
}

export function updateTag(
  groupId: string,
  tagId: string,
  body: UpdateTagRequest,
  options?: RequestOptions,
): Promise<TagResponse> {
  return request<TagResponse>(`/api/groups/${groupId}/tags/${tagId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteTag(
  groupId: string,
  tagId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/tags/${tagId}`, { ...options, method: "DELETE" });
}

/* -------------------------------------------------------------------------- */
/* collections                                                                */
/* -------------------------------------------------------------------------- */

export function fetchCollections(
  groupId: string,
  options?: RequestOptions,
): Promise<CollectionListResponse> {
  return request<CollectionListResponse>(`/api/groups/${groupId}/collections`, options);
}

export function createCollection(
  groupId: string,
  body: CreateCollectionRequest,
  options?: RequestOptions,
): Promise<CollectionResponse> {
  return request<CollectionResponse>(`/api/groups/${groupId}/collections`, {
    ...options,
    method: "POST",
    body,
  });
}

export function fetchCollection(
  groupId: string,
  collectionId: string,
  options?: RequestOptions,
): Promise<CollectionDetailResponse> {
  return request<CollectionDetailResponse>(
    `/api/groups/${groupId}/collections/${collectionId}`,
    options,
  );
}

export function updateCollection(
  groupId: string,
  collectionId: string,
  body: UpdateCollectionRequest,
  options?: RequestOptions,
): Promise<CollectionResponse> {
  return request<CollectionResponse>(`/api/groups/${groupId}/collections/${collectionId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteCollection(
  groupId: string,
  collectionId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/collections/${collectionId}`, {
    ...options,
    method: "DELETE",
  });
}

/** Idempotent. */
export function addRecipeToCollection(
  groupId: string,
  collectionId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(
    `/api/groups/${groupId}/collections/${collectionId}/recipes/${recipeId}`,
    { ...options, method: "PUT" },
  );
}

export function removeRecipeFromCollection(
  groupId: string,
  collectionId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(
    `/api/groups/${groupId}/collections/${collectionId}/recipes/${recipeId}`,
    { ...options, method: "DELETE" },
  );
}

/* -------------------------------------------------------------------------- */
/* imports (every source produces an editable draft)                          */
/* -------------------------------------------------------------------------- */

export function importFromUrl(
  groupId: string,
  body: ImportUrlRequest,
  options?: RequestOptions,
): Promise<ImportDraftResponse> {
  return request<ImportDraftResponse>(`/api/groups/${groupId}/imports/url`, {
    ...options,
    method: "POST",
    body,
  });
}

/** Photo of a recipe -> server-side OCR (sharp + native tesseract, deu+eng) -> draft. */
export function importFromImage(
  groupId: string,
  file: File,
  options?: RequestOptions,
): Promise<ImportDraftResponse> {
  return request<ImportDraftResponse>(`/api/groups/${groupId}/imports/image`, {
    ...options,
    method: "POST",
    form: fileForm(file),
  });
}

/** PDF -> text layer first, rasterize + OCR as fallback -> draft. */
export function importFromPdf(
  groupId: string,
  file: File,
  options?: RequestOptions,
): Promise<ImportDraftResponse> {
  return request<ImportDraftResponse>(`/api/groups/${groupId}/imports/pdf`, {
    ...options,
    method: "POST",
    form: fileForm(file),
  });
}

export function importFromText(
  groupId: string,
  body: ImportTextRequest,
  options?: RequestOptions,
): Promise<ImportDraftResponse> {
  return request<ImportDraftResponse>(`/api/groups/${groupId}/imports/text`, {
    ...options,
    method: "POST",
    body,
  });
}

export function fetchImportDrafts(
  groupId: string,
  query: Partial<ImportDraftListQuery> = {},
  options?: RequestOptions,
): Promise<ImportDraftListResponse> {
  return request<ImportDraftListResponse>(
    `/api/groups/${groupId}/imports${queryString({
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    })}`,
    options,
  );
}

export function fetchImportDraft(
  groupId: string,
  draftId: string,
  options?: RequestOptions,
): Promise<ImportDraftResponse> {
  return request<ImportDraftResponse>(`/api/groups/${groupId}/imports/${draftId}`, options);
}

export function updateImportDraft(
  groupId: string,
  draftId: string,
  body: UpdateImportDraftRequest,
  options?: RequestOptions,
): Promise<ImportDraftResponse> {
  return request<ImportDraftResponse>(`/api/groups/${groupId}/imports/${draftId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

/** "Speichern" in the review screen: writes the real recipe. */
export function commitImportDraft(
  groupId: string,
  draftId: string,
  body: CommitImportDraftRequest = {},
  options?: RequestOptions,
): Promise<CommitImportDraftResponse> {
  return request<CommitImportDraftResponse>(`/api/groups/${groupId}/imports/${draftId}/commit`, {
    ...options,
    method: "POST",
    body,
  });
}

export function deleteImportDraft(
  groupId: string,
  draftId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/imports/${draftId}`, {
    ...options,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* shopping lists                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every MUTATION below returns the whole `ShoppingListDetailResponse`, not just the
 * touched item. The caller writes that payload straight into the query cache, which is
 * what keeps an optimistic offline edit from drifting: merging means one added line can
 * change a different one, so a patch-in-place would be wrong.
 *
 * `mutationId` is a client-generated uuid that makes a replay after an offline spell
 * safe (the API remembers applied ids per list). Pass one for anything queued.
 */
function shoppingBase(groupId: string, listId?: string): string {
  const base = `/api/groups/${groupId}/shopping-lists`;
  return listId === undefined ? base : `${base}/${listId}`;
}

export function fetchShoppingLists(
  groupId: string,
  options?: RequestOptions,
): Promise<ShoppingListListResponse> {
  return request<ShoppingListListResponse>(shoppingBase(groupId), options);
}

export function createShoppingList(
  groupId: string,
  body: CreateShoppingListRequest,
  options?: RequestOptions,
): Promise<ShoppingListResponse> {
  return request<ShoppingListResponse>(shoppingBase(groupId), {
    ...options,
    method: "POST",
    body,
  });
}

export function fetchShoppingList(
  groupId: string,
  listId: string,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(shoppingBase(groupId, listId), options);
}

export function updateShoppingList(
  groupId: string,
  listId: string,
  body: UpdateShoppingListRequest,
  options?: RequestOptions,
): Promise<ShoppingListResponse> {
  return request<ShoppingListResponse>(shoppingBase(groupId, listId), {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteShoppingList(
  groupId: string,
  listId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(shoppingBase(groupId, listId), { ...options, method: "DELETE" });
}

export function addShoppingItems(
  groupId: string,
  listId: string,
  body: AddShoppingItemsRequest,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(`${shoppingBase(groupId, listId)}/items`, {
    ...options,
    method: "POST",
    body,
  });
}

export function updateShoppingItem(
  groupId: string,
  listId: string,
  itemId: string,
  body: UpdateShoppingItemRequest,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `${shoppingBase(groupId, listId)}/items/${itemId}`,
    { ...options, method: "PATCH", body },
  );
}

/** Removes a line without counting it as bought. Idempotent, so safe to replay. */
export function deleteShoppingItem(
  groupId: string,
  listId: string,
  itemId: string,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `${shoppingBase(groupId, listId)}/items/${itemId}`,
    { ...options, method: "DELETE" },
  );
}

/** Checks a line off: it leaves the list and appears under "Häufig gekauft". */
export function checkShoppingItem(
  groupId: string,
  listId: string,
  itemId: string,
  body: CheckShoppingItemRequest = {},
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `${shoppingBase(groupId, listId)}/items/${itemId}/check`,
    { ...options, method: "POST", body },
  );
}

export function clearShoppingList(
  groupId: string,
  listId: string,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(`${shoppingBase(groupId, listId)}/items`, {
    ...options,
    method: "DELETE",
  });
}

export function addRecipeToShoppingList(
  groupId: string,
  listId: string,
  body: AddRecipeToShoppingListRequest,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(`${shoppingBase(groupId, listId)}/recipes`, {
    ...options,
    method: "POST",
    body,
  });
}

/** Re-adds a "Häufig gekauft" suggestion, deliberately without an amount. */
export function addShoppingCatalogEntry(
  groupId: string,
  listId: string,
  entryId: string,
  body: CheckShoppingItemRequest = {},
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `${shoppingBase(groupId, listId)}/catalog/${entryId}`,
    { ...options, method: "POST", body },
  );
}

/** "Nicht mehr vorschlagen". Idempotent. */
export function deleteShoppingCatalogEntry(
  groupId: string,
  listId: string,
  entryId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`${shoppingBase(groupId, listId)}/catalog/${entryId}`, {
    ...options,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* grouped facade (nice for autocomplete: api.recipes.list(...))              */
/* -------------------------------------------------------------------------- */

export const api = {
  health: fetchHealth,
  auth: {
    register: registerAccount,
    login: loginWithPassword,
    logout,
    me: fetchMe,
    updateProfile,
    changePassword,
    requestPasswordReset,
    resetPassword,
    requestEmailVerification,
    confirmEmailVerification,
    sessions: fetchSessions,
    revokeSession,
    oauthStartUrl,
    fetchOAuthStartUrl,
    startOAuth,
    oauthProviders: fetchOAuthProviders,
    startOAuthLink,
    unlinkOAuthProvider,
  },
  groups: {
    list: fetchGroups,
    create: createGroup,
    detail: fetchGroup,
    update: updateGroup,
    remove: deleteGroup,
    members: fetchGroupMembers,
    updateMemberRole,
    removeMember: removeGroupMember,
    invites: fetchGroupInvites,
    createInvite: createGroupInvite,
    revokeInvite: revokeGroupInvite,
    invitePreview: fetchInvitePreview,
    acceptInvite,
  },
  recipes: {
    list: fetchRecipes,
    create: createRecipe,
    detail: fetchRecipe,
    update: updateRecipe,
    remove: deleteRecipe,
    uploadImage: uploadRecipeImage,
    scale: fetchScaledRecipe,
  },
  tags: {
    list: fetchTags,
    create: createTag,
    update: updateTag,
    remove: deleteTag,
  },
  collections: {
    list: fetchCollections,
    create: createCollection,
    detail: fetchCollection,
    update: updateCollection,
    remove: deleteCollection,
    addRecipe: addRecipeToCollection,
    removeRecipe: removeRecipeFromCollection,
  },
  shopping: {
    lists: fetchShoppingLists,
    createList: createShoppingList,
    detail: fetchShoppingList,
    updateList: updateShoppingList,
    removeList: deleteShoppingList,
    addItems: addShoppingItems,
    updateItem: updateShoppingItem,
    removeItem: deleteShoppingItem,
    check: checkShoppingItem,
    clear: clearShoppingList,
    addRecipe: addRecipeToShoppingList,
    addSuggestion: addShoppingCatalogEntry,
    removeSuggestion: deleteShoppingCatalogEntry,
  },
  imports: {
    fromUrl: importFromUrl,
    fromImage: importFromImage,
    fromPdf: importFromPdf,
    fromText: importFromText,
    list: fetchImportDrafts,
    detail: fetchImportDraft,
    update: updateImportDraft,
    commit: commitImportDraft,
    remove: deleteImportDraft,
  },
} as const;
