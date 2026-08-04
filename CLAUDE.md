# CLAUDE.md — toon-recipe

Context for future sessions in this repo. Read `docs/API.md` (endpoint contract) and `README.md`
(setup + known gaps) alongside this file.

**Picking up unfinished work?** `docs/open-work.md` is the implementation plan for the four
deliberately-deferred gaps (no mailer · no password reset · public `/uploads` · no offline support),
including the decision each one is blocked on. Do not re-derive them from the code — in particular,
read the `/uploads` entry before adding a cookie check there (cross-origin `<img>` sends no cookies,
so the naive fix breaks every recipe image) and the mailer entry before re-enabling OAuth
auto-linking (the old always-true `emailVerified` was an account-takeover).

**What it is:** a German-first recipe manager for families/flatshares. Multi-user, group-shared
recipes, import from URL / photo / PDF, mobile-first installable PWA. Bun workspaces monorepo.

## Locked decisions — do NOT redesign

1. **Groups own the content.** Recipes, tags, collections and import drafts belong to a `group`, not
   a user. Roles `owner > admin > member`. A user can be in many groups; the UI has an active-group
   switcher; `users.active_group_id` persists the choice.
2. **One React PWA**, responsive mobile-first. No React Native, no Capacitor. Bottom tab bar on
   phones, sidebar from `lg`. Photo capture via
   `<input type="file" accept="image/*" capture="environment">`.
3. **DB = libSQL** via `@libsql/client` + `drizzle-orm/libsql`. Driver choice is NEVER hardcoded:
   `DATABASE_URL` (`file:./data/local.db` self-hosted, `libsql://…turso.io` cloud) and
   `DATABASE_AUTH_TOKEN` (remote only).
4. **Auth = e-mail+password AND OAuth (Google + GitHub).** `Bun.password` argon2id (no hashing lib).
   Sessions = opaque random ids in the `sessions` table, sent as `HttpOnly; SameSite=Lax;
   Secure(prod); Path=/` cookie `toon_session`, 30-day sliding expiry. OAuth via `arctic` with
   state/PKCE cookies; an OAuth identity whose provider e-mail matches an existing **verified** user
   links to that user.
5. **Every import produces an editable `import_draft`.** Nothing is written to `recipes` until
   `POST …/imports/:draftId/commit`. Three sources: URL (JSON-LD `@graph`/array → microdata → site
   selectors), image (server-side OCR), PDF (text layer first, rasterize+OCR fallback,
   `422 pdf_no_text_layer` when rasterization is unavailable).
6. **OCR is server-side** (`tesseract.js`, `deu+eng`, German first, `sharp` preprocessing) behind the
   swappable `OcrEngine` interface in `src/services/ocr/`.
7. **German-first content**: German units (`g kg ml l EL TL Prise Bund Pck. Stück Dose …`), unicode
   fractions, ranges (`2-3 Eier`), ISO-8601 durations. All UI copy in German.

## Architecture

```
packages/shared   Zod schemas + inferred types + PURE parsers. Single source of truth for every
                  request/response shape. Imported by api AND web as "@toon/shared".
apps/api          Bun.serve + Hono. src/index.ts owns CORS/logger/health/uploads and mounts:
                    /api/auth                     -> routes/auth.ts
                    /api/groups                   -> routes/groups.ts
                    /api/groups/:groupId/imports  -> routes/imports.ts
                    /api/groups/:groupId          -> routes/recipes.ts   (also tags + collections)
                  Routers apply their own middleware via router.use("*", …).
apps/web          React 19 + Vite + TanStack Router (code-based tree) + TanStack Query + Tailwind v4.
```

Data flow on the web side: `lib/api.ts` (the ONLY place that calls `fetch`) → `lib/queries.ts`
(query keys + `queryOptions` + `invalidate.*`) → feature hooks → screens. `lib/session.tsx` holds the
session/active group and exports the `RequireAuth` / `RequireActiveGroup` guards.

Order matters in two places: register `/invites/:token` and `/invites/accept` **before** `/:groupId`
in `routes/groups.ts`; mount `imports` before the catch-all `recipes` router in `src/index.ts`.

