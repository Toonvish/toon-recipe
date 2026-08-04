# toon-recipe API contract

**Authoritative.** The frontend agents build against this document, the API agents implement it.
Every request/response schema name below is exported from `@toon/shared`
(`packages/shared/src/schemas/*.ts`). Do not invent shapes — extend the shared package instead
(and only additively).

Base URL: `PUBLIC_API_URL` (default `http://localhost:3001`). Everything below `/api` is JSON.

## Conventions

- **Content type**: `application/json` (exception: the three upload endpoints use
  `multipart/form-data` with a single `file` field, `ImportFileFieldName`).
- **Errors**: always `ApiError` = `{ error: { code, message, details? } }`. `code` values come from
  `ERROR_CODES`. Stack traces are never returned.
- **Auth**: opaque session id in an `HttpOnly; SameSite=Lax; Secure(prod); Path=/` cookie named
  `toon_session`, 30-day sliding expiry. Browsers must send `credentials: "include"`.
- **Auth levels**:
  | level | meaning |
  | --- | --- |
  | `public` | no session needed |
  | `session` | valid session required (401 otherwise) |
  | `group:member` | session + membership in `:groupId` (403 otherwise) |
  | `group:admin` | session + role `admin` or `owner` |
  | `group:owner` | session + role `owner` |
- **Group middleware**: `requireGroupRole(role)` in `apps/api/src/middleware/group.ts`, applied as
  router-level middleware. Never check membership inline.
- **Ids**: `crypto.randomUUID()` strings. **Timestamps**: ISO-8601 strings on the wire, integer unix
  ms in SQLite.
- **Lists**: `{ items, total, limit, offset }` (`listResponse(...)`), `limit` default 24, max 100.
- **Uploads**: max 15 MB (`MAX_UPLOAD_BYTES`), real content type sniffed server-side, stored as
  `data/uploads/<uuid>.<ext>`, served publicly from `GET /uploads/:filename`.
- **Status codes**: `200` read/update, `201` create, `204` delete/no-body, `400` bad request,
  `401` unauthorized, `403` forbidden, `404` not found, `409` conflict, `413` too large,
  `415` unsupported media type, `422` validation/parse failure, `500` internal.

## Health

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | public | – | `HealthResponse` | 200 |
| GET | `/uploads/:filename` | public | – | binary | 200, 404 |

## Auth — `apps/api/src/routes/auth.ts`

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | public | `RegisterRequest` | `AuthSessionResponse` | 201, 409 `email_taken`, 422 |
| POST | `/api/auth/login` | public | `LoginRequest` | `AuthSessionResponse` | 200, 401 `invalid_credentials`, 422 |
| POST | `/api/auth/logout` | session | – | – | 204, 401 |
| GET | `/api/auth/me` | session | – | `MeResponse` | 200, 401 |
| PATCH | `/api/auth/me` | session | `UpdateProfileRequest` | `UserResponse` | 200, 401, 422 |
| POST | `/api/auth/password` | session | `ChangePasswordRequest` | – | 204, 401 `invalid_credentials`, 422 |
| GET | `/api/auth/sessions` | session | – | `SessionListResponse` | 200, 401 |
| DELETE | `/api/auth/sessions/:sessionId` | session | – | – | 204, 401, 404 |
| GET | `/api/auth/oauth` | public (session optional) | – | `OAuthProvidersResponse` | 200 |
| GET | `/api/auth/oauth/:provider` | public | `OAuthProvider` in path | 302 to provider (`OAuthStartResponse` when `?json=1`) | 302, 400 `oauth_not_configured` (only with `?json=1`) |
| GET | `/api/auth/oauth/:provider/link` | session | `OAuthProvider` in path, `?next=` | 302 to provider (`OAuthStartResponse` when `?json=1`) | 302, 400 `oauth_not_configured`, 401 |
| DELETE | `/api/auth/oauth/:provider` | session | – | – | 204, 401, 404, 409 `last_login_method` |
| GET | `/api/auth/oauth/:provider/callback` | public | provider query (`code`, `state`) | 302 to `WEB_ORIGIN` | 302, 400 `oauth_failed` |

Notes
- `RegisterRequest.inviteToken` joins that group instead of creating "Meine Rezepte".
- **Registration stores `emailVerified: false`.** There is no confirmation-mail flow, so
  self-registration proves nothing about who owns the address.
