# CLAUDE.md — toon-recipe

Context for future sessions in this repo. Read `docs/API.md` (endpoint contract) and `README.md`
(setup + known gaps) alongside this file.

**Those four deferred gaps are DONE.** `docs/open-work.md` now records what shipped for each (mailer ·
password reset · signed `/uploads` · read-only offline) and the decision behind it. Read it before
touching any of them — in particular before adding a cookie check to `/uploads` (cross-origin `<img>`
sends no cookies, which is why the fix is a signature) and before re-enabling OAuth auto-linking (the
old always-true `emailVerified` was an account-takeover; `email_verified_at` is now the only evidence
that counts, and auto-linking is still deliberately off).

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
   state/PKCE cookies. Provider linking is an EXPLICIT authenticated action — there is no auto-link
   on an e-mail match, verified or not (see the gotcha below).
   Password reset + e-mail confirmation use hashed, single-use tokens from a mailed link.
5. **Every import produces an editable `import_draft`.** Nothing is written to `recipes` until
   `POST …/imports/:draftId/commit`. Three sources: URL (JSON-LD `@graph`/array → microdata → site
   selectors), image (server-side OCR), PDF (text layer first, rasterize+OCR fallback,
   `422 pdf_no_text_layer` when rasterization is unavailable).
6. **OCR is server-side** (`tesseract.js`, `deu+eng`, German first, `sharp` preprocessing) behind the
   swappable `OcrEngine` interface in `src/services/ocr/`. **Mail uses the same shape**: `Mailer`
   interface in `src/services/mail/`, `ConsoleMailer` as the no-config default, then `SmtpMailer`
   (dependency-free, `node:net`/`node:tls`) and `ResendMailer`. **SMTP is the self-hosted transport
   and the default in Docker** — it talks to a Mailpit container, so a deployment needs no API key.
9. **Deployment is ONE container serving ONE origin.** `WEB_DIST_DIR` makes the API serve the built
   PWA from its own port (`middleware/staticWeb.ts`), so the image has `PUBLIC_API_URL=""`, the
   client uses relative URLs, and there is no CORS entry, no second web server and no hostname baked
   into the bundle. Caddy in front only terminates TLS. See `docs/deployment.md`.
7. **Shopping lists are group-owned, merge by `(name, unit)` and have no `checked` column.**
   Several named lists per group. Checking an item off DELETES the row and bumps a
   `shopping_list_catalog` entry, so it leaves the list and reappears under "Häufig gekauft" — the
   Bring behaviour, chosen deliberately over a flag. Adding merges: the unique index on
   `shopping_list_items(list_id, merge_key)` turns 200 g + 200 g Mehl into one 400 g line. Amounts in
   units with no fixed ratio (`EL`, `Dose`) never merge across units, and an amount-less line never
   merges with a measured one. **This is the ONE feature that is editable offline** (see the gotcha).
   `POST …/shopping-lists/:listId/recipes` takes an optional `ingredientIds` subset — OMITTED means
   the whole recipe, which is what keeps an older client and a queued offline replay working. Unknown
   ids are ignored, never rejected, for the same reason. `AddRecipeToListDialog` ticks every
   ingredient by default and tracks the EXCLUDED set, so a recipe that gains a line stays all-on.
8. **German-first content**: German units (`g kg ml l EL TL Prise Bund Pck. Stück Dose …`), unicode
   fractions, ranges (`2-3 Eier`), ISO-8601 durations. All UI copy in German.

## Architecture

```
packages/shared   Zod schemas + inferred types + PURE parsers. Single source of truth for every
                  request/response shape. Imported by api AND web as "@toon/shared".
apps/api          Bun.serve + Hono. src/index.ts owns CORS/logger/health/uploads and mounts:
                    /api/auth                            -> routes/auth.ts
                    /api/groups                          -> routes/groups.ts
                    /api/groups/:groupId/imports         -> routes/imports.ts
                    /api/groups/:groupId/shopping-lists  -> routes/shopping.ts
                    /api/groups/:groupId                 -> routes/recipes.ts (also tags+collections)
                  Routers apply their own middleware via router.use("*", …).
apps/web          React 19 + Vite + TanStack Router (code-based tree) + TanStack Query + Tailwind v4.
```

