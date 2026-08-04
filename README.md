# toon-recipe

Rezeptverwaltung für Familien und WGs: Rezepte sammeln, aus dem Web/Foto/PDF importieren, in
Gruppen teilen, am Handy kochen. German-first UI, mobile-first installable PWA.

## Locked product decisions

These are **fixed** — do not redesign them.

1. **Multi-user with shared groups.** Users register/login, create groups (e.g. "Familie"), invite
   others by e-mail. Recipes, collections and tags belong to a **group**, not a user. Roles:
   `owner | admin | member`. A user can be in many groups; the UI has an active-group switcher.
2. **Mobile = responsive mobile-first PWA.** ONE React app, installable (manifest + service worker
   via `vite-plugin-pwa`). Photo capture with
   `<input type="file" accept="image/*" capture="environment">`. No React Native, no Capacitor.
   Bottom tab nav on mobile (**Rezepte · Einkauf · Importieren · Profil**), sidebar from
   `lg` up, which additionally lists Gruppen, Sammlungen and Tags. Anything sidebar-only
   must also be reachable from a tab screen — Gruppen from Profil, Sammlungen and Tags
   from the recipe-list filters. Searching is part of the recipe list ("Erweiterte
   Suche"), not a destination of its own; `/search` redirects to `/` so older links keep
   working.
3. **Database = Turso / libSQL** (`@libsql/client` + `drizzle-orm/libsql`), so it can be self-hosted
   or run on Turso cloud. Config comes purely from `DATABASE_URL` / `DATABASE_AUTH_TOKEN`; the driver
   choice is never hardcoded.
4. **Auth = email+password AND OAuth (Google + GitHub).** Passwords via `Bun.password` (argon2id, no
   external lib). Sessions are opaque random ids in the `sessions` table, sent as
   `HttpOnly; SameSite=Lax; Secure(prod)` cookie with a 30-day sliding expiry. OAuth uses `arctic`
   with state/PKCE cookies. *Deviation, on purpose:* the brief says an OAuth login on an existing
   **verified** e-mail links to that user — but no verification flow exists, so that flag could not
   be earned and auto-linking was an account takeover. Linking is now an explicit authenticated
   action; see "Known gaps".
5. **Import has three sources and always goes through an editable draft review screen**: URL
   (schema.org JSON-LD incl. `@graph`, microdata fallback, then site selectors — must work for
   chefkoch.de and biancazapatka.com/WP Recipe Maker), image (server-side OCR), PDF (embedded text
   layer first, rasterize + OCR as fallback, clear actionable error if rasterization is unavailable).
6. **OCR runs server-side in Bun** with `tesseract.js` (`deu+eng`, German first), preprocessed with
   `sharp` (grayscale, normalize, ~2000px wide), behind a swappable `OcrEngine` interface.
7. **Shopping lists ("Einkaufslisten") are group-owned and Bring-like.** Several named lists per
   group; a recipe can be put on a list at any portion count and the amounts are rescaled; identical
   articles are summed (`200 g + 200 g Mehl` = one `400 g` line, `1 kg + 200 g` = `1.2 kg`). Ticking
   an item off REMOVES it from the list and it reappears under "Häufig gekauft" for a one-tap re-add.
   This is the only screen that is also **editable offline** — see "Offline".
8. **Content language is German-first**: German units (`g, kg, ml, l, EL, TL, Prise, Bund, Pck.,
   Stück, Dose …`), unicode fractions (`½ ¼ ⅓ ¾`), ranges (`2-3 Eier`), ISO-8601 durations
   (`PT30M`, `PT1H15M`). UI copy in German.

## Stack

| Part | Tech |
| --- | --- |
| Monorepo | Bun workspaces (`apps/*`, `packages/*`), Bun 1.3.14 |
| `apps/api` | Bun.serve + Hono, drizzle-orm, `@hono/zod-validator`, zod, arctic, tesseract.js, sharp, unpdf, pdf-to-img |
| `apps/web` | React 19 + Vite + TypeScript, TanStack Router, TanStack Query, Tailwind CSS v4, vite-plugin-pwa, lucide-react |
| `packages/shared` | Zod schemas + inferred types + pure parsers — the single source of truth, imported as `@toon/shared` |
| Tests | `bun test` (parser unit tests with German fixtures, API integration tests against `file::memory:`) |

TypeScript `strict: true` everywhere, no `any` in exported signatures.

## Layout

```
apps/api/
  src/index.ts            Hono app: CORS, logger, /api/health, /uploads/:file, router mounts
  src/env.ts              Zod-validated env (loads the ROOT .env, fails fast)
  src/db/schema.ts        complete Drizzle schema (20 tables)
  src/db/client.ts        libSQL client + drizzle instance (file: or libsql://)
  src/db/migrate.ts       runMigrations() — used by db:migrate AND by tests
  src/lib/errors.ts       ApiError + onError/notFound handlers
  src/lib/http.ts         json()/created()/noContent()/toIso()
  src/lib/types.ts        AppEnv (Hono context variables: user, sessionId, membership)
  src/routes/{auth,groups,recipes,imports}.ts   one file per owning agent
  src/middleware/         session + group middleware live here
  drizzle/                generated SQL migrations
  scripts/{migrate,seed,reset-password,uploads-gc}.ts
  src/services/auth/      passwords, sessions, users, invites, oauth accounts, rate limit,
                          password reset + e-mail verification (hashed single-use tokens)
  src/services/mail/      Mailer interface + console (default) / resend adapters + German templates
  src/lib/uploadUrls.ts   signs and verifies /uploads/... URLs (?exp&sig)
  src/services/groups/    group + invite services, membership helpers, validation
  src/services/recipes/   recipes, tags, collections, uploads, mappers
  src/services/import/    URL pipeline (html/, url/, adapters/), drafts, commit, files
  src/services/ocr/       OcrEngine interface, tesseract worker, sharp preprocess, pdf.ts
  test/                   ALL api tests live here (`test/`, not `tests/`)
apps/web/
  index.html              viewport-fit=cover, theme-color, pre-paint theme script
  vite.config.ts          react + tailwind v4 + VitePWA + aliases + dev proxy
  src/router.tsx          code-based TanStack Router tree (lazy pages via lib/lazy-page.tsx)
  src/lib/                api.ts (the only network layer), queries.ts, session.tsx, pwa.ts, theme.ts,
                          persist.ts (offline query cache, namespaced per user)
  src/components/ui/      the ONLY UI primitives (Button, Input, Card, Dialog, Toast, …)
  src/components/layout/  AppShell, TopBar, BottomTabBar, SideNav, InstallPrompt, ErrorBoundary
  src/features/           auth/, recipes/, groups/, collections/, tags/, import/
  public/icons/           real PNG app icons (192/512 + maskable + apple-touch)
packages/shared/src/      schemas/ + numbers.ts, units.ts, ingredients.ts, duration.ts
docs/API.md               authoritative endpoint contract
```

## Setup

Verified end to end on Bun 1.3.14 / Linux:

```bash
bun install
cp .env.example .env            # then edit (SESSION_SECRET at minimum)
bun run db:migrate              # creates ./data/local.db from drizzle/*.sql
bun run seed                    # demo data — prints the login at the end
bun run dev                     # API :3001 + web :5173
```

Then open <http://localhost:5173> and log in with the seeded account:

```
Login:    demo@toon.local
Passwort: demo1234
```

The seed is idempotent and creates: the demo user, the group **Familie**, the tags
`Hauptgericht / Backen / Vegetarisch`, and three German recipes — *Klassische Pfannkuchen*,
*Schneller Schokokuchen* and *Zwiebelkuchen vom Blech*; the last two have ingredient **and** step
sections (`Für den Teig` / `Für den Belag`).

### Cookies in dev (why it works)

The session cookie is `HttpOnly; SameSite=Lax; Path=/`. Two setups are supported:

1. **Cross-origin (default).** `PUBLIC_API_URL="http://localhost:3001"`, the browser calls the API
   directly. The client always sends `credentials: "include"`, and the API answers with
   `Access-Control-Allow-Origin: <WEB_ORIGIN>` + `Access-Control-Allow-Credentials: true`.
   `localhost:5173` and `localhost:3001` are the same *site* (ports are ignored), so a `SameSite=Lax`
   cookie is still sent.
2. **Same-origin via the dev proxy.** Set `PUBLIC_API_URL=""` — the client then uses relative URLs
   and Vite proxies `/api` and `/uploads` to the API (`server.proxy` in `apps/web/vite.config.ts`,
   `changeOrigin: false` so the cookie domain stays intact).

For phone testing on the LAN, add the LAN origin to `WEB_ORIGIN`
(`WEB_ORIGIN="http://localhost:5173,http://192.168.x.y:5173"`) and point `PUBLIC_API_URL` at the
same IP.

### A) Self-hosted (local libSQL file)

```env
DATABASE_URL="file:./data/local.db"
DATABASE_AUTH_TOKEN=""
```

Relative `file:` paths resolve from the **repo root**, so the DB always lands in `./data/local.db`
no matter which workspace you run a script from. `data/` is gitignored.

### B) Turso cloud

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create toon-recipe
turso db show toon-recipe --url          # -> libsql://toon-recipe-<org>.turso.io
turso db tokens create toon-recipe       # -> DATABASE_AUTH_TOKEN
```

```env
DATABASE_URL="libsql://toon-recipe-<org>.turso.io"
DATABASE_AUTH_TOKEN="eyJ..."
```

`bun run db:migrate` works against both; the API refuses to start with a remote URL and no token.

### OAuth credentials

**Google** — <https://console.cloud.google.com/apis/credentials> → *Create credentials* → *OAuth
client ID* → *Web application*. Authorized redirect URI:
`http://localhost:3001/api/auth/oauth/google/callback` (in production:
`${OAUTH_REDIRECT_BASE}/api/auth/oauth/google/callback`). Copy client id + secret into
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**GitHub** — <https://github.com/settings/developers> → *New OAuth App*. Homepage URL =
`WEB_ORIGIN`, Authorization callback URL =
`http://localhost:3001/api/auth/oauth/github/callback`. Copy into `GITHUB_CLIENT_ID` /
`GITHUB_CLIENT_SECRET`.

