# The four deferred gaps — what shipped

Written 2026-08-03 as an implementation plan; **rewritten 2026-08-04, when all four were built.**
This file is now the record of the decision taken for each one, what it actually does, and where the
remaining sharp edges are. [`README.md` → Known gaps](../README.md#known-gaps) is the honest list of
what is still open; [`docs/API.md`](./API.md) is the endpoint contract.

Read [`CLAUDE.md`](../CLAUDE.md) first — the locked decisions and the gotchas section explain *why*
the code looks the way it does.

| # | Gap | Decision taken | Where it lives |
| --- | --- | --- | --- |
| 1 | [Mailer](#1--mailer) | Resend over HTTP, `ConsoleMailer` as the no-config default | `apps/api/src/services/mail/` |
| 2 | [Password reset](#2--password-reset) | Mailed flow **and** an operator CLI; redirect to `/login` | `services/auth/passwordReset.ts` |
| 3 | [`/uploads`](#3--uploads-authorisation) | Split by sensitivity **+** signed URLs | `apps/api/src/lib/uploadUrls.ts` |
| 4 | [Offline PWA](#4--offline-pwa) | Read-only — since **superseded** for the shopping list, see below | `apps/web/src/lib/persist.ts` |
| + | [E-mail verification](#5--e-mail-verification-follow-on) | Flow built, OAuth auto-linking still off | `services/auth/emailVerification.ts` |

Both conventions from the original plan held: **new user-facing copy is German**, and **new API errors
go through `ApiError` + `ERROR_CODES` in `@toon/shared`** (`reset_token_invalid`,
`verification_token_invalid`).

---

## 1 — Mailer

**Decision.** HTTP provider (Resend), not SMTP: no dependency, just `fetch`, and one API key plus a
verified domain is the whole setup. An SMTP adapter is a new file next to `resend.ts` implementing the
same three-line interface — nothing else would change.

**What it is.** Mirrors the `OcrEngine` seam exactly, which was the point:

```
services/mail/types.ts      Mailer interface + MailSendResult
services/mail/index.ts      getMailer() / setMailer() / trySendMail() / isMailConfigured()
services/mail/console.ts    ConsoleMailer — the DEFAULT: logs the mail + link, sends nothing
services/mail/resend.ts     ResendMailer — fetch POST, 10 s timeout
services/mail/templates.ts  German text+HTML: invite, reset, verify
```

`MAIL_TRANSPORT` / `MAIL_FROM` / `MAIL_API_KEY` in `env.ts` and `.env.example`, all optional. `env.ts`
*does* refuse to boot when `MAIL_TRANSPORT="resend"` is set without a key or sender — a deployment that
asked for real mail and typo'd the key should fail loudly, not look healthy and deliver nothing.

**A failed send never fails its action** (the recommendation in the original plan, kept).
`trySendMail()` returns `{ delivered, transport, error? }` and never throws. `createInvite()` sends
*after* the row is committed and reports `emailSent` in `GroupInviteResponse`; the invite panel shows
the copyable link either way and only claims "verschickt" when it was. `POST /password/forgot` answers
204 regardless.

**Sharp edges.** One delivery attempt, no retry queue. `bun test` gets a silent ConsoleMailer, and a
test that calls `setMailer()` must hand it back — every file shares one process.

---

## 2 — Password reset

**Decision.** Both halves. The mailed flow *and* `bun run auth:reset-password <email> [--send]`,
because they are the same token table and the same endpoint minus the mail, and the CLI is the only
answer on an install with no transport configured. After a reset the user is **sent to `/login`**, not
signed in — the reset kills every session, so proving they know the new password is the natural next
step and there is nothing to document about a half-authenticated state.

**Schema.** `password_reset_tokens(id, user_id → cascade, token_hash, expires_at, used_at,
requested_ip, created_at)`, migration `0001`. **SHA-256 hash, never the token** — the deliberate
difference from `group_invites.token`, which keeps the raw value. TTL **1 h**, not the invites' 14 days.
Unsalted and unstretched on purpose: the input is already 256 bits of CSPRNG output, so there is
nothing to grind, and a salted digest could not be looked up by token at all.

**Endpoints.** `POST /api/auth/password/forgot` → **always 204**. Three things make that true and all
three matter: the rate limit is enforced *before* the lookup, a missing account just skips the send,
and a failed send is swallowed. Two buckets, like login: per-IP (5/15 min) and IP-independent
per-address (3/15 min), because without `TRUST_PROXY=1` the IP is a shared socket address.

`POST /api/auth/password/reset` marks the token used *first* (so a replay cannot set a password even
if a later step fails), writes the hash, then deletes **every** session of that user. Not wrapped in a
transaction: the order is safe at any interruption point, and `withTransaction()` degrades to
sequential statements on a memory DB anyway.

Unknown, expired and used tokens all answer one indistinguishable `400 reset_token_invalid`.

**Web.** "Passwort vergessen?" under the password field, `/forgot-password` and
`/reset-password/$token`. The confirmation panel says "Wenn es ein Konto mit dieser Adresse gibt …" —
the screen must not undo the server's non-enumeration. Token in the path, not a query param.

**Tests.** `apps/api/test/password-reset.test.ts` — happy path, expired, reused, unknown-address-still-204,
byte-identical responses, sessions dead after a reset, OAuth-only account gains a password, a rejected
body does not burn the token.

---

## 3 — `/uploads` authorisation

**Decision.** (a) **and** (b): split by sensitivity *and* sign the public half. (a) alone left every
hero image world-readable forever; (b) alone would have kept serving private scans from a URL that
merely expires.

**The constraint that shaped it.** A cookie check is not available on `/uploads`: hero images are
rendered with plain `<img>` in half a dozen components and the default deployment is cross-origin, so
the authorisation has to travel *in* the URL.

**(a) Import source scans left the public route entirely.** Nothing mints a signature for
`sourceMeta.storedPath`, so no working `/uploads` URL for one can exist. `SourceViewer` fetches
`GET /api/groups/:groupId/imports/:draftId/source` with `credentials: "include"` and renders a
`URL.createObjectURL()` blob, revoked on unmount and on draft change.

**(b) Everything else is signed.** `?exp=<unix ms>&sig=<hmac>`, HMAC-SHA256 over `"<filename>|<exp>"`
keyed with `SESSION_SECRET`, truncated to 128 bits. Missing / forged / expired all answer **404**, so
the route never confirms a UUID exists. `Cache-Control` dropped to `private`.

Two details worth keeping:

- **Minted on serialisation, stripped on write.** Every row→DTO mapper wraps the value in
  `signUploadUrl()`; every write path reduces it with `normalizeStoredUploadUrl()`. So a client that
  round-trips the URL it was served cannot persist an expiring value, and columns stay origin-free.
- **`exp` is quantised to a 12 h window.** A per-request `now + ttl` would mint a different URL on
  every response, which permanently defeats the browser and service-worker image caches. Signatures
  are therefore byte-identical inside a window and valid for 12–24 h — which is also the bound on how
  long a link a removed member kept keeps working. That bound, not filename secrecy, is the guarantee.

**Also done while in here.** `bun run uploads:gc [--dry-run] [--min-age-hours=N]` deletes files no row
references (checks all five columns plus both fields inside `import_drafts`; keeps anything younger
than 24 h, because a mid-flight upload is on disk before it is referenced). `shutdownOcr()` is wired
to `SIGTERM`/`SIGINT`.

**Tests.** `apps/api/test/uploads.test.ts` — the signing primitives, 404 without/with a tampered/expired
signature, a signature for one file does not open another, `exp` cannot be extended, traversal still
blocked, the column never holds a signature, and for source scans: not reachable via `/uploads`,
non-member 403, **removed member loses access**.

---

## 4 — Offline PWA

**Decision.** **Read-only.** Browse what you have already opened and use cook mode in a kitchen with
bad wifi. Offline *writes* need an outbox and a conflict story for two members editing one recipe, and
are not worth it until read-only is in use.

> **Partly superseded (shopping lists).** The shopping list added later IS editable offline, with a
> real outbox. The reasoning above still holds for everything else and is why the exception is narrow:
> shopping-list operations are add/remove of *independent lines*, so last-writer-wins is a correct
> answer rather than lost work, whereas two people editing one recipe body is not. What makes it safe
> is in [`CLAUDE.md`](../CLAUDE.md) → gotchas ("THE SHOPPING LIST IS THE ONE THING EDITABLE OFFLINE");
> the short version is four pieces that must all hold: `setMutationDefaults` (a dehydrated mutation
> cannot carry a function), `networkMode: "offlineFirst"` (a failed write pauses instead of failing),
> `shouldPersistMutation` + `resumePausedMutations()` (the queue survives a kill), and a client-minted
> `mutationId` checked against a server-side ledger (`shopping_mutations`) so a replay is applied at
> most once. Drop the last one and a lost response silently doubles an amount, because items merge.

**The trap, and how it is avoided.** A persisted cache keyed only by query key shows user A's recipes
to user B after a logout/login on a shared phone — the keys are identical. Four rules in
`apps/web/src/lib/persist.ts`, all of which have to hold:

1. the IndexedDB key contains the user id;
2. the persister resolves that id at **call** time, so a login as a different user cannot save into
   the previous user's blob;
3. an id change **purges** the store, and so does logout (`onSettled`, so a failed logout request
   still clears local state);
4. `shouldPersistQuery` is an **allow**-list — recipes, tags, collections, shopping lists, and nothing
   else by default. Import drafts, sessions and the OAuth provider list are excluded.
   `shouldPersistMutation` is a second, much tighter allow-list: paused `["toon","shopping",…]`
   mutations only.

**The one judgement call: `/api/auth/me` is persisted.** The original plan said not to. Without it
there is no offline mode at all — airplane mode cannot reach `/api/auth/me`, so the app would never
learn who is signed in and never render past the guard. It lives inside the same per-user,
purge-on-logout blob, and it grants nothing: the cookie is still the only thing the API accepts, and a
401 once online clears the cache and redirects. `RequireAuth` therefore prefers a restored session
over a failed refetch. The residual exposure (cached recipes readable on an unlocked stolen phone
until someone taps "Abmelden") is inherent to any offline app and is written down in README → Known
gaps rather than glossed over.

**Service worker** (`vite.config.ts`): `NetworkOnly` for `/api/auth/*` **first** (a rule that came
second would never be consulted), for imports, and for shopping lists — the last one because their
offline copy is the persisted TanStack cache that also holds the queued edits, and an SW hit would
hand TanStack a stale body that looks like a fresh success and overwrite optimistic state.
`NetworkFirst` with a 4 s timeout for recipe GETs, `CacheFirst` for `/uploads`. Every entry bounded by `expiration` and `cacheableResponse: {statuses:[200]}`
so a 401 is never stored as content. The `navigateFallbackDenylist` is unchanged.

**Honest UI.** `OfflineBanner` (already existed), `useCanMutate()` disables the recipe form, the import
screen and the draft commit with "Offline — Änderungen können nicht gespeichert werden", and the
`InstallPrompt` copy was updated **in the same change** — it now promises already-opened recipes and
no editing, which is exactly what ships. The shopping screens deliberately do NOT call
`useCanMutate()`: it reports false when offline, which is backwards for the one feature that works
offline. They show their own banner ("… werden später synchronisiert") and a queued-changes count.

**Verifying it.** `devOptions` are off, so the manifest and worker only exist in a production build:
`bun run build` + `bun --filter @toon/web preview`, then DevTools → Application → Offline. `bun run dev`
will never show you this.

---

## 5 — E-mail verification (follow-on)

Built, because the mailer unblocked it: `POST /api/auth/email/verify/request` (session-scoped, so it is
not another enumeration oracle) and `/confirm` (works **without** a session — the link is regularly
opened on a different device). 24 h TTL, hashed single-use token, bound to the address it was issued
for so it cannot vouch for an address that changed in between.

`markEmailVerified()` is the ONLY writer of `email_verified` + `email_verified_at`, which now always
move together; `updateUser()` deliberately cannot patch them.

**OAuth auto-linking is still OFF, on purpose.** A confirmed address does not re-enable it — a provider
login on a taken address remains `409 email_taken`. `email_verified_at` is the evidence such a feature
would have to be gated on, and a test asserts that confirming does *not* change the answer. Turning it
on is a separate decision; re-read the takeover note in
`apps/api/src/services/auth/oauthAccounts.ts` first.

---

## Gates

All four were green when this was written:

```
bun install        Checked 451 installs across 648 packages
bun run typecheck  [typecheck] OK           (packages/shared, apps/api, apps/web)
bun test           674 pass, 0 fail, 1696 expect() calls across 22 files
bun run build      ✓ built + PWA precache 104 entries (1130 KiB)
```

Anything touching persistence or auth also wants `bun run db:migrate` + `bun run seed` against a fresh
`file:` DB and the curl walkthrough in README.md.