Data flow on the web side: `lib/api.ts` (the ONLY place that calls `fetch`) → `lib/queries.ts`
(query keys + `queryOptions` + `invalidate.*`) → feature hooks → screens. `lib/session.tsx` holds the
session/active group and exports the `RequireAuth` / `RequireActiveGroup` guards.

Order matters in two places: register `/invites/:token` and `/invites/accept` **before** `/:groupId`
in `routes/groups.ts`; mount `imports` AND `shopping` before the catch-all `recipes` router in `src/index.ts`.

## File layout (where things live)

```
apps/api/src/
  index.ts                 app wiring — CORS(origin=WEB_ORIGIN, credentials), health, /uploads/:file
  env.ts                   zod-validated env; loads the ROOT .env itself; forces file::memory: in tests
  db/{schema,client,migrate}.ts
  lib/{errors,http,types,cookies,oauth,uploadUrls}.ts
  middleware/session.ts    requireSession / optionalSession / loadSession  (sets user, sessionId)
  middleware/group.ts      requireGroupRole(role) — resolves the group from :groupId or from
                           recipeId|collectionId|tagId|draftId|inviteId; sets membership
  middleware/staticWeb.ts  serves apps/web/dist when WEB_DIST_DIR is set (the Docker
                           single-origin setup); mounted LAST, owns the SPA fallback
  routes/{auth,groups,recipes,imports,shopping}.ts
  services/auth|groups|recipes|import|media|ocr|mail|shopping/
                           mail/: console.ts · smtp.ts (self-hosted default) · resend.ts
                           media/: thumbnails.ts (generated `<name>.thumb.webp` list images)
  scripts/{migrate,seed,ocr-prefetch,reset-password,uploads-gc}.ts
  test/                    ALL api tests (test/, NOT tests/ — tsconfig only includes test/**)
                           test/support/ shared test helpers (removeUpload — see the note below)
apps/web/src/
  router.tsx               the route tree; screens resolved lazily by lib/lazy-page.tsx
  lib/{api,queries,query-client,session,validation,format,navigation,theme,storage,pwa,persist,
       viewport,cn}.ts
  components/ui/           the ONLY UI primitives — never re-implement one
  components/layout/       AppShell, TopBar, BottomTabBar, SideNav, InstallPrompt, ErrorBoundary
  features/{auth,recipes,groups,collections,tags,import,shopping}/
```

## Navigation (four tabs, and what is deliberately NOT one)

`components/layout/nav-items.ts` is the single source: `NAV_ITEMS` is the phone tab bar
**and** the top of the sidebar; `SECONDARY_NAV_ITEMS` is sidebar-only.

| | |
| --- | --- |
| Tabs | Rezepte `/` · Einkauf `/shopping` · Importieren `/import` · Profil `/settings` |
| Sidebar-only | Gruppen `/groups` · Sammlungen `/collections` · Tags `/tags` |

**There is no sidebar below `lg`**, so everything in `SECONDARY_NAV_ITEMS` MUST also be
reachable from a tab screen, or it is unreachable on a phone:

- **Gruppen** ← the `GroupsCard` on `/settings`. Deleting that card orphans group
  management on mobile. (Switching the active group is the `GroupSwitcher` in the top
  bar, which is a different job and always visible.)
- **Sammlungen / Tags** ← the "Erweiterte Suche" panel on `/`.

**Search is not a destination.** `/search` used to be a tab rendering a second list of
recipes off the same hook; it is now a redirect to `/`, and searching is the always-visible
field plus the "Erweiterte Suche" panel in `RecipeFilters`. Do not re-add a search screen —
add to that panel instead.

## Conventions

- **Errors**: always `{ error: { code, message, details? } }` with the right status. `code` from
  `ERROR_CODES`. Never leak a stack trace. German messages.