Providers without credentials are genuinely **hidden**: `GET /api/auth/oauth` reports which ones are
configured and the login/register screens render only those buttons. A direct browser hit on
`/api/auth/oauth/google` redirects to `/login?error=oauth_not_configured` (only `?json=1` gets the
`400`). The app runs fine with e-mail+password only.

**Linking password + provider** is an explicit, authenticated action — *Profil → Verknüpfte Konten*
(`GET /api/auth/oauth/:provider/link`). The API does **not** auto-link on a matching e-mail; see
"Known gaps" for why.

### Environment variables

Every variable is documented in [`.env.example`](./.env.example): `DATABASE_URL`,
`DATABASE_AUTH_TOKEN`, `SESSION_SECRET`, `API_PORT`, `WEB_ORIGIN`, `PUBLIC_API_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`OAUTH_REDIRECT_BASE`, `UPLOAD_DIR`, `TESSERACT_LANGS`, `MAIL_TRANSPORT`, `MAIL_FROM`,
`MAIL_API_KEY`, plus `NODE_ENV`, `DEBUG_SQL`, `TRUST_PROXY`, `TEST_DATABASE_URL` and
`IMPORT_ALLOW_PRIVATE_HOSTS`.

**Mail is optional.** With no `MAIL_TRANSPORT` the API uses the `ConsoleMailer`: invite, reset and
confirmation mails are printed to the log (link included) and nothing is sent, so `bun run dev` and
`bun test` never touch the network. Set `MAIL_TRANSPORT="resend"` plus `MAIL_API_KEY` and a
`MAIL_FROM` on a verified sender domain to deliver for real — the API refuses to start if one of
those is missing, rather than silently swallowing every mail. A failed send never fails the action
that triggered it (an invite still returns its `inviteUrl`; `POST /api/auth/password/forgot` still
answers 204).

`TRUST_PROXY=1` makes the rate limiter believe `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP`.
**Set it only behind a proxy that overwrites those headers.** Without it the socket address is used,
because a client-supplied header would otherwise hand out a fresh rate-limit bucket per request and
make login brute-forcing free.

`IMPORT_ALLOW_PRIVATE_HOSTS=1` disables the URL importer's SSRF guard so you can import from a
fixture on `127.0.0.1`. **Development only** — it is ignored when `NODE_ENV=production` and the API
logs a warning when it is used.

The `.env` lives in the **repo root**. The API loads it itself (Bun only auto-loads from the cwd);
the Vite config must therefore set `envDir: "../../"` and `envPrefix: ["VITE_", "PUBLIC_"]`.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | API + web concurrently (`scripts/dev.ts`, `Bun.spawn`, no extra dependency) |
| `bun run dev:api` | API only, `bun --watch` |
| `bun run dev:web` | Vite dev server only |
| `bun run build` | Production build of the web app |
| `bun run start` | Run the API (production) |
| `bun test` | All tests (parsers + API integration) |
| `bun run typecheck` | `tsc --noEmit` for `packages/shared`, `apps/api`, `apps/web` |
| `bun run db:generate` | drizzle-kit: generate SQL migrations from `schema.ts` |
| `bun run db:migrate` | Apply migrations to `DATABASE_URL` |
| `bun run db:studio` | drizzle studio |
| `bun run seed` | Demo user + group "Familie" + 3 recipes with sections (idempotent) |
| `bun run ocr:prefetch` | Downloads + caches the tesseract `deu+eng` traineddata into `data/tessdata` once, so the first import does not have to (the Docker image does this at build time) |
| `bun run auth:reset-password <email> [--send]` | Mints a password-reset token and prints the link. Works with **no mailer at all** — the answer for a locked-out user on a self-hosted install |
| `bun run uploads:gc [--dry-run] [--min-age-hours=N]` | Deletes files in `UPLOAD_DIR` that no row references any more (default: keeps anything younger than 24 h) |

Current status of the four gates (run from the repo root):

```
bun install        Checked 451 installs across 648 packages (no changes)
bun run typecheck  [typecheck] OK           (packages/shared, apps/api, apps/web)
bun test           821 pass, 0 fail, 2146 expect() calls across 26 files
bun run build      ✓ built in ~0.3s + PWA precache 114 entries (1176 KiB)
```

## Deployment (Docker on a Raspberry Pi)

Setting up a **freshly imaged Pi** (OS, Pi-specific kernel/swap prep, Docker, three ways to get the
image onto it): **[docs/pi-setup.md](docs/pi-setup.md)**. Configuration, operations, backup and
rollback: **[docs/deployment.md](docs/deployment.md)**. The short version:

```bash
docker build -t toon-recipe:local .          # one image: API + PWA, one port
docker compose up -d                         # app + caddy (TLS) + mailpit (SMTP)
```

Three things about this setup are worth knowing before you touch it:

- **One container, one origin.** The API serves the built PWA from its own port
  (`WEB_DIST_DIR`, `apps/api/src/middleware/staticWeb.ts`), so `PUBLIC_API_URL` is **empty** in the
  image and the client uses relative URLs. That is what lets a single build run behind any hostname
  with no CORS entry, and it makes the session cookie first-party by construction.
- **No API key is required anywhere.** The Resend key was replaced by an SMTP adapter
  (`services/mail/smtp.ts`, no dependency) pointed at a Mailpit container on the private compose
  network — every invite/reset/confirmation mail is readable in its web UI and nothing leaves the
  machine. The database was already a local libSQL file and OCR already ran in-process, with the
  `deu+eng` traineddata baked into the image at build time. Google/GitHub OAuth stays third-party and
  is deliberately **off**; e-mail + password is the self-hosted path.
- **TLS is not optional, and a self-signed certificate is not enough on its own.** Caddy issues the
  certificate from its own local CA. A browser that does not trust that CA treats the origin as
  insecure *even after you click through the warning*, which means **no service worker** — no install
  prompt and no offline shopping list. Install the root certificate once per device
  (`http://<host>/toon-root-ca.crt`) and it behaves exactly like a public site. Switching to a real
  certificate later is one line in `docker/Caddyfile`.