- **OAuth never auto-links on an e-mail match.** State + PKCE live in short-lived `HttpOnly`
  cookies. A known `oauth_accounts(provider, provider_user_id)` logs that user in; an unknown
  identity whose e-mail is free creates a user (`emailVerified` from the provider,
  `passwordHash: null`) plus the first group; an unknown identity whose e-mail already has a local
  account is **409 `email_taken`**. Auto-linking on the old `emailVerified` flag meant that
  pre-registering someone else's address captured their later Google/GitHub login — a full account
  takeover. To use both methods, sign in and then `GET /api/auth/oauth/:provider/link` (same arctic
  handshake plus a `toon_oauth_intent=link` cookie); it redirects back to `?next=` with
  `?linked=<provider>` or `?error=<code>`.
- `GET /api/auth/oauth/:provider` **redirects** a browser to `/login?error=oauth_not_configured`
  when the provider has no credentials; only `?json=1` gets the 400. (A default install ships empty
  client ids, and raw JSON on the API origin is a dead end for the user.)
- `?next=` is validated with `safeNextPath`: relative paths only, and **no backslashes, control
  characters or spaces** — `new URL("/\evil.com", origin)` resolves to `http://evil.com/`.
- `DELETE /api/auth/sessions/:sessionId` takes the **handle** from `SessionListResponse`, never the
  raw session id (it would be written to the access log).
- Login is rate limited twice: `login:<ip>|<email>` (10/min) plus an IP-independent
  `login-email:<email>` (20/15 min). Forwarding headers are only trusted when `TRUST_PROXY=1`.
- `hasPassword: false` accounts may call `POST /api/auth/password` without `currentPassword`.

## Groups — `apps/api/src/routes/groups.ts`

Mounted at `/api/groups`. **Register the two `/invites/...` routes before `/:groupId`.**

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/groups` | session | – | `GroupListResponse` | 200, 401 |
| POST | `/api/groups` | session | `CreateGroupRequest` | `GroupResponse` | 201, 401, 422 |
| GET | `/api/groups/invites/:token` | public | – | `InvitePreviewResponse` | 200, 404 `invite_invalid`, 410→409 `invite_expired` |
| POST | `/api/groups/invites/accept` | session | `AcceptInviteRequest` | `AcceptInviteResponse` | 200, 401, 404 `invite_invalid`, 409 `invite_expired` |
| GET | `/api/groups/:groupId` | group:member | – | `GroupDetailResponse` | 200, 403, 404 |
| PATCH | `/api/groups/:groupId` | group:admin | `UpdateGroupRequest` | `GroupResponse` | 200, 403, 422 |
| DELETE | `/api/groups/:groupId` | group:owner | – | – | 204, 403 |
| GET | `/api/groups/:groupId/members` | group:member | – | `GroupMemberListResponse` | 200, 403 |
| PATCH | `/api/groups/:groupId/members/:userId` | group:admin (owner to grant `owner`) | `UpdateMemberRoleRequest` | `GroupMemberResponse` | 200, 403, 404, 409 `last_owner` |
| DELETE | `/api/groups/:groupId/members/:userId` | group:admin, or the member themself | – | – | 204, 403, 409 `last_owner` |
| GET | `/api/groups/:groupId/invites` | group:admin | `PaginationQuery` | `GroupInviteListResponse` | 200, 403 |
| POST | `/api/groups/:groupId/invites` | group:admin | `CreateInviteRequest` | `GroupInviteResponse` | 201, 403, 409 `conflict` (already a member), 422 |
| DELETE | `/api/groups/:groupId/invites/:inviteId` | group:admin | – | – | 204, 403, 404 |

Notes
- Creating a group makes the caller `owner` and sets `users.active_group_id`.
- Ownership transfer = `PATCH .../members/:userId {role:"owner"}`; the previous owner becomes `admin`.
- Invite tokens: 32-byte URL-safe random, 14-day expiry, `inviteUrl` = `${WEB_ORIGIN}/invite/<token>`.

## Recipes — `apps/api/src/routes/recipes.ts`

Mounted at `/api/groups/:groupId`, so this router also owns tags and collections.

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/groups/:groupId/recipes` | group:member | `RecipeListQuery` (query) | `RecipeListResponse` | 200, 403 |
| POST | `/api/groups/:groupId/recipes` | group:member | `CreateRecipeRequest` | `RecipeResponse` | 201, 403, 422 |
| GET | `/api/groups/:groupId/recipes/:recipeId` | group:member | – | `RecipeResponse` | 200, 403, 404 |
| PATCH | `/api/groups/:groupId/recipes/:recipeId` | group:member (author or admin) | `UpdateRecipeRequest` | `RecipeResponse` | 200, 403, 404, 422 |
| DELETE | `/api/groups/:groupId/recipes/:recipeId` | group:member (author or admin) | – | – | 204, 403, 404 |
| POST | `/api/groups/:groupId/recipes/:recipeId/image` | group:member | multipart `file` | `UploadResponse` | 200, 403, 413, 415 |
| GET | `/api/groups/:groupId/recipes/:recipeId/scale` | group:member | `ScaleRecipeQuery` (query) | `ScaledRecipeResponse` | 200, 403, 404, 422 |
| GET | `/api/groups/:groupId/tags` | group:member | – | `TagListResponse` | 200, 403 |
| POST | `/api/groups/:groupId/tags` | group:member | `CreateTagRequest` | `TagResponse` | 201, 403, 409 `tag_name_taken`, 422 |
| PATCH | `/api/groups/:groupId/tags/:tagId` | group:member | `UpdateTagRequest` | `TagResponse` | 200, 403, 404, 409 |
| DELETE | `/api/groups/:groupId/tags/:tagId` | group:admin | – | – | 204, 403, 404 |
| GET | `/api/groups/:groupId/collections` | group:member | – | `CollectionListResponse` | 200, 403 |
| POST | `/api/groups/:groupId/collections` | group:member | `CreateCollectionRequest` | `CollectionResponse` | 201, 403, 422 |
| GET | `/api/groups/:groupId/collections/:collectionId` | group:member | – | `CollectionDetailResponse` | 200, 403, 404 |
| PATCH | `/api/groups/:groupId/collections/:collectionId` | group:member | `UpdateCollectionRequest` | `CollectionResponse` | 200, 403, 404, 422 |
| DELETE | `/api/groups/:groupId/collections/:collectionId` | group:member (creator or admin) | – | – | 204, 403, 404 |
| PUT | `/api/groups/:groupId/collections/:collectionId/recipes/:recipeId` | group:member | – | – | 204, 403, 404 |
| DELETE | `/api/groups/:groupId/collections/:collectionId/recipes/:recipeId` | group:member | – | – | 204, 403, 404 |