- **Auth checks**: only via `requireSession()` + `requireGroupRole(...)`. Never inline a membership
  query in a handler.
- **IDs** `crypto.randomUUID()`. **Timestamps** integer unix ms in SQLite, ISO strings on the wire
  (`toIso()`).
- **Lists** `{ items, total, limit, offset }`, limit default 24 / max 100.
- **Uploads** max 15 MB, content type sniffed from magic bytes, stored as
  `data/uploads/<uuid>.<ext>`, client filename never trusted. List screens render the generated
  `thumbnailUrl`, never `imageUrl` — see the thumbnail gotcha.
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
- **`skipWaiting` is OFF, and turning it back on breaks code splitting.** With it on, a new worker
  claims a document still running the OLD bundle; the next lazy route then asks the NEW precache for
  an `assets/Page-<hash>.js` that no longer exists (`cleanupOutdatedCaches` deleted it on activate) →
  lazy-import failure into the ErrorBoundary. So the worker waits and `lib/pwa.ts` owns the swap:
  `update()` on `visibilitychange`/`online`/30 min (an installed iOS app only navigates at launch, so
  without this a deploy needed TWO cold starts), then `SKIP_WAITING` → `controllerchange` → reload.
  **It applies automatically only when `hasUnsavedWork()` is false**; otherwise `UpdateBanner` asks,
  and saving the form applies the pending update by itself. `controllerchange` is gated on
  `hadController` so a FIRST install (which `clientsClaim` also signals) does not reload. There is
  deliberately **no fallback timer** on the reload — a blind reload would retry a failing swap on
  every launch, i.e. a boot loop.
- **`lib/unsavedWork.ts` is the one place that answers "would a reload lose something".** A COUNTER,
  not a boolean (two screens can be dirty at once), read outside React by the update policy.
  `useNavigationGuard` registers with it, so anything that already blocks navigation also holds back
  an update — a new screen needs no extra wiring. `useDraftAutosave` registers `dirty|saving|error`
  separately, since it has no router guard. Queued shopping mutations are NOT unsaved work: they are
  in IndexedDB and replay after the reload.
- **The URL importer's SSRF guard blocks localhost/private IPs.** For local fixtures use
  `IMPORT_ALLOW_PRIVATE_HOSTS=1` (dev only, ignored in production).
- **A JSON-LD property can be a `@graph` REFERENCE, and an `@id` looks exactly like a usable URL.**
  chefkoch.de emits `"image": {"@id": "…/Rezept.html#primaryimage"}` with the real `ImageObject` as a
  sibling node, so reading the `@id` made the RECIPE PAGE the hero image (a broken `<img>` in the
  review pane) and turned `publisher`/`author` into URLs. `resolveNodeReferences()` +
  `buildIdIndex()` (`services/import/url/jsonld.ts`) inline every reference before
  `mapSchemaRecipe` sees the node; `isNodeReference()` (only `@id`/`@type` keys) is also the guard in
  `scalar()` and `imageUrls()` for a reference the page never defines. Fixture:
  `test/fixtures/import/chefkoch-graph.html` — keep it, `chefkoch-jsonld.html` is the OLD
  self-contained shape and does not exercise this.
- **The hero image is a CANDIDATE LIST, not one URL** (`HtmlExtraction.imageCandidates`, one per
  extraction layer, best first, `MAX_IMAGE_ATTEMPTS` tried). `mergeParsedFields` is first-wins, so a
  single value meant a dead JSON-LD image URL blocked the `og:image` that would have worked. Collect
  in `consider()`, i.e. BEFORE the merge.
- **`parseDuration` / `parseServings` return the UPPER bound** of a range (`"20-25 Minuten"` → 25).
  `scaleIngredients` throws `RangeError` for factor ≤ 0 and leaves `raw` untouched (provenance).