CI (`.github/workflows/`): `ci.yml` runs the four gates on every push; `release.yml` builds
`linux/arm64` + `linux/amd64` and pushes to GHCR; `deploy.yml` copies the compose files to the Pi over
SSH and restarts by image **digest**, waiting for the container's own healthcheck. The arm64 build
stays fast because the web bundle and the OCR language data are built on the *build* platform (both
outputs are architecture-independent) and only the native `node_modules` install runs under QEMU.

## Install the PWA on a phone

The service worker and the web manifest are only emitted by a **production build**, so install from
a built app, not from `bun run dev`:

```bash
bun run build
bun --filter @toon/web preview      # :4173, reachable on the LAN (host: true)
```

Make sure the phone can reach both ports and that `WEB_ORIGIN` contains the origin you open on the
phone (see "Cookies in dev" above).

- **Android / Chrome**: open the app → the in-app banner ("Zur Startseite hinzufügen") appears, or
  use ⋮ → *App installieren*.
- **iOS / Safari**: open the app → *Teilen* → *Zum Home-Bildschirm*. iOS has no install event, so the
  app shows the manual instructions itself.

After installing, the app launches standalone (no browser chrome), keeps the safe-area insets and
works without a connection:

- **Reading is offline for everything you have opened.** Recipes, tags, collections and shopping lists
  come back from the persisted query cache (IndexedDB), hero images from the service-worker cache, and
  cook mode works.
