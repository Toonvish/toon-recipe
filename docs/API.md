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
  `data/uploads/<uuid>.<ext>`. `GET /uploads/:filename` requires a **signature**
  (`?exp=<unix ms>&sig=<hmac>`, see "Uploads and signed URLs" below); import source scans are not
  served there at all. Every recipe carries a read-only `thumbnailUrl` — a generated 480 px WebP
  derivative for list screens, see the same section.
- **Status codes**: `200` read/update, `201` create, `204` delete/no-body, `400` bad request,
  `401` unauthorized, `403` forbidden, `404` not found, `409` conflict, `413` too large,
  `415` unsupported media type, `422` validation/parse failure, `500` internal.

## Health

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | public | – | `HealthResponse` | 200 |
| GET | `/uploads/:filename` | signature | `?exp` + `?sig` | binary | 200, 404 (missing/forged/expired signature, or no such file) |
| GET | `/uploads/:filename.thumb.webp` | signature | `?exp` + `?sig` | binary | 200 (built on demand; the original when it cannot be converted), 404 |

## Auth — `apps/api/src/routes/auth.ts`

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | public | `RegisterRequest` | `AuthSessionResponse` | 201, 409 `email_taken`, 422 |
| POST | `/api/auth/login` | public | `LoginRequest` | `AuthSessionResponse` | 200, 401 `invalid_credentials`, 422 |
| POST | `/api/auth/logout` | session | – | – | 204, 401 |
| GET | `/api/auth/me` | session | – | `MeResponse` | 200, 401 |
| PATCH | `/api/auth/me` | session | `UpdateProfileRequest` | `UserResponse` | 200, 401, 422 |
| POST | `/api/auth/password` | session | `ChangePasswordRequest` | – | 204, 401 `invalid_credentials`, 422 |
| POST | `/api/auth/password/forgot` | public | `ForgotPasswordRequest` | – | **always 204**, 422 (malformed address), 429 |
| POST | `/api/auth/password/reset` | public | `ResetPasswordRequest` | – | 204, 400 `reset_token_invalid`, 422, 429 |
| POST | `/api/auth/email/verify/request` | session | – | – | 204, 401, 409 `conflict` (already verified), 429 |
| POST | `/api/auth/email/verify/confirm` | public | `VerifyEmailRequest` | `UserResponse` | 200, 400 `verification_token_invalid`, 422, 429 |
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

### Password reset

- `POST /api/auth/password/forgot` answers **204 whether or not the address exists**, with an
  identical body and identical timing. Anything else would make it a user-enumeration oracle. A
  failed mail send is swallowed (logged) and still answers 204.
- Rate limited twice, like login: `password-forgot:<ip>` (5/15 min) plus an IP-independent
  `password-forgot-email:<email>` (3/15 min).
- `POST /api/auth/password/reset` consumes the token **once**, sets the hash via `Bun.password`, and
  **deletes every session of that user** — a stolen cookie must not survive a reset. It answers
  **204 and does NOT sign the user in**; the web app sends them to `/login?reset=1`.
- Unknown, expired and already-used tokens all answer the same `400 reset_token_invalid`. TTL is
  **1 hour** (contrast: invites are 14 days). Only a SHA-256 hash of the token is stored
  (`password_reset_tokens.token_hash`); a new request invalidates any outstanding one.
- The password rule is `PasswordSchema` from `@toon/shared` — the same one `register` uses.
- Operator escape hatch with no mailer at all: `bun run auth:reset-password <email> [--send]` mints a
  token and prints the URL.

### E-mail verification

- `POST /api/auth/email/verify/request` mails a link to the **session's own** address (authenticated,
  so it is not another enumeration oracle). 24 h TTL, hash-only storage, one live token per user.
- `POST /api/auth/email/verify/confirm` works **without a session** — the link is regularly opened on
  a different device — and sets `users.email_verified` **and** `users.email_verified_at` together
  (`markEmailVerified()` is the only writer). A token is bound to the address it was issued for, so
  it cannot verify an address that changed in the meantime.