- **TWO INCOMPATIBLE pdf.js COPIES share the process.** `unpdf` (text layer) bundles pdf.js 6 and
  installs `globalThis.pdfjsWorker`; `pdf-to-img` uses `pdfjs-dist` 5, which version-checks that
  global and throws. `rasterizePdf()` in `services/ocr/pdf.ts` stashes/restores those globals and
  serializes both phases through one lock. Remove that and EVERY scanned PDF answers 422
  `pdf_no_text_layer`. `test/import/pdf-rasterize.test.ts` is the only import test that uses the real
  rasterizer — **never** `mock.module("pdf-to-img")` in it, and keep its rendered-size assertion
  (a leaked mock from another file would otherwise make it pass).
- **OAuth never auto-links on an e-mail match, even a CONFIRMED one.** Auto-linking on the old
  always-true `emailVerified` let an attacker pre-register a victim's address and capture their later
  Google/GitHub login. Linking is explicit: `GET /api/auth/oauth/:provider/link` (session +
  `toon_oauth_intent=link` cookie). There is now a confirmation flow
  (`POST /api/auth/email/verify/request|confirm`) and a real `users.email_verified_at`, but turning
  auto-linking back on is a separate decision — if you ever do, gate it on the TIMESTAMP, never on the
  boolean. `markEmailVerified()` in `services/auth/emailVerification.ts` is the ONLY writer of that
  pair; `updateUser()` deliberately cannot patch it.
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
  (`apps/web/src/features/recipes/lib/url-filters.ts`). A new filter needs a line in
  `RECIPE_FILTER_PARAMS` (`router.tsx`) — `pick()` drops anything unlisted. **`/search` must
  keep declaring the SAME params even though it only redirects to `/`**: `validateSearch`
  runs before `beforeLoad`, so a param missing there is stripped before the redirect can
  forward it, and an old `/search?q=…` bookmark would silently lose its query.
- **`/uploads/:filename` needs a signature** (`?exp&sig`, `lib/uploadUrls.ts`). Minted where a row is
  SERIALISED (`toRecipe`, `toCollection`, `toGroup`, `toPublicUser`, `toUserDto`, `toDraftWire`, the
  upload response) and stripped on every WRITE (`normalizeStoredUploadUrl`) so a column never holds an
  expiring value. `exp` is quantised to a 12 h window on purpose — a per-request `now + ttl` would
  make every image a fresh cache entry forever. Import SOURCE scans are never signed: they are private
  and only `GET /api/groups/:groupId/imports/:draftId/source` serves them. Do not "fix" that by signing
  `sourceMeta.storedPath`.
- **A failed mail send must never fail its action.** Always `trySendMail()` (returns
  `{ delivered }`, never throws), always after the row is committed. `POST /password/forgot` answers
  **204 for a known AND an unknown address**, with the rate limit enforced before the lookup — three
  things that together keep it from being a user-enumeration oracle. Don't "improve" it with a 404.
- **`bun test` gets a silent ConsoleMailer** (`env.isTest` in `services/mail/index.ts`). Tests that
  assert on mail install their own `new ConsoleMailer(() => undefined)` and read `.sent`; `bun test`
  runs every file in ONE process, so a test file that calls `setMailer()` must hand it back
  (`afterEach`/`afterAll` → `setMailer(null)`) or the next file inherits the stub.
- **THE SHOPPING LIST IS THE ONE THING EDITABLE OFFLINE, and four pieces make that safe.** Remove any
  one and it breaks in a way that is hard to see. (1) The mutations are registered with
  `setMutationDefaults` in `features/shopping/lib/offline.ts`, NOT inline in `useMutation` — a
  dehydrated mutation keeps its variables but cannot keep a function, so a replay finds `mutationFn`
  by mutation key. That file is imported by `app.tsx` FOR ITS SIDE EFFECT; the defaults must exist
  before the persister restores. (2) `networkMode: "offlineFirst"` is what makes a failed write PAUSE
  instead of fail. (3) `shouldPersistMutation` (lib/persist.ts) persists ONLY paused
  `["toon","shopping",…]` mutations, and `PersistQueryClientProvider onSuccess` flushes them with
  `resumePausedMutations()`. (4) Every queued write carries a client-minted `mutationId`, generated at
  CALL time (never inside `mutationFn`, which re-runs on replay). Drop (4) and a request that reached
  the server but lost its response is applied twice on replay — and because items MERGE, the symptom
  is "500 g Mehl" quietly becoming "1 kg", not a visible duplicate row.