- **Writing is offline for the shopping list only.** Ticking items off, adding articles and editing a
  line all work with no signal: the mutation is paused, persisted, and replayed on reconnect
  (`apps/web/src/features/shopping/lib/offline.ts`). The header shows how many changes are still
  waiting. Every queued write carries a `mutationId` so the API applies it at most once — without that,
  a request whose response was lost would be replayed and, because articles merge, silently double an
  amount.
- **Every other write is disabled offline** with "Offline — Änderungen können nicht gespeichert
  werden": the recipe editors, the import flow and the draft review, plus creating/renaming/deleting a
  shopping list itself.

`/api/auth/*`, the import endpoints **and the shopping-list endpoints** are never in `runtimeCaching`,
and the SPA shell is never served for `/api` or `/uploads` (`navigateFallbackDenylist`). Shopping
lists are excluded on purpose even though they are the most offline-critical screen: their offline copy
is the persisted TanStack cache, which is also where the queued edits live, and a second cache layer
would overwrite optimistic state with a stale body. The persisted cache is namespaced by user id and
purged on logout, so a second person on the same phone can never see the first one's recipes — see
`apps/web/src/lib/persist.ts`.

## Smoke test against a real server

```bash
# fresh DB + demo data
DATABASE_URL="file:./data/smoke.db" bun run db:migrate
DATABASE_URL="file:./data/smoke.db" bun run seed
DATABASE_URL="file:./data/smoke.db" bun --filter @toon/api start &

curl -s localhost:3001/api/health
curl -s -c /tmp/j -X POST localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@toon.local","password":"demo1234"}'
curl -s -b /tmp/j localhost:3001/api/groups
```