- **A confirmed address still does NOT enable OAuth auto-linking.** `email_taken` remains the answer
  for a provider login on a taken address; `email_verified_at` is the timestamp such a feature would
  have to be gated on, not a switch that turns it on. Re-read the takeover note above first.

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
- PDF pipeline: text layer first (`unpdf`), rasterize + OCR only as fallback (`pdftoppm` →
  `sharp` → `tesseract`). If rasterization is unavailable, answer
  `422 { code: "pdf_no_text_layer" }` with the actionable German message
  "Das PDF enthält keine Textebene. Bitte lade ein Foto der Seite hoch."
  BOTH OCR STEPS ARE NATIVE SUBPROCESSES, not libraries: `tesseract` and poppler's `pdftoppm` must be
  installed on the host (the image installs `tesseract-ocr`, `tesseract-ocr-deu`, `tesseract-ocr-eng`
  and `poppler-utils`). A missing binary is the documented 422, not a crash. `sourceMeta.engine` is
  therefore `tesseract-native`. Tests stub rasterization via `setPdfRasterizer()` and must reset it;
  the regression test (`apps/api/test/import/pdf-rasterize.test.ts`) uses the real one and asserts the
  rendered page size, so a leaked stub cannot make it pass.
- Every import endpoint is rate limited (`IMPORT_RULE`, 10 per user per minute → 429 `rate_limited`),
  and the OCR/PDF paths additionally hold one of `MAX_CONCURRENT_OCR` (2) process-wide slots → 429
  when full. Since the engine went native that gate is also the cap on concurrent `tesseract`
  processes, i.e. the memory ceiling. `OCR_TIMEOUT_MS` (60 s) is a `Promise.race`, so an extraction
  that ignores the abort signal still yields `504 ocr_failed` on time — OCR itself now honours it
  (aborting kills the child), but `unpdf` does not.
- `ParsedRecipe.sourceUrl` and `CreateRecipeRequest.sourceUrl` accept **http(s) only**
  (`HttpUrlSchema`); anything else is 422. They are rendered into `<a href>`, and a `javascript:`
  value stored by a member would run on the app origin with the reader's session.
- `POST /imports/file` is a convenience wrapper (added during integration): it sniffs the
  uploaded bytes and dispatches to the image or the PDF pipeline.
- `GET /imports/:draftId/source` serves the stored upload behind the membership check, and is the
  **only** way to read an import source scan — the review screen fetches it with
  `credentials: "include"` and renders a `URL.createObjectURL()` blob. Nothing mints an
  `/uploads/…` signature for a source scan, so the public route cannot serve one. A non-member gets
  403; a removed member loses access immediately.
- `confidence` mirrors `parsed.confidence.overall`; the review screen warns below 0.5.
- The URL importer refuses localhost / private / link-local targets (SSRF guard). For local
  testing only, `IMPORT_ALLOW_PRIVATE_HOSTS=1` disables that check; it is ignored when
  `NODE_ENV=production`.
- `/commit` writes the recipe, links tags/collections, sets `import_drafts.status = "reviewed"` and
  `import_drafts.recipe_id`.

## Shopping lists — `apps/api/src/routes/shopping.ts`

Mounted at `/api/groups/:groupId/shopping-lists`, **before** the catch-all recipes router (same
reason as `imports`). Several named lists per group ("Rewe", "Drogerie"); a list belongs to the
group, not to a user.