- **`useCanMutate()` must NOT be used on the shopping screens.** It returns false when offline, which
  is exactly backwards for the one feature that works offline. Those screens pass `canMutate` and only
  gate *list* create/rename/delete on `isOnline` (those are genuinely online-only, so a list created
  offline never needs a client-side id that queued item mutations would have to be rewritten to).
- **`/api/groups/:groupId/shopping-lists` is `NetworkOnly` in the service worker** (`vite.config.ts`),
  deliberately, even though it is the most offline-critical screen. Its offline copy is the persisted
  TanStack cache — the same store the queued mutations live in. A `NetworkFirst` SW hit would hand
  TanStack a stale body that looks like a fresh success, and `onSuccess` would write it over the
  optimistic state, silently un-ticking items the user just checked off.
- **`foldText`/`FOLD_PAIRS` live in `@toon/shared` (src/text.ts), not in the API.** Three things must
  agree: `foldSql()` in `services/groups/support.ts` builds the SAME replacements as nested SQLite
  `replace(lower(…))` calls, the web app folds client-side for the merge preview, and the stored
  `name_key`/`merge_key` columns hold folded values. Adding a pair changes stored keys — existing rows
  keep their old key until rewritten.
- **`shoppingItemKey`'s separator is U+001F, not a space** (`packages/shared/src/shopping.ts`).
  `nameKey` output contains spaces, so with a space an item literally named "Tomaten kind:g" and
  "Tomaten" in grams would produce keys differing only in trailing whitespace — and the UNIQUE index
  would merge two unrelated lines. There is a test pinning this.
- **The persisted offline cache is namespaced per user id and purged on account change/logout**
  (`apps/web/src/lib/persist.ts`). Without that, user B sees user A's recipes on a shared phone — the
  query keys are identical. The persister reads the active user at CALL time, never captures it. The
  allow-list `shouldPersistQuery` is allow, not deny: a new endpoint is excluded until listed.
  `/api/auth/me` IS persisted (otherwise airplane mode never learns who is signed in) — hence
  `RequireAuth` renders a restored session even when the refetch failed. `/api/auth/*` and the import
  endpoints must stay out of `runtimeCaching`. `PERSIST_BUSTER` is `v2` since the blob also carries
  paused mutations.
- **`controlClasses` carries `min-w-0`, and removing it breaks phone layouts.** A form control's
  intrinsic width is ~20 characters (~200px with our padding), and a flex/grid item's automatic
  minimum size is its content's min-content width — so `w-full` alone does NOT let an input shrink.
  Two fields in a `grid-cols-2` demanded ~412px and pushed their card past a 390px phone. Same trap
  in a grid template: use `minmax(0,1fr)`, never a bare `1fr`, for a track holding a control, and put
  `min-w-0` on grid items that hold arbitrary content.
- **NEVER write `px-4 px-safe` (or `px-2 px-safe`) on one element.** `.px-safe` is
  `padding-inline: env(safe-area-inset-left)` — a flat OVERRIDE, not an addition — and the
  hand-written utilities in `styles/index.css` are emitted after everything Tailwind generates, so it
  wins over both `px-4` and `lg:px-8` (a media query adds no specificity). A phone in portrait
  reports an inset of 0, so `<main>`, the `TopBar` and `AuthLayout` had **no horizontal padding at
  all**: every screen was edge-to-edge, and the three `-mx-4` bottom bars (shopping add box, recipe
  form save bar, import review footer) bled 1rem past both screen edges — a page 2rem wider than the
  display, scrolling sideways. Use `.px-gutter` (`max(var(--gutter,1rem), env(…))`) and set the
  breakpoint gutter as a VARIABLE (`lg:[--gutter:2rem]`), never as a second padding utility. Keep
  `.px-safe` only where the inset IS the whole padding (`BottomTabBar`, `CookMode`).