For the URL importer, serve a local HTML fixture and start the API with
`IMPORT_ALLOW_PRIVATE_HOSTS=1`:

```bash
curl -s -b /tmp/j -X POST localhost:3001/api/groups/<groupId>/imports/url \
  -H 'Content-Type: application/json' -d '{"url":"http://127.0.0.1:3998/rezept"}'
# -> 201 { draft: { sourceType: "url", sourceMeta: { method: "json-ld" }, confidence: 0.93, … } }
```

## Contracts between agents

- `docs/API.md` is the endpoint contract; `@toon/shared` is the type contract.
- Feature code goes into `src/routes/<area>.ts` and `src/middleware/*`; `src/index.ts` and the shared
  package's existing exports stay stable.
- Group-scoped routers apply `requireGroupRole(...)` themselves (`router.use("*", ...)`), so
  `src/index.ts` never needs editing.
- Pure, testable logic (parsing, unit maths, formatting) belongs in `packages/shared`, never in a
  route handler.

## Known gaps

Honest list of what is **not** finished. Nothing here blocks the flows above.

> The four gaps that used to be listed here — **no mailer**, **no password reset**, **public
> `/uploads`**, **no offline support** — are now implemented; the decisions taken and what each one
> actually shipped are recorded in [`docs/open-work.md`](./docs/open-work.md). What follows is the
> honest remainder.

