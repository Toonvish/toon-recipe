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
  type CardListResponse,
  type CardResponse,
  type ChangePasswordRequest,
  type CheckShoppingItemRequest,
  type CollectionDetailResponse,
  type CollectionListResponse,
  type CollectionResponse,
  type CommitImportDraftRequest,
  type CommitImportDraftResponse,
  type CreateCardRequest,
  type CreateCollectionRequest,
  type CreateGroupRequest,
  type CreateInviteRequest,
  type CreateMealPlanEntryRequest,
  type CreateRecipeRequest,
  type CreateShoppingListRequest,
  type CreateTagRequest,
  type EmailVerificationRequestResponse,
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
  type MarkCookedRequest,
  type MealPlanEntryResponse,
  type MealPlanRangeQuery,
  type MealPlanRangeResponse,
  type MeResponse,
  type OAuthProvider,
  type OAuthProvidersResponse,
  type OAuthStartResponse,
  type PaginationQuery,
  type PlanShoppingPreviewResponse,
  type RecipeCookedResponse,
  type RecipeListQuery,
  type RecipeListResponse,
  type RecipeResponse,
  type RegisterRequest,
  type ResetPasswordRequest,
  type ScaledRecipeResponse,
  type SessionListResponse,
  type ShoppingBoughtListResponse,
  type ShoppingCatalogListResponse,
  type ShoppingListDetailResponse,
  type ShoppingListListResponse,
  type ShoppingListResponse,
  type TagListResponse,
  type TagResponse,
  type UpdateCardRequest,
  type UpdateCollectionRequest,
  type UpdateGroupRequest,
  type UpdateImportDraftRequest,
  type UpdateMealPlanEntryRequest,
  type UpdateMemberRoleRequest,
  type UpdateProfileRequest,
  type UpdateRecipeRequest,
  type UpdateShoppingCatalogEntryRequest,
  type UpdateShoppingItemRequest,
  type UpdateShoppingListRequest,
  type UpdateTagRequest,
  type UploadResponse,
  type UserResponse,
  type VerifyEmailRequest,
} from "@toon/shared";
import { getLocale, translate } from "@/lib/i18n/store.ts";

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