| Method | Path | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `…/shopping-lists` | group:member | – | `ShoppingListListResponse` | 200, 403 |
| POST | `…/shopping-lists` | group:member | `CreateShoppingListRequest` | `ShoppingListResponse` | 201, 403, 409 `shopping_list_name_taken`, 409 `too_many_shopping_lists`, 422 |
| GET | `…/shopping-lists/:listId` | group:member | – | `ShoppingListDetailResponse` | 200, 403, 404 |
| PATCH | `…/shopping-lists/:listId` | group:member | `UpdateShoppingListRequest` | `ShoppingListResponse` | 200, 403, 404, 409, 422 |
| DELETE | `…/shopping-lists/:listId` | group:member (creator or admin) | – | – | 204, 403, 404 |
| POST | `…/shopping-lists/:listId/items` | group:member | `AddShoppingItemsRequest` | `ShoppingListDetailResponse` | 200, 403, 404, 409 `shopping_list_full`, 422 |
| DELETE | `…/shopping-lists/:listId/items` | group:member | – | `ShoppingListDetailResponse` | 200, 403, 404 |
| PATCH | `…/shopping-lists/:listId/items/:itemId` | group:member | `UpdateShoppingItemRequest` | `ShoppingListDetailResponse` | 200, 403, 404, 422 |
| DELETE | `…/shopping-lists/:listId/items/:itemId` | group:member | – | `ShoppingListDetailResponse` | 200, 403, 404 |
| POST | `…/shopping-lists/:listId/items/:itemId/check` | group:member | `CheckShoppingItemRequest` (optional) | `ShoppingListDetailResponse` | 200, 403, 404 |
| POST | `…/shopping-lists/:listId/recipes` | group:member | `AddRecipeToShoppingListRequest` | `ShoppingListDetailResponse` | 200, 403, 404, 422 |
| POST | `…/shopping-lists/:listId/catalog/:entryId` | group:member | `CheckShoppingItemRequest` (optional) | `ShoppingListDetailResponse` | 200, 403, 404 |
| DELETE | `…/shopping-lists/:listId/catalog/:entryId` | group:member | – | – | 204, 403, 404 |

Notes
- **Every mutation returns the WHOLE list** (`ShoppingListDetailResponse`: list + open items +
  suggestions), never just the touched item. The web client replaces its cache entry with it rather
  than patching, which is what keeps an optimistic offline edit from drifting — and merging means one
  added line can change a different one.
- **Items merge.** An item is identified by `shoppingItemKey(name, unit)` from `@toon/shared`: a
  folded name plus the unit's *merge bucket*. Adding "200 g Mehl" to a list that already has 200 g
  yields one **400 g** line, and `1 kg + 200 g` yields `1.2 kg`. Enforced by the unique index on
  `shopping_list_items(list_id, merge_key)`, not by a read-modify-write.
  Units with no fixed ratio (`EL`, `Dose`) only merge with themselves, and an **amount-less line
  never merges with a measured one** — folding "Mehl" into "200 g Mehl" would invent or lose a
  quantity.
- **Checking off is a DELETE, not a flag.** There is no `checked` field anywhere: the row is removed
  and its `shopping_list_catalog` entry is bumped, so the item leaves the list and reappears under
  "Häufig gekauft". `use_count` counts check-offs, not adds, so the ranking reflects what actually
  gets bought. Suggestions currently on the list are filtered out of the response.
- **`POST …/recipes` scales** with the same `scaleIngredients` as `GET /recipes/:id/scale`, with
  `keepNonScalingUnits` (a Prise stays a Prise). `servings` is the TARGET count; omit it for factor 1.
  A recipe with no `servingsAmount` is added unscaled rather than refused. The recipe id is recorded
  on every resulting line (`sourceRecipeIds`), and survives the recipe being deleted — the id stays,
  it just stops resolving into `sources`.
- **`mutationId` (optional, uuid) makes a replay safe.** The API records applied ids in
  `shopping_mutations` and applies each at most once. This is what lets the PWA queue edits made
  offline: without it, a request that reached the server but lost its response would be applied twice
  on replay, and because items merge that is a silently **doubled amount**, not a visible duplicate.
  `DELETE` of an item and `check` are idempotent by construction and safe without one.
- Free text ("500g Mehl") is parsed **client-side** with `parseIngredientLine`
  (`apps/web/src/features/shopping/lib/parse.ts`); the API only accepts structured items.

## Uploads and signed URLs — `apps/api/src/lib/uploadUrls.ts`

`UPLOAD_DIR` holds two kinds of file with two different rules.

**Recipe hero images, avatars, group/collection covers** are served by `GET /uploads/:filename`,
which requires `?exp=<unix ms>&sig=<hmac>`. The signature is HMAC-SHA256 over `"<filename>|<exp>"`
keyed with `SESSION_SECRET`, truncated to 128 bits. Missing, forged and expired signatures all answer
**404**, so the route never confirms that a UUID exists. Responses are
`Cache-Control: private, max-age=21600, immutable`.

