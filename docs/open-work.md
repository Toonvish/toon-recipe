# Open work — the four deferred gaps

Written 2026-08-03, right after the initial build. Everything in [`README.md` → Known
gaps](../README.md#known-gaps) is *described*; this file is the **implementation plan** for the four
items that were deliberately left open, because each needs a product decision rather than more code.

Nothing here blocks the seven verified user journeys. All four gates are green
(`typecheck` · `600 pass / 0 fail` · `build` · smoke test).

Read [`CLAUDE.md`](../CLAUDE.md) first — the locked decisions and the gotchas section explain *why*
the code looks the way it does.

**Recommended order.** (1) unblocks (2) and the e-mail-verification follow-on; (3) is the only one
with a security edge; (4) is the largest and the most optional.

| # | Gap | Blocked on | Rough size |
| --- | --- | --- | --- |
| 1 | [No mailer](#1--no-mailer-anywhere) | choice of transport | S (interface + one adapter) |
| 2 | [No password reset](#2--no-password-reset) | #1, or accept the CLI stopgap | M |
| 3 | [`/uploads` is public](#3--uploads-is-served-without-an-authorization-check) | how you deploy (same-origin?) | S–M |
| 4 | [PWA is not usable offline](#4--the-pwa-is-installable-but-not-usable-offline) | scope: read-only or writes too | L |

Two conventions that apply to all four: **new user-facing copy is German**, and **new API errors go
through `ApiError` + `ERROR_CODES` in `@toon/shared`** so the client can branch on a code instead of
a message.

---

## 1 — No mailer anywhere

**Current behaviour (verified)**

- There is no mailer, no SMTP env var, and no mail dependency in any `package.json`.
- `createInvite()` (`apps/api/src/services/groups/invites.service.ts:57`) stores the row and returns
  `{ invite, inviteUrl }`; `buildInviteUrl()` (`:44`) builds `${env.webOrigins[0]}/invite/<token>`.
  The admin copies that link and forwards it by hand — `InvitePanel.tsx` says so in as many words.
- Registration therefore stores `emailVerified: false` (`apps/api/src/routes/auth.ts:127`), and
  because nothing can ever set that flag, **OAuth never auto-links** to a matching password account
  (409 `email_taken`). That is a deliberate fix for a real account-takeover, not an oversight — see
  Known gaps.

**Why it was left open.** A mailer is a deployment decision (own SMTP vs. a provider), it needs a
secret and a verified sender domain, and every path that wants it (invites, reset, verification)
still works or degrades cleanly without it.

**Decisions needed**

1. Transport: SMTP via `nodemailer` (works under Bun, self-host friendly, one dependency) **or** an
   HTTP provider like Resend/Postmark (`fetch` only, no dependency, but an external service).
2. Sender identity: `MAIL_FROM` and, for a provider, a verified domain.
3. Does a failed send break the action? **Recommendation: no.** Creating an invite must still
   succeed and still return `inviteUrl`, with the send failure logged and surfaced as a soft warning
   in the UI. The link is the source of truth; e-mail is a convenience.

**Implementation sketch**

- Mirror the existing swappable-adapter pattern (`OcrEngine`, `apps/api/src/services/ocr/index.ts`)
  — that consistency is the point:
  ```
  apps/api/src/services/mail/index.ts     Mailer interface + selection from env
  apps/api/src/services/mail/smtp.ts      or provider.ts
  apps/api/src/services/mail/console.ts   dev default: logs the mail + link, sends nothing
  apps/api/src/services/mail/templates.ts German text+HTML: invite, reset, verify
  ```
  `interface Mailer { send(msg: { to, subject, text, html? }): Promise<void> }`.
- `ConsoleMailer` is the **default when no transport is configured**, so `bun run dev` keeps working
  and tests never touch the network. Inject a fake mailer in tests exactly as the OCR tests inject a
  fake `OcrEngine`.
- Add `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_URL` (or `MAIL_API_KEY`) to `apps/api/src/env.ts` **and**
  `.env.example`. `env.ts` is Zod-validated and fails fast — keep the mail vars optional so an
  install without mail still boots.
- Wire the first caller: `createInvite()` sends the invite mail after the row is committed, inside a
  `try/catch` that never rethrows.

**Follow-on this unlocks (do not skip the reasoning).** An e-mail-verification flow
(`POST /api/auth/email/verify/request` + `/confirm`, setting `users.emailVerified`) would let OAuth
auto-linking come back — but **only** gated on a verification timestamp earned through a real
confirmation click, never on the registration default. Re-read the takeover note in Known gaps
before touching `loginWithOAuthProfile()` (`apps/api/src/services/auth/oauthAccounts.ts`).

**Done when.** An invite e-mail arrives with a working link; with no transport configured the app
behaves exactly as it does today; `bun test` still passes offline.

---

## 2 — No password reset

**Current behaviour (verified)**

- Auth endpoints are `register`, `login`, `logout`, `me`, `PATCH /me`, `POST /password` (requires a
  session **and** the current password), `sessions`, `oauth*` — there is no forgot/reset anywhere
  (`apps/api/src/routes/auth.ts`).
- `LoginPage.tsx` has no "Passwort vergessen?" link; `docs/API.md` has no reset endpoint.
- A user with a password and no linked provider who forgets it is locked out, and there is no
  operator escape hatch either. The only workaround is DB access.

**Decision needed.** Do you want the **mailed** flow (needs #1) or is the **operator CLI** enough for
a family-scale install? They share all the server-side work, so building the CLI first is not wasted
— it is the same token table and the same reset endpoint, minus the mail.

**Implementation sketch**

1. **Schema** — new table in `apps/api/src/db/schema.ts`, then `bun run db:generate`:
   `password_reset_tokens(id, user_id → users.id cascade, token_hash, expires_at, used_at,
   created_at, requested_ip)`.
   Store a **SHA-256 hash** of the token, not the token. Note the deliberate difference from
   `group_invites.token` (`schema.ts:138`), which stores the raw token — a leaked DB there costs you
   group membership; here it would cost account takeover. TTL 1 h (not the invites' 14 days).
2. **Service** — `apps/api/src/services/auth/passwordReset.ts`: create (invalidating any outstanding
   token for that user), consume-once, and reject expired/used tokens with an indistinguishable
   error.
3. **Routes**
   - `POST /api/auth/password/forgot { email }` → **always `204`**, whether or not the address
     exists. No user enumeration. Rate-limit it with a new rule alongside `LOGIN_EMAIL_RULE` in
     `apps/api/src/services/auth/rateLimit.ts` (per-IP *and* per-email, as login does — and note
     that IP is only trustworthy when `TRUST_PROXY=1`).
   - `POST /api/auth/password/reset { token, password }` → sets the hash via `Bun.password`, marks
     the token used, and **deletes every session for that user** (the sessions service already has
     the query) so a thief holding a stolen cookie is logged out. Then sign the user in, or redirect
     to `/login` — your call, say which in `docs/API.md`.
   - Reuse the register password rule (min 10 chars) from the shared schema; do not re-invent it.
4. **Web** — "Passwort vergessen?" on `LoginPage.tsx`, plus `/forgot-password` and
   `/reset-password/:token` routes in `apps/web/src/router.tsx`, and the two API functions in
   `apps/web/src/lib/api.ts` (the only file allowed to talk to the network). German copy; the
   forgot screen must show the same confirmation regardless of whether the address exists.
5. **Operator stopgap, valuable on its own** — `apps/api/scripts/reset-password.ts`
   (`bun run auth:reset-password <email>`) mints a token and prints the reset URL. Works with no
   mailer at all and is the answer for a locked-out user today.

**Tests.** Happy path; expired token; reused token; unknown e-mail still returns 204; existing
sessions are dead after a reset; rate limit trips. Integration tests run against `file::memory:` —
but see the libSQL transaction gotcha in `CLAUDE.md` if you wrap the reset in a transaction.

**Done when.** A locked-out password-only user can get back in without DB access, and a stolen
session cookie does not survive the reset.

---

## 3 — `/uploads` is served without an authorization check

The only gap with a security edge. It is also the one that is already 90 % built.

**Current behaviour (verified)**

- `app.get("/uploads/:filename")` (`apps/api/src/index.ts:56-68`) serves any file in `UPLOAD_DIR`
  with **no session and no membership check**, `Cache-Control: public, max-age=31536000, immutable`.
  Path traversal *is* blocked (normalize + prefix re-check), and names are unguessable UUIDs
  (`storeUpload`, `apps/api/src/services/import/files.ts:202`).
- A membership-checked alternative already exists and is unused:
  `GET /api/groups/:groupId/imports/:draftId/source` (`apps/api/src/routes/imports.ts:243`).
  The review screen instead builds `${apiBaseUrl()}/uploads/<filename>`
  (`apps/web/src/features/import/lib/importApi.ts:38`).
- Consequence: anyone who ever saw an upload URL — **including a removed group member** — can still
  fetch that file forever. For an import that file can be a photo of a private page.

**Why it is public, which is the actual constraint.** `UPLOAD_DIR` holds *two* kinds of file:
recipe **hero images**, rendered with plain `<img>` in at least six components via the resolver at
`apps/web/src/lib/api.ts:93`, and import **source scans**. A cross-origin `<img>` cannot send
cookies, and the default dev/deploy setup is cross-origin (`localhost:5173` → `:3001`) — so a
cookie-checked `/uploads` would break every recipe image. That is why the comment above the route
says what it says. Any fix has to answer this, not just add middleware.

**Decision needed — pick one:**

- **(a) Split by sensitivity — smallest correct fix, recommended first.** Keep hero images on the
  public UUID route (they are shown to every group member anyway and carry little private data), and
  move **only import sources** to the existing checked endpoint: in
  `apps/web/src/features/import/components/SourceViewer.tsx`, `fetch(...)` with
  `credentials: "include"` and render a `URL.createObjectURL(blob)`, revoking it on unmount. Server
  side is already done. Costs no infrastructure and closes the private-scan hole today.
- **(b) Signed URLs — the fuller fix, keeps `<img>` working.** Mint `?exp=…&sig=…`
  (HMAC-SHA256 over `filename|exp` with `SESSION_SECRET`) wherever a stored path is serialised, and
  verify in the `/uploads` handler. Short TTL, so the URL a removed member kept goes dead.
  Cost: every serialisation site must mint, and cache headers must drop to `private`.
- **(c) Deploy same-origin.** Put API and web behind one origin (`PUBLIC_API_URL=""` + the Vite
  proxy in dev, a reverse proxy in prod — both already supported, see `vite.config.ts:29-32`), then
  a cookie check on `/uploads` works for `<img>` too. Simplest code, but it constrains hosting.

(a) and (c) compose; (b) is independent. Whatever you pick, keep the
`navigateFallbackDenylist` for `/api` and `/uploads` in `vite.config.ts` so no service worker ever
answers for these paths.

**Also worth doing while in here**

- Purge orphaned uploads. `deleteUpload()` runs when a draft is discarded, but a recipe deleted with
  a stored hero image, or a draft abandoned forever, leaves the file on disk. A small sweeper script
  (`bun run uploads:gc`, delete files referenced by no `recipes.imageUrl` and no
  `import_drafts.sourceMeta.storedPath`) is ~30 lines.
- `shutdownOcr()` exists but is not wired to `SIGTERM` (Known gaps) — same file neighbourhood.

**Tests.** A non-member gets 403/404 from the source endpoint; a removed member loses access; path
traversal stays blocked; for (b), an expired or tampered signature is rejected.

**Done when.** An import source scan cannot be fetched by someone who is not currently a member of
its group, and recipe images still render in whatever deployment mode you chose.

---

## 4 — The PWA is installable but not usable offline

**Current behaviour (verified)**

- `VitePWA` (`apps/web/vite.config.ts:41`) uses `generateSW` with **`runtimeCaching: []`** and a
  `navigateFallbackDenylist` of `[/^\/api\//, /^\/uploads\//]`. Only build output is precached
  (104 entries, ~1.1 MB).
- So an installed app opened with no connection renders the shell, then every screen fails with
  "Keine Verbindung zum Server. Bist du offline?" (`apps/web/src/lib/api.ts:248`).
- TanStack Query is configured with per-kind `staleTime` (`apps/web/src/lib/queries.ts`) but **no
  persistence** — the cache dies with the tab, so even a warm cache does not survive a relaunch.
- The install banner copy (`apps/web/src/components/layout/InstallPrompt.tsx:27`) was deliberately
  narrowed to "own icon, no browser chrome" and no longer promises offline. **Update it when this
  ships**, and not before.

**Decision needed — scope.** These are very different jobs:

- **Read-only offline (recommended).** Browse recipes you have already opened and use **cook mode**
  in a kitchen with bad wifi. This is the real mobile use case and it is achievable.
- **Offline writes.** Queued mutations, conflict resolution, an outbox. Much larger, and it needs a
  conflict story for two members editing one recipe. Not worth it until read-only is in use.

**Why it was left open.** Caching authenticated, multi-tenant GETs needs an invalidation story, and
getting it wrong leaks data: a cached response keyed only by URL would show **user A's recipes to
user B** after a logout/login on a shared phone. That is the trap to design against.

**Implementation sketch (read-only)**

1. **Persist the query cache** so a relaunch has data: TanStack Query's
   `persistQueryClient` + an IndexedDB persister, wired in `apps/web/src/lib/queries.ts`.
   - **Namespace the persisted cache by user id** and **purge it on logout** (and on a user
     mismatch at boot). This is the data-leak guard — do it first, not last.
   - Persist recipe list/detail, collections and tags. **Never** persist `/api/auth/me`, imports, or
     anything under `/uploads` that is a private source scan.
2. **Service worker runtime caching** in `vite.config.ts`: `NetworkFirst` for recipe GETs with a
   short `networkTimeoutSeconds`, `StaleWhileRevalidate` (or `CacheFirst`) for hero images.
   Keep `/api/auth/*` and import endpoints **uncached**, and keep the denylist. Cap entries and set
   an expiration so a phone does not fill up.
3. **Honest offline UI.** An offline indicator (`navigator.onLine` + `online`/`offline` events);
   editors and the import flow disabled with "Offline — Änderungen können nicht gespeichert werden";
   cook mode explicitly works offline once the recipe has been opened.
4. **Then** update the `InstallPrompt` copy to match reality.
5. Note for testing: `devOptions` are off, so the manifest and worker only exist in a production
   build — verify with `bun run build` + `bun run preview`, then DevTools → Application → offline.
   `bun run dev` will never show you this.

**Done when.** Airplane mode → open the installed app → a previously viewed recipe and cook mode
work; a logout clears the persisted cache; a second user on the same phone never sees the first
user's recipes.