## File layout (where things live)

```
apps/api/src/
  index.ts                 app wiring — CORS(origin=WEB_ORIGIN, credentials), health, /uploads/:file
  env.ts                   zod-validated env; loads the ROOT .env itself; forces file::memory: in tests
  db/{schema,client,migrate}.ts
  lib/{errors,http,types,cookies,oauth}.ts
  middleware/session.ts    requireSession / optionalSession / loadSession  (sets user, sessionId)
  middleware/group.ts      requireGroupRole(role) — resolves the group from :groupId or from
                           recipeId|collectionId|tagId|draftId|inviteId; sets membership
  routes/{auth,groups,recipes,imports}.ts
  services/auth|groups|recipes|import|ocr/
  test/                    ALL api tests (test/, NOT tests/ — tsconfig only includes test/**)
apps/web/src/
  router.tsx               the route tree; screens resolved lazily by lib/lazy-page.tsx
  lib/{api,queries,query-client,session,validation,format,navigation,theme,storage,pwa,cn}.ts
  components/ui/           the ONLY UI primitives — never re-implement one
  components/layout/       AppShell, TopBar, BottomTabBar, SideNav, InstallPrompt, ErrorBoundary
  features/{auth,recipes,groups,collections,tags,import}/
```

## Conventions

- **Errors**: always `{ error: { code, message, details? } }` with the right status. `code` from
  `ERROR_CODES`. Never leak a stack trace. German messages.
- **Auth checks**: only via `requireSession()` + `requireGroupRole(...)`. Never inline a membership
  query in a handler.
- **IDs** `crypto.randomUUID()`. **Timestamps** integer unix ms in SQLite, ISO strings on the wire
  (`toIso()`).
- **Lists** `{ items, total, limit, offset }`, limit default 24 / max 100.
- **Uploads** max 15 MB, content type sniffed from magic bytes, stored as
  `data/uploads/<uuid>.<ext>`, client filename never trusted.
- **PATCH semantics**: child arrays (`ingredients`, `steps`, `tags`, `collectionIds`) are
  replace-all when present, untouched when absent. Positions are re-assigned from array order.
- **Web**: no `fetch` outside `lib/api.ts` (the one exception is
  `features/import/lib/importApi.ts`, which needs XHR for upload progress and reuses
  `API_BASE_URL`). Every request uses `credentials: "include"`.
- **UI primitives** come from `@/components/ui`. `features/import/lib/shell.tsx` is a *typing* seam
  onto them (wider prop unions cast once) — it must never contain a second implementation.
- **TypeScript 7** (native tsc), `strict: true`, no `any` in exported signatures. `baseUrl` was
  removed in TS7: do not add it; `paths` resolve relative to the tsconfig file.
- Pure logic (parsing, unit maths, formatting, scaling) belongs in `packages/shared` with unit
  tests, never in a route handler or component.

## Gotchas that will bite you

- **libSQL 0.17.4 discards a `file::memory:` DB on transaction commit.** Use a temp file DB in any
  test that touches a transaction. `withTransaction()` in `services/groups/support.ts` already
  degrades to sequential statements on memory DBs.
- **`bun test` forces `DATABASE_URL=file::memory:`** (`NODE_ENV=test` in `env.ts`), so a developer
  `.env` can never point tests at the real DB. Override with `TEST_DATABASE_URL`.
- **`apps/api/tsconfig.json` only includes `test/**`** — never create `apps/api/tests/`, it would be
  invisible to `bun run typecheck`.
- **`apps/web/tsconfig.json` sets `types: ["vite/client"]`**, so `import … from "bun:test"` inside
  `src/**` needs the shim at `src/features/import/lib/bun-test.d.ts`.
- **Vite must keep `envDir: "../../"` + `envPrefix: ["VITE_","PUBLIC_"]`**, otherwise
  `import.meta.env.PUBLIC_API_URL` is not inlined and the web app talks to the wrong port.
- **The service worker is generated by `vite-plugin-pwa`** (`generateSW`, emitted as `sw.js`,
  `injectRegister: false`); `src/lib/pwa.ts` registers it in production only. `/api` and `/uploads`
  must stay in `navigateFallbackDenylist` and out of `runtimeCaching` — a cached API response would
  be a data-correctness bug.