Notes
- `CreateRecipeRequest.tags` are tag **names**; unknown names are created inside the group
  (`tags(group_id,name)` is unique, so upsert case-insensitively).
- `ingredients` / `steps` / `tags` / `collectionIds` are **replace-all** when present in a PATCH and
  untouched when absent. Positions are re-assigned from array order.
- `q` searches `recipes.title`, `recipes.description` and `recipe_ingredients.name` with LIKE
  (see the search-strategy comment in `src/db/schema.ts`; FTS5 is out of scope).
- `tags` in `RecipeListQuery` is a comma-separated list of tag **ids**; a recipe must carry all.
- `scale` uses `scaleIngredients` from `@toon/shared` so client and server agree.

## Imports — `apps/api/src/routes/imports.ts`

Mounted at `/api/groups/:groupId/imports`. **Every** import produces an `ImportDraft` that the user
edits in the review screen; nothing is written to `recipes` until `/commit`.

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/groups/:groupId/imports/url` | group:member | `ImportUrlRequest` | `ImportDraftResponse` | 201, 403, 422 `parse_failed`, 400 `fetch_failed` |
| POST | `/api/groups/:groupId/imports/image` | group:member | multipart `file` | `ImportDraftResponse` | 201, 403, 413, 415, 422 `ocr_failed` |
| POST | `/api/groups/:groupId/imports/pdf` | group:member | multipart `file` | `ImportDraftResponse` | 201, 403, 413, 415, 422 `pdf_no_text_layer` |
| POST | `/api/groups/:groupId/imports/text` | group:member | `ImportTextRequest` | `ImportDraftResponse` | 201, 403, 422 |
| POST | `/api/groups/:groupId/imports/file` | group:member | multipart `file` | `ImportDraftResponse` | 201, 403, 413, 415, 422 |
| GET | `/api/groups/:groupId/imports/:draftId/source` | group:member | – | binary | 200, 403, 404 |
| GET | `/api/groups/:groupId/imports` | group:member | `ImportDraftListQuery` (query) | `ImportDraftListResponse` | 200, 403 |
| GET | `/api/groups/:groupId/imports/:draftId` | group:member | – | `ImportDraftResponse` | 200, 403, 404 |
| PATCH | `/api/groups/:groupId/imports/:draftId` | group:member | `UpdateImportDraftRequest` | `ImportDraftResponse` | 200, 403, 404, 422 |
| POST | `/api/groups/:groupId/imports/:draftId/commit` | group:member | `CommitImportDraftRequest` | `CommitImportDraftResponse` | 201, 403, 404, 422 |
| DELETE | `/api/groups/:groupId/imports/:draftId` | group:member | – | – | 204, 403, 404 |

Notes
- `sourceType`: `url` for URL imports, `ocr` for image **and** PDF imports, `manual` for pasted text.
  `sourceMeta.method` disambiguates: `json-ld` \| `microdata` \| `selector` \| `pdf-text` \| `ocr` \| `manual`.
- URL pipeline: fetch → JSON-LD `@graph`/array-aware schema.org `Recipe` → microdata → site selectors
  (chefkoch.de, WP Recipe Maker for biancazapatka.com). Durations via `parseDuration`, yield via
  `parseServings`, ingredient lines via `parseIngredientLine`.
- PDF pipeline: text layer first (`unpdf`), rasterize + OCR only as fallback (`pdf-to-img` →
  `sharp` → `tesseract.js`). If rasterization is unavailable, answer
  `422 { code: "pdf_no_text_layer" }` with the actionable German message
  "Das PDF enthält keine Textebene. Bitte lade ein Foto der Seite hoch."
  TWO pdf.js COPIES: `unpdf` bundles pdf.js 6 and installs `globalThis.pdfjsWorker`; `pdfjs-dist` 5
  behind `pdf-to-img` version-checks that global and throws. `rasterizePdf()` therefore stashes and
  restores those globals and serializes both phases through one lock — without it EVERY scanned PDF
  answered `pdf_no_text_layer` / `rasterization_unavailable`. The regression test
  (`apps/api/test/import/pdf-rasterize.test.ts`) must never mock `pdf-to-img`.
- Every import endpoint is rate limited (`IMPORT_RULE`, 10 per user per minute → 429 `rate_limited`),
  and the OCR/PDF paths additionally hold one of `MAX_CONCURRENT_OCR` (2) process-wide slots → 429
  when full. `OCR_TIMEOUT_MS` (60 s) is a `Promise.race`, so a worker that ignores the abort signal
  still yields `504 ocr_failed` on time.
- `ParsedRecipe.sourceUrl` and `CreateRecipeRequest.sourceUrl` accept **http(s) only**
  (`HttpUrlSchema`); anything else is 422. They are rendered into `<a href>`, and a `javascript:`
  value stored by a member would run on the app origin with the reader's session.
- `POST /imports/file` is a convenience wrapper (added during integration): it sniffs the
  uploaded bytes and dispatches to the image or the PDF pipeline. `GET /imports/:draftId/source`
  serves the stored upload behind the membership check, so the review screen can show the
  original photo/PDF without a public URL.
- `confidence` mirrors `parsed.confidence.overall`; the review screen warns below 0.5.
- The URL importer refuses localhost / private / link-local targets (SSRF guard). For local
  testing only, `IMPORT_ALLOW_PRIVATE_HOSTS=1` disables that check; it is ignored when
  `NODE_ENV=production`.
- `/commit` writes the recipe, links tags/collections, sets `import_drafts.status = "reviewed"` and
  `import_drafts.recipe_id`.

## Tables (SQLite, `apps/api/src/db/schema.ts`)

`users`, `oauth_accounts`, `sessions`, `groups`, `group_members`, `group_invites`, `recipes`,
`recipe_ingredients`, `recipe_steps`, `tags`, `recipe_tags`, `collections`, `collection_recipes`,
`import_drafts`.

Unique indexes: `users.email`, `oauth_accounts(provider, provider_user_id)`,
`group_members(group_id, user_id)`, `tags(group_id, name)`, `group_invites.token`.
Composite primary keys: `recipe_tags(recipe_id, tag_id)`, `collection_recipes(collection_id, recipe_id)`.
All group-scoped tables cascade from `groups`; child rows cascade from `recipes`.

Account deletion is intentionally NOT exposed: `created_by`/`invited_by` cascade, so a future
"Konto löschen" flow must first transfer group ownership and re-assign authorship.