**Auth / accounts**
- **Mail delivery is opt-in and single-provider.** The only real transport is Resend
  (`MAIL_TRANSPORT="resend"`); an SMTP adapter would be a new file next to
  `apps/api/src/services/mail/resend.ts` and nothing else. With nothing configured the
  `ConsoleMailer` logs every message instead of sending it, which means on such an install invites
  still have to be forwarded by hand and "Passwort vergessen" cannot reach anyone — use
  `bun run auth:reset-password <email>` there.
- **A mail send is never retried.** One attempt, 10 s timeout, failure logged and reported as
  `emailSent: false` / swallowed. Good enough for a family install; a job queue would be the fix.
- **An OAuth login is still never auto-linked to a matching local account** — it answers 409
  `email_taken`, even for a confirmed address. Sign in with the password and link the provider under
  *Profil → Verknüpfte Konten* (`GET /api/auth/oauth/:provider/link`). Auto-linking on the old
  always-true `emailVerified` flag was an account-takeover: pre-register someone's address and you
  captured their later Google/GitHub login. `users.email_verified_at` now exists and is only ever
  set by a real confirmation click, so auto-linking *could* be gated on it — that is a deliberate
  next decision, not an oversight.
- **E-mail verification is not enforced anywhere.** An unverified account can do everything; the flag
  only drives a hint on the profile screen and is the evidence a future feature can build on.
- No account deletion endpoint on purpose (`created_by` / `invited_by` cascade — see the comment in
  `src/db/schema.ts`). A future flow must transfer ownership and re-assign authorship first.
- The rate limiter is an in-process sliding window, so it resets on restart and is per instance, not
  per cluster. Forwarding headers are ignored unless `TRUST_PROXY=1`; behind a proxy without that
  flag every client shares one bucket, so **set it when you deploy behind nginx/Caddy/Cloudflare**.

**Shopping lists**
- **Creating, renaming and deleting a LIST needs a connection.** Items are fully editable offline; the
  list itself is not, because a list created offline would need a client-side id that every queued item
  mutation would then have to be rewritten to point at. The buttons are disabled with a hint offline.
- **No store categories.** The list is in insertion order, not grouped into "Obst & Gemüse" /
  "Molkerei", so you cannot walk a shop in one pass yet. That needs a German ingredient→category
  mapping and is a deliberate next step, not an oversight.
- **No reordering** of items by hand, and no per-item assignment ("du holst das").
- **`useCount` in "Häufig gekauft" only ever grows.** An article you bought weekly for a year and then
  stopped buying keeps outranking a newer one for a long time; there is no decay. Dismiss it with the
  × on the chip.
- **A stale queued edit is replayed as-is.** An item ticked off offline is still ticked off when the
  phone reconnects two days later, even if someone else has since re-added it — last writer wins, and
  the `mutationId` ledger only guarantees each edit is applied *once*, not that it is still wanted.
  The persisted cache expires after 7 days, which bounds how stale a replay can be.
- The `shopping_mutations` ledger is pruned opportunistically on write (TTL 14 days), so a list that
  is never touched again keeps its rows until it is.

**Import**
- OCR runs **synchronously** inside the request with a 60 s cap (`504 ocr_failed` beyond that). A
  large photo blocks one worker; a job queue + client polling is the intended next step.
- PDF rasterization needs `pdf-to-img`'s native canvas. It works here, but where the binary is
  missing a PDF without a text layer answers `422 pdf_no_text_layer` with a German hint to upload a
  photo instead.
- The **first** photo/scanned-PDF import on a fresh deployment downloads ~15 MB of `deu+eng`
  traineddata from `tessdata.projectnaptha.com` into `data/tessdata`. Run `bun run ocr:prefetch` at
  deploy time (or copy the `*.traineddata` files in) if the host has no outbound HTTPS, otherwise
  that import fails with `ocr_failed`.
- Import load limits are per process, not per cluster: `IMPORT_RULE` (10 per user per minute) and
  `MAX_CONCURRENT_OCR` (2 slots, 429 when full) live in memory. The 60 s OCR deadline answers the
  request on time but cannot actually kill the tesseract/unpdf work it abandoned, so a flood of
  malformed PDFs can still keep CPU busy for a while after the 429s start.