- **A page component must NOT re-apply `mx-auto max-w-5xl px-gutter pt-4 pb-tabbar`** — `AppShell`'s
  `<main>` already does all four. `ImportReviewPage`'s `PageShell` did, which cost a phone 32px of
  the 390 it has and doubled the bottom padding. Page roots here are plain `flex flex-col gap-4`.
  Ten of them had drifted back to `pb-tabbar` anyway: on the shopping list that stranded the sticky
  add bar a whole tab-bar height above the tab bar. Grep before adding one.
- **A `sticky bottom-*` bar can only be pushed UP, never DOWN**, so on a SHORT page it floats
  wherever the content happens to end — which on the shopping list (empty = the common case) left the
  add box mid-screen, ~200px above the tab bar. It needs real height above it, and that has to be an
  unbroken FLEX CHAIN: the shell column is `min-h-dvh`, `<main>` is `flex-1` **and** `flex flex-col`,
  the page root is `flex-1`, and a `flex-1` spacer sits above the bar. `min-h-full` on the page root
  reads as equivalent and measurably is not — a percentage min-height needs a definite parent height
  and a flex-GROWN item is not one, so Chromium left the root at its content height (493px inside a
  695px main) and the bar stayed where it was. The bar also carries `-mb-4` to swallow the 1rem of
  breathing room inside `pb-tabbar`, or a strip of page background shows under it.
- **Verify a phone layout in a real headless browser, not by reading Tailwind classes.** Both of the
  above measured wrong on the first attempt and only the screenshots showed it. There is no browser
  tooling in this repo on purpose (playwright would drag in a ~115 MB Chromium), but installing it in
  a scratch dir outside the repo and driving the dev servers takes two minutes: log in with a `fetch`
  to `/api/auth/login` from the page context (same-site cookie, so `credentials: "include"` is
  enough), then assert `documentElement.scrollWidth === clientWidth` (horizontal overflow),
  `getComputedStyle(main).padding*`, and the gap between a bottom bar and `nav.fixed`. Do NOT match
  the tab bar by its aria-label — `SideNav` carries the same one and, being `display:none` on a
  phone, reports an all-zero rect that reads as a plausible-looking wrong number.
- **A LIST never renders `imageUrl`; it renders the generated `thumbnailUrl`.** A recipe hero image is
  a phone photo or a downloaded original, routinely 2–5 MB, and a list asks for 24 of them — one screen
  was tens of megabytes. `services/media/thumbnails.ts` derives `<name>.thumb.webp` (480 px WebP,
  ~30 KB) NEXT TO the original, as one flat filename, which is the whole trick: signing, verification,
  traversal checks and the GC sweep all keep working unchanged. Four things to know before touching it.
  (1) It is built **on demand** by `GET /uploads/:filename`, because the URL is minted from the row
  (`toRecipe`), which knows nothing about the disk — that is what makes every pre-existing recipe work
  with no backfill. `warmThumbnail()` is only a head start, and it is a **no-op under `bun test`**: an
  unawaited write into the shared `data/uploads` lands after the test cleaned up and orphans a file
  every run. (2) A conversion that FAILS serves the **original** with a short `max-age`, never a 404 —
  sharp may be absent or built without HEIF, and a 404 would turn a fine recipe into a broken `<img>`.
  (3) The name is the FULL original plus the suffix (`x.jpg.thumb.webp`), so the source is recoverable
  by string, without scanning the directory for the extension. (4) No row references a derivative, so
  `uploads:gc` keeps it while its original is referenced — and `deleteUpload()` removes both. Web side:
  `thumbnailUrl()` in `lib/api.ts` (falls back to `imageUrl`); detail screens keep the big one.
- **The recipe list switches MARKUP at `sm`, in JS, and `sm:hidden` on both is the trap.** A
  `display:none` `<img>` is still fetched, so rendering `RecipeRow` and `RecipeCard` together would
  load every image twice. `useIsWideViewport()` (`lib/viewport.ts`) picks one. The row exists because
  a card leads with a 4:3 image: on a 390 px phone that is ~380 px per recipe, i.e. one recipe per
  screen. `SkeletonList`'s `variant` must match the branch or the list visibly jumps when data lands.