/** User-facing message for any thrown value, in the active locale. Safe to render directly. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return translate("ui.error.unknown");
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

  // Accept-Language is CORS-safelisted, so this adds no preflight and no CORS
  // change — the server negotiates `message`'s locale from it (docs/i18n.md §4).
  const headers: Record<string, string> = { Accept: "application/json", "Accept-Language": getLocale() };
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
      message: translate("ui.error.network"),
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
      return translate("ui.error.unauthorized");
    case 403:
      return translate("ui.error.forbidden");
    case 404:
      return translate("ui.error.notFound");
    case 409:
      return translate("ui.error.conflict");
    case 413:
      return translate("ui.error.payloadTooLarge");
    case 415:
      return translate("ui.error.unsupportedMediaType");
    case 422:
      return translate("ui.error.validationFailed");
    default:
      return status >= 500 ? translate("ui.error.serverError") : raw.slice(0, 200) || translate("ui.error.requestFailed");
  }
}

/** Client-side guard so a 15 MB+ file never leaves the phone. */
function assertUploadSize(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError({
      code: "payload_too_large",
      status: 413,
      message: translate("ui.upload.tooLarge", {
        filename: file.name,
        size: (file.size / (1024 * 1024)).toFixed(1),
      }),
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

/**
 * Mails a confirmation link to the signed-in account's address.
 *
 * `mailDelivery` says whether it really went out — a send can fail without the
 * request failing, so a resolved promise is NOT "the mail is on its way".
 */
export function requestEmailVerification(
  options?: RequestOptions,
): Promise<EmailVerificationRequestResponse> {
  return request<EmailVerificationRequestResponse>("/api/auth/email/verify/request", {
    ...options,
    method: "POST",
    body: {},
  });
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

/**
 * "Gekocht": appends a cook-log row, bumps `recipes.lastCookedAt` and — when the
 * recipe was on the plan that day — stamps the plan entry's `cookedAt` too. Body is
 * optional-everything, so a bare tap (`{}`) works.
 */
export function markRecipeCooked(
  groupId: string,
  recipeId: string,
  body: MarkCookedRequest = {},
  options?: RequestOptions,
): Promise<RecipeCookedResponse> {
  return request<RecipeCookedResponse>(`/api/groups/${groupId}/recipes/${recipeId}/cooked`, {
    ...options,
    method: "POST",
    body,
  });
}

/**
 * Undoes the CALLER's own most recent "Gekocht" tap for this recipe, within the
 * server's short undo window. Recomputes `lastCookedAt` from what remains in the log.
 *
 * Answers **204, no body** (docs/API.md), so this resolves to `undefined` — the
 * caller refetches the recipe rather than reading a new `lastCookedAt` off the
 * response, because the recomputed value may be another member's cook.
 */
export function undoRecipeCooked(
  groupId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/recipes/${recipeId}/cooked`, {
    ...options,
    method: "DELETE",
  });
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

/** One membership row: PUT adds it, DELETE removes it, both idempotent. */
function collectionRecipe(
  method: "PUT" | "DELETE",
  groupId: string,
  collectionId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/collections/${collectionId}/recipes/${recipeId}`, {
    ...options,
    method,
  });
}

/** Idempotent. */
export function addRecipeToCollection(
  groupId: string,
  collectionId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<void> {
  return collectionRecipe("PUT", groupId, collectionId, recipeId, options);
}

export function removeRecipeFromCollection(
  groupId: string,
  collectionId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<void> {
  return collectionRecipe("DELETE", groupId, collectionId, recipeId, options);
}

/* -------------------------------------------------------------------------- */
/* meal planner ("Wochenplan")                                                */
/* -------------------------------------------------------------------------- */

/**
 * A flat, `(plannedOn, position)`-ordered range — never the `{ items, total, limit,
 * offset }` envelope, because a week is bounded by its own `from`/`to`, not a page.
 * `from`/`to` are `YYYY-MM-DD` calendar dates the CLIENT computed
 * (`packages/shared/src/calendar.ts`); the server never derives a date from its clock.
 */
export function fetchPlanRange(
  groupId: string,
  query: MealPlanRangeQuery,
  options?: RequestOptions,
): Promise<MealPlanRangeResponse> {
  return request<MealPlanRangeResponse>(
    `/api/groups/${groupId}/plan${queryString({ from: query.from, to: query.to })}`,
    options,
  );
}

export function createPlanEntry(
  groupId: string,
  body: CreateMealPlanEntryRequest,
  options?: RequestOptions,
): Promise<MealPlanEntryResponse> {
  return request<MealPlanEntryResponse>(`/api/groups/${groupId}/plan`, {
    ...options,
    method: "POST",
    body,
  });
}

/** Moving an entry to another day is a PATCH of `plannedOn` — that is the drag-and-drop. */
export function updatePlanEntry(
  groupId: string,
  entryId: string,
  body: UpdateMealPlanEntryRequest,
  options?: RequestOptions,
): Promise<MealPlanEntryResponse> {
  return request<MealPlanEntryResponse>(`/api/groups/${groupId}/plan/${entryId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deletePlanEntry(
  groupId: string,
  entryId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/groups/${groupId}/plan/${entryId}`, {
    ...options,
    method: "DELETE",
  });
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

/**
 * Hides or unhides a "Häufig gekauft" entry WITHOUT losing its `useCount` — the
 * long-press action the redesign replaces the per-chip `×` with. The existing
 * `deleteShoppingCatalogEntry` ("nicht mehr vorschlagen") stays as it is; this is a
 * different, reversible action.
 */
export function setShoppingCatalogEntryHidden(
  groupId: string,
  listId: string,
  entryId: string,
  body: UpdateShoppingCatalogEntryRequest,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `${shoppingBase(groupId, listId)}/catalog/${entryId}`,
    { ...options, method: "PATCH", body },
  );
}

/** `GET …/shopping-lists/:listId/catalog` query — the "Show all" sheet. */
export type ShoppingCatalogPageQuery = Partial<PaginationQuery> & {
  includeHidden?: boolean;
};

/** The full "Häufig gekauft" sheet — every entry, hidden ones included on request. */
export function fetchShoppingCatalogPage(
  groupId: string,
  listId: string,
  query: ShoppingCatalogPageQuery = {},
  options?: RequestOptions,
): Promise<ShoppingCatalogListResponse> {
  return request<ShoppingCatalogListResponse>(
    `${shoppingBase(groupId, listId)}/catalog${queryString({
      includeHidden: query.includeHidden ? 1 : undefined,
      limit: query.limit,
      offset: query.offset,
    })}`,
    options,
  );
}

/**
 * `GET …/shopping-lists/bought` — the cross-list "Bought today" / history feed.
 * `listId` omitted means the whole group, which is what the overview panel wants.
 */
export type ShoppingBoughtHistoryQuery = Partial<PaginationQuery> & {
  listId?: string;
};

export function fetchShoppingBoughtHistory(
  groupId: string,
  query: ShoppingBoughtHistoryQuery = {},
  options?: RequestOptions,
): Promise<ShoppingBoughtListResponse> {
  return request<ShoppingBoughtListResponse>(
    `/api/groups/${groupId}/shopping-lists/bought${queryString({
      listId: query.listId,
      limit: query.limit,
      offset: query.offset,
    })}`,
    options,
  );
}

/**
 * `Clear bought`: stamps the per-list watermark. The log itself is never deleted —
 * the history panel reads past the watermark, so nothing bought is forgotten.
 */
export function clearBoughtSection(
  groupId: string,
  listId: string,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(`${shoppingBase(groupId, listId)}/bought/clear`, {
    ...options,
    method: "POST",
  });
}

/**
 * Undoes one "Bought today" row: deletes the log row and re-merges the amount back
 * onto the list (folding into whatever is already there under the same
 * `(name, unit)` bucket — nothing is lost, nothing is invented).
 */
export function undoBoughtItem(
  groupId: string,
  listId: string,
  boughtId: string,
  body: CheckShoppingItemRequest = {},
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `${shoppingBase(groupId, listId)}/bought/${boughtId}/undo`,
    { ...options, method: "POST", body },
  );
}

/**
 * Removes a recipe from "Recipes on this list". Deletes only the ingredient lines
 * that came SOLELY from this recipe; a line still shared with another recipe on the
 * list keeps its quantity unchanged. Online-only — never queued (see
 * features/shopping/lib/offline.ts): a bulk delete replayed against a list the user
 * can no longer see is exactly the class the offline outbox excludes.
 */
export function removeRecipeFromShoppingList(
  groupId: string,
  listId: string,
  recipeId: string,
  options?: RequestOptions,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `${shoppingBase(groupId, listId)}/recipes/${recipeId}`,
    { ...options, method: "DELETE" },
  );
}

/**
 * "From this week's plan": which planned recipes are missing from this list, and by
 * how much. `from`/`to` are both required `YYYY-MM-DD` calendar dates — the server
 * never guesses where a week starts; the client sends `localWeekRange(new Date())`.
 */
export function fetchPlanShoppingPreview(
  groupId: string,
  listId: string,
  range: { from: string; to: string },
  options?: RequestOptions,
): Promise<PlanShoppingPreviewResponse> {
  return request<PlanShoppingPreviewResponse>(
    `${shoppingBase(groupId, listId)}/from-plan${queryString({ from: range.from, to: range.to })}`,
    options,
  );
}

/* -------------------------------------------------------------------------- */
/* saved cards (loyalty barcodes — the user's own, NOT a group's)              */
/* -------------------------------------------------------------------------- */

/**
 * The wallet, most recently used first.
 *
 * Note the missing `groupId`: cards belong to the signed-in user, so these five
 * calls are the only content endpoints in this file with no group in their path
 * (see packages/shared/src/schemas/card.ts for why).
 */
export function fetchCards(options?: RequestOptions): Promise<CardListResponse> {
  return request<CardListResponse>("/api/cards", options);
}

export function createCard(
  body: CreateCardRequest,
  options?: RequestOptions,
): Promise<CardResponse> {
  return request<CardResponse>("/api/cards", { ...options, method: "POST", body });
}

export function updateCard(
  cardId: string,
  body: UpdateCardRequest,
  options?: RequestOptions,
): Promise<CardResponse> {
  return request<CardResponse>(`/api/cards/${cardId}`, { ...options, method: "PATCH", body });
}

export function deleteCard(cardId: string, options?: RequestOptions): Promise<void> {
  return request<void>(`/api/cards/${cardId}`, { ...options, method: "DELETE" });
}

/**
 * Records that a card was SHOWN — what the wallet's ordering is built on.
 *
 * Fire-and-forget at every call site: it is a 403 for an account with an
 * unconfirmed address and a network error at a till with no signal, and neither
 * may stop the barcode from being on screen.
 */
export function markCardUsed(cardId: string, options?: RequestOptions): Promise<CardResponse> {
  return request<CardResponse>(`/api/cards/${cardId}/used`, { ...options, method: "POST" });
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
    markCooked: markRecipeCooked,
    undoCooked: undoRecipeCooked,
  },
  plan: {
    range: fetchPlanRange,
    create: createPlanEntry,
    update: updatePlanEntry,
    remove: deletePlanEntry,
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
    setSuggestionHidden: setShoppingCatalogEntryHidden,
    catalogPage: fetchShoppingCatalogPage,
    boughtHistory: fetchShoppingBoughtHistory,
    clearBought: clearBoughtSection,
    undoBought: undoBoughtItem,
    removeRecipe: removeRecipeFromShoppingList,
    fromPlan: fetchPlanShoppingPreview,
  },
  cards: {
    list: fetchCards,
    create: createCard,
    update: updateCard,
    remove: deleteCard,
    markUsed: markCardUsed,
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