- **The URL importer's SSRF guard blocks localhost/private IPs.** For local fixtures use
  `IMPORT_ALLOW_PRIVATE_HOSTS=1` (dev only, ignored in production).
- **`parseDuration` / `parseServings` return the UPPER bound** of a range (`"20-25 Minuten"` → 25).
  `scaleIngredients` throws `RangeError` for factor ≤ 0 and leaves `raw` untouched (provenance).
- **TWO INCOMPATIBLE pdf.js COPIES share the process.** `unpdf` (text layer) bundles pdf.js 6 and
  installs `globalThis.pdfjsWorker`; `pdf-to-img` uses `pdfjs-dist` 5, which version-checks that
  global and throws. `rasterizePdf()` in `services/ocr/pdf.ts` stashes/restores those globals and
  serializes both phases through one lock. Remove that and EVERY scanned PDF answers 422
  `pdf_no_text_layer`. `test/import/pdf-rasterize.test.ts` is the only import test that uses the real
  rasterizer — **never** `mock.module("pdf-to-img")` in it, and keep its rendered-size assertion
  (a leaked mock from another file would otherwise make it pass).
- **Registration stores `emailVerified: false` and OAuth never auto-links on an e-mail match.** There
  is no confirmation-mail flow, so that flag cannot be earned; auto-linking on it let an attacker
  pre-register a victim's address and capture their later Google/GitHub login. Linking is explicit:
  `GET /api/auth/oauth/:provider/link` (session + `toon_oauth_intent=link` cookie). `createUser`
  defaults `emailVerified` to **false** — only pass `true` where a provider vouched.
- **`safeNextPath` must reject backslashes, control characters and spaces**, not just `//` — the URL
  parser treats `\` like `/` for http(s), so `/\evil.com` resolves to `http://evil.com/`. It exists
  twice on purpose (`apps/api/src/lib/oauth.ts`, `apps/web/src/lib/navigation.ts`); keep them in
  sync. `webUrl()` also fails closed by comparing origins.
- **Anything a client can put in an `href` must be `HttpUrlSchema`** (`packages/shared`), and the UI
  still funnels it through `safeHttpUrl()` (`apps/web/src/lib/format.ts`) so a legacy row cannot
  produce a live `javascript:` link. Applies to recipe + draft `sourceUrl`.
- **`clientIp()` ignores `X-Forwarded-For` unless `TRUST_PROXY=1`** and otherwise uses
  `server.requestIP`. Trusting the header unconditionally made every rate limit a no-op (a new
  header value = a new bucket). Login also has an IP-independent per-address bucket.
- **Import endpoints must stay bounded**: `enforceRateLimit(c, "import", user.id, IMPORT_RULE)` in
  every handler, `withOcrSlot()` around every OCR/PDF pipeline, and `withOcrTimeout` must remain a
  `Promise.race` — the abort signal is cooperative and tesseract/unpdf ignore it.
- **`tesseract.js` never creates its own `cachePath`.** `ensureLangCacheDir()` in
  `services/ocr/tesseract.ts` mkdirs `data/tessdata`; without it every cache write ENOENTs silently
  and each restart re-downloads ~15 MB. `bun run ocr:prefetch` warms it at deploy time.
- **Recipe list/search filters live in the URL**, owned by `useUrlRecipeFilters`
  (`apps/web/src/features/recipes/lib/url-filters.ts`). `/` and `/search` must declare the SAME
  search params (`RECIPE_FILTER_PARAMS` in `router.tsx`) — `pick()` drops anything unlisted.
- **`build.sourcemap` is off** so the client TypeScript is not published with the bundle.

## Verification gates

All four must be clean before calling anything done:

```bash
bun install
bun run typecheck    # tsc for packages/shared, apps/api, apps/web
bun test             # 600 tests
bun run build        # vite build + PWA
```

Plus, for anything touching persistence or auth: `bun run db:migrate` and `bun run seed` against a
fresh `file:` DB, then the curl walkthrough in README.md ("Smoke test against a real server").