- **`/uploads/:filename` is signature-gated, not session-gated.** Hero images carry
  `?exp&sig` (HMAC over filename + expiry, `SESSION_SECRET`), because a cross-origin `<img>` cannot
  send cookies. So the URL *is* the capability for 12–24 h: someone who copies a signed URL out of a
  page keeps that one image until the window rolls over. Import source scans are not reachable there
  at all — they go through the membership-checked
  `GET /api/groups/:groupId/imports/:draftId/source`. See `apps/api/src/lib/uploadUrls.ts`.
- `bun run uploads:gc` has to be run by hand (or from cron); nothing sweeps orphaned uploads
  automatically.
- The URL importer is verified against the bundled chefkoch.de and WP-Recipe-Maker (biancazapatka)
  fixtures. Live sites are not exercised by the test suite, on purpose.
- `parseStepBlock` (shared) does not split a `Für den Belag:` heading that sits between two numbered
  steps — the heading is glued to the previous step. The seed works around this locally
  (`parseSectionedSteps` in `apps/api/scripts/seed.ts`); ingredient sections are unaffected.

**Contract quirks left in place**
- `UpdateRecipeRequestSchema` / `UpdateCollectionRequestSchema` are `.partial()` of schemas whose
  child arrays carry `.default([])`, so zod materialises `ingredients: []` for an *absent* key. The
  routes therefore filter against the raw JSON body (`keepOnlySentKeys` in
  `src/services/groups/validation.ts`) so a title-only PATCH cannot wipe children. Fix upstream by
  removing those defaults from the base schema.
- There is no "set position" endpoint for `collection_recipes`; the web app re-orders by
  DELETE-then-PUT of the whole ordered list.
- libSQL 0.17.4 discards a `file::memory:` database on transaction commit. `withTransaction()`
  (`src/services/groups/support.ts`) uses real transactions on file/Turso DBs and sequential
  statements on memory DBs; tests that need a transaction use a temp file DB.
- Search is `LIKE`-based over title/description/ingredient names. FTS5 is out of scope; the upgrade
  path is documented above the `recipes` table in `schema.ts`.

**Web**
- No component/E2E tests. Only pure logic is unit-tested (`src/features/import/lib/*.test.ts` plus
  everything in `packages/shared`); `apps/web/tsconfig.json` sets `types: ["vite/client"]`, so those
  two test files rely on the local `bun:test` shim in `src/features/import/lib/bun-test.d.ts`.
- Author/admin permissions are enforced server-side; the client only *hides* controls. Every 403 is
  rendered gracefully.
- **Offline writing is limited to the shopping list, on purpose.** It has a mutation outbox (paused +
  persisted + replayed, with a server-side at-most-once ledger); the recipe editors, the import flow
  and the draft review are still disabled rather than queued, because two flatmates editing one recipe
  needs a conflict story that does not exist yet. A "saved" that later evaporates would be worse than
  a disabled button. The shopping list earns the exception because its operations are add/remove of
  independent lines, where last-writer-wins is a correct answer rather than lost work.
- **Offline, a session is trusted from the persisted cache.** `/api/auth/me` cannot be reached in
  airplane mode, so the app renders from the stored bootstrap payload — otherwise there would be no
  offline mode at all. It grants nothing (the cookie is still the only thing the API accepts, and a
  401 once online clears the cache and redirects), but on an unlocked stolen phone the cached recipes
  are readable until someone taps "Abmelden". Inherent to any offline app; noted so it is a decision
  and not a surprise.
- Only recipes/tags/collections/shopping lists are persisted. Group management, members, invites and import drafts
  need a connection.
- `build.sourcemap` is **off** so the client TypeScript is not published with the bundle. Switch it
  to `"hidden"` and upload the maps separately if you add error reporting.
- `vite-plugin-pwa` `devOptions` are off, so the manifest link and service worker only appear in a
  production build (`bun run build` / `preview`).
- The web app has no unit test for `router.tsx`; route reachability was verified manually
  (every screen resolves through `lib/lazy-page.tsx`). The nav change that removed the Suche
  and Gruppen tabs was checked in a real browser: four tabs, `/search?q=…` redirecting to `/`
  with its params intact, and Profil → "Gruppen verwalten" reaching `/groups`.