- **A header gets ONE overflow trigger, not a row of icon buttons.** `RecipeDetailPage`'s title row
  had five (teilen · kopieren · drucken · duplizieren · löschen) plus a Bearbeiten button: on a 390px
  phone that is ~240px stolen from the `<h1>` beside it, and because two of them are gated on
  `canEdit` the row's width — and therefore the title's wrapping — changed as the permission
  resolved. They now live in `ActionMenu` (`components/ui/ActionMenu.tsx`), which is `Dialog`-based
  like `GroupSwitcher` (sheet on phones, centred panel from `sm`) so Escape, the focus trap and the
  scroll lock come for free. It closes BEFORE running an item and defers the callback by one
  `requestAnimationFrame`: the panel is a PORTAL outside `.recipe-print`, so `window.print()` fired
  from the same handler would print the open menu over the recipe. Falsy items are filtered, so
  `canEdit && {…}` is the way to gate one.
- **Text next to an icon in a `flex` `<p>` must be ONE child.** Left bare, every text run and every
  `<span>` becomes its own flex item: each gets the container's `gap` around it and wraps
  independently, so emphasised words drift apart and punctuation starts its own line. Wrap the
  sentence in a single `<span>` (the "Getestet mit chefkoch.de und …" hint on `/import`).
- **A bottom action bar needs `bottom-tabbar`, never `bottom-0`.** `BottomTabBar` is `fixed
  inset-x-0 bottom-0 z-30` and `AppShell` renders it AFTER `<main>`, so a `bottom-0` bar in a page is
  painted underneath it and simply cannot be tapped on a phone. That is what hid Speichern/Verwerfen
  on the import review screen — the whole reason a URL import could not be committed from a phone —
  and it kept `RecipeForm`'s save bar under the tabs for the whole scroll. The `.bottom-tabbar`
  utility (`styles/index.css`, resets to `bottom: 0` from `lg`) is the fix; prefer `sticky` over
  `fixed` so the bar stays in flow and `pb-tabbar` on the page is all the clearance needed. Grep
  `bottom-0` before adding a new bar.
- **An idle TanStack mutation reports `error: null`, not `undefined`.** So
  `apiFieldErrors(mutation.error)` on every render pass — which is what `RecipeForm` does with the
  `error` prop `RecipeNewPage`/`RecipeEditPage` hand it — used to greet the user with a red
  "Etwas ist schiefgelaufen / Unbekannter Fehler." above a form they had not submitted. Fixed at the
  source: `apiFieldErrors` returns `{}` for nullish, and `RecipeForm` tests `error == null`. `unknown`
  accepts `null`, so `tsc` will never catch a repeat — keep `lib/validation.test.ts`.
- **`build.sourcemap` is off** so the client TypeScript is not published with the bundle.
- **`mock.module` LEAKS ACROSS TEST FILES and bun never restores it, and the file execution order is
  FILESYSTEM order, not alphabetical.** Both halves matter: `bun test` runs every file in one process,
  so a stub installed in one file is still installed in the next; and which file is "next" differs
  between a working copy and a fresh clone, so the resulting failure appears only on some machines.
  This is exactly how `ocr-segment.test.ts` (which stubs `pdf-to-img`) broke `pdf-rasterize.test.ts`
  in CI while passing locally — one failing test, in ~3 ms, on the rendered-size assertion.
  So: **a file that calls `mock.module()` must hand the module back in `afterAll`**, same rule as
  `setMailer(null)`. And it must snapshot the real export **by value** at module-evaluation time
  (`const realPdf = pdfToImg.pdf`) — a namespace object is a LIVE view of the registry, so
  `mock.module(spec, () => namespace)` restores the stub over itself and silently does nothing.
  `bun test a.ts b.ts` does NOT let you control the order, so ordering cannot be tested that way;
  inject a stub into a file that already runs earlier instead.