- **Minted on serialisation**, not on storage: `toRecipe()`, `toCollection()`, `toGroup()`,
  `toPublicUser()`, `toUserDto()`, `toDraftWire()` and the upload response wrap the stored value in
  `signUploadUrl()`.
- **Stripped on every write**: `normalizeStoredUploadUrl()` reduces whatever the client sends back to
  the bare `/uploads/<filename>`, so a column never holds an expiring value or a pinned origin. A
  client that round-trips the URL it was given is therefore harmless.
- `exp` is **quantised to a 12 h window** (`SIGNED_URL_WINDOW_MS`), so every response inside one
  window carries a byte-identical URL — otherwise the browser and service-worker image caches would
  never hit. A signature is valid for 12–24 h, which is also the window in which a link a removed
  member kept goes dead.
- External URLs (`https://chefkoch.de/…`), `data:` URIs and anything with a path segment are passed
  through untouched and never signed.

**List thumbnails** are derived, never uploaded and never stored in a column.
`<name>.thumb.webp` is the 480 px WebP derivative of `<name>` — one flat filename under
`UPLOAD_DIR`, so it is signed, verified and swept exactly like any other upload. The API mints
`recipe.thumbnailUrl` from `recipes.image_url` (null for an external hero image), and
`GET /uploads/<name>.thumb.webp` BUILDS the file on the first request and caches it on disk; a
recipe whose image predates the feature therefore needs no backfill. A conversion that fails — sharp
missing, or HEIC on a libvips without the HEIF plugin — serves the ORIGINAL with a short `max-age`
instead of a 404, so the worst case is a big image, never a broken one. Clients must use it for
lists and `imageUrl` for detail screens. Implementation: `apps/api/src/services/media/thumbnails.ts`.

**Import source scans** (the uploaded photo/PDF behind a draft) are the private half: no signature is
ever minted for `sourceMeta.storedPath`, so `/uploads/…` cannot serve one at all. They are available
only from `GET /api/groups/:groupId/imports/:draftId/source`, behind the membership check.

Orphaned files (a deleted recipe's image, an abandoned draft) are swept by
`bun run uploads:gc [--dry-run] [--min-age-hours=N]`. A `.thumb.webp` is referenced by no row, so the
sweeper keeps it while its original is referenced and deletes it in the same pass once that is gone.

## Tables (SQLite, `apps/api/src/db/schema.ts`)

`users`, `oauth_accounts`, `sessions`, `password_reset_tokens`, `email_verification_tokens`,
`groups`, `group_members`, `group_invites`, `recipes`, `recipe_ingredients`, `recipe_steps`, `tags`,
`recipe_tags`, `collections`, `collection_recipes`, `import_drafts`, `shopping_lists`,
`shopping_list_items`, `shopping_list_catalog`, `shopping_mutations`.

`password_reset_tokens` / `email_verification_tokens` store a **SHA-256 hash** of the token, never
the token — the deliberate difference from `group_invites.token`, which keeps the raw value (a leaked
invites table costs group membership; a leaked reset table would cost every account). TTLs: 1 h and
24 h. `used_at` makes each one single-use.

Unique indexes: `users.email`, `oauth_accounts(provider, provider_user_id)`,
`group_members(group_id, user_id)`, `tags(group_id, name)`, `group_invites.token`,
`password_reset_tokens.token_hash`, `email_verification_tokens.token_hash`,
`shopping_lists(group_id, name)`, `shopping_list_items(list_id, merge_key)`,
`shopping_list_catalog(list_id, name_key)`.

`shopping_list_items.merge_key` is the item's *identity*, not a cache: the unique index on it is what
performs the merging, so two members adding the same ingredient at once cannot produce two lines.
`shopping_mutations` is an idempotency ledger keyed by the client's `mutationId` (TTL 14 days, pruned
on write) — see the Shopping lists notes above for why it has to exist.
Composite primary keys: `recipe_tags(recipe_id, tag_id)`, `collection_recipes(collection_id, recipe_id)`.
All group-scoped tables cascade from `groups`; child rows cascade from `recipes`.

Account deletion is intentionally NOT exposed: `created_by`/`invited_by` cascade, so a future
"Konto löschen" flow must first transfer group ownership and re-assign authorship.