- **Bun 1.3 uses the ISOLATED linker for workspaces**, so `node_modules/` at the root holds nothing
  but the `.bun` store and each workspace gets its OWN symlink tree. A Dockerfile that copies only
  `/app/node_modules` builds and starts fine and then dies on the first request with
  `Cannot find module '@libsql/client'`. All three paths have to be copied: root,
  `apps/api/node_modules`, `packages/shared/node_modules`.
- **`new TLSSocket(socket, { isServer: true })` never completes a handshake under Bun**, so the
  server side of a STARTTLS upgrade cannot be written the obvious way — and it hangs identically
  whether or not the client is correct, which makes it useless as a test. The client side
  (`tls.connect({ socket })`, which `services/mail/smtp.ts` uses) is fine. The fake relay in
  `test/mail/smtp.test.ts` therefore pipes the plaintext socket into a real `tls.createServer()`
  once its 220 is on the wire. Do not "simplify" that back into a TLSSocket.
- **`servername` must be omitted for an IP literal.** Node throws `ERR_INVALID_ARG_VALUE` outright,
  and `MAIL_HOST=192.168.1.20` is a normal self-hosted config — hence `sni()` in `smtp.ts`.
- **`sw.js` and `index.html` must never be cached**, and `middleware/staticWeb.ts` is the only thing
  enforcing it now that the API serves them. Cache either one and the app can never update itself
  again; the symptom is "the Pi serves a stale app for days". Hashed `/assets/*` are immutable, and
  `.webmanifest` needs `application/manifest+json` or the install prompt silently never appears.
- **A missing file WITH an extension must 404, not fall back to the SPA shell.** Answering HTML for a
  missing `.js` produces a MIME console error that says nothing about the real problem.
- **`docker/Caddyfile`'s `header_up X-Forwarded-For {remote_host}` stays, even though Caddy logs it
  as "unnecessary".** Measured: Caddy's default already drops a client-supplied `X-Forwarded-For`,
  but adding a `trusted_proxies` line (a common copy-paste) makes the forged value the FIRST entry —
  which is the one `clientIp()` uses, so every rate limit becomes a no-op. The overwrite survives
  that.
- **A self-signed certificate alone does NOT give you the PWA.** An untrusted-CA origin is not a
  secure context even after the user clicks through, so the service worker never registers and the
  offline shopping list is dead. Caddy's local CA root must be installed per device
  (`http://<host>/toon-root-ca.crt`, served over plain http on purpose — a device that does not trust
  the CA yet cannot fetch it over the HTTPS that CA signed).
- **Mailpit is bound to `127.0.0.1` in compose, not the LAN.** Its UI shows every password-reset and
  invite link, so LAN access there is account takeover for anyone on the wifi. Reach it via
  `ssh -L 8025:127.0.0.1:8025`.
- **`/app/data` is a VOLUME, so anything written there at build time is invisible at runtime.** The
  OCR traineddata is therefore baked to `/app/seed/tessdata` and copied in by `docker/entrypoint.sh`
  when the volume has none. Prefetching straight into `/app/data` looks like it works and silently
  re-downloads ~15 MB on every fresh volume.
- **Never verify a Docker build through a pipe** (`docker build … | tail`): the pipeline's exit code
  is `tail`'s, so a failed build reads as success. Redirect to a file and check `$?`.

## Verification gates

All four must be clean before calling anything done:

```bash
bun install
bun run typecheck    # tsc for packages/shared, apps/api, apps/web
bun test             # 858 tests
bun run build        # vite build + PWA
```

Plus, for anything touching persistence or auth: `bun run db:migrate` and `bun run seed` against a
fresh `file:` DB, then the curl walkthrough in README.md ("Smoke test against a real server").

For anything touching the Dockerfile, the compose stack or `middleware/staticWeb.ts`, the image has
to be built and the stack actually run — a Dockerfile can be wrong in ways no test catches:

```bash
docker build -t toon-recipe:local . > /tmp/build.log 2>&1; echo $?   # NOT through a pipe
docker compose --env-file .env.local-stack -p toonstack up -d        # see docs/deployment.md
```
