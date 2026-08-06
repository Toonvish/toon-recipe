# CLAUDE.md — toon-recipe

Context for future sessions in this repo. Read `docs/API.md` (endpoint contract) and `README.md`
(setup + known gaps) alongside this file.

**Those four deferred gaps are DONE.** `docs/open-work.md` now records what shipped for each (mailer ·
password reset · signed `/uploads` · read-only offline) and the decision behind it. Read it before
touching any of them — in particular before adding a cookie check to `/uploads` (cross-origin `<img>`
sends no cookies, which is why the fix is a signature) and before re-enabling OAuth auto-linking (the
old always-true `emailVerified` was an account-takeover; `email_verified_at` is now the only evidence
that counts, and auto-linking is still deliberately off).

**What it is:** a recipe manager for families/flatshares, **German-first in its CONTENT and
bilingual (de/en) in its INTERFACE**. Multi-user, group-shared recipes, import from URL / photo /
PDF, mobile-first installable PWA. Bun workspaces monorepo.

**Those two languages are different axes and confusing them is the fastest way to wreck this
codebase** — see the interface-vs-content gotcha below and `docs/i18n.md`. The recipe *parsers* are
still German-only on purpose; only the *chrome* speaks two languages.

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
6. **OCR is server-side** (NATIVE `tesseract` in a subprocess, `deu+eng`, German first, `sharp`
   preprocessing; PDFs rasterized by poppler's `pdftoppm`) behind the
   swappable `OcrEngine` interface in `src/services/ocr/`, and **photo/PDF import is OPT-IN**:
   `IMPORT_OCR_ENABLED` is off by default and the Docker image only carries the binaries for
   `--build-arg WITH_OCR=1`, so the app fits a small VPS on URL + text import alone. See
   `services/import/capabilities.ts` and the gotcha below.
   **Mail uses the same shape**: `Mailer`
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
8. **German-first CONTENT**: German units (`g kg ml l EL TL Prise Bund Pck. Stück Dose …`), unicode
   fractions, ranges (`2-3 Eier`), ISO-8601 durations. This is the language recipes are *written in*
   and it does NOT vary with the viewer.
10. **INTERFACE language is de + en**, through a small hand-rolled typed catalog layer
   (`packages/shared/src/i18n` + `apps/web/src/lib/i18n`, no i18n dependency). Flat dotted
   namespace-prefixed keys, `de` is the source catalog and `en` is typed as
   `LocaleCatalog<typeof de>` so a missing or mis-shaped key is a **compile** error, not a runtime
   warning. `de` remains the default (`DEFAULT_LOCALE`) and every German string is byte-identical to
   what shipped before the port. The server negotiates per request from `Accept-Language`
   (`lib/locale.ts`), mail renders in the *recipient's* `users.locale`, and `ApiError` carries a
   typed `ServerKey` rather than a sentence. See `docs/i18n.md`.

## Architecture

```
packages/shared   Zod schemas + inferred types + PURE parsers + the i18n runtime and the SERVER
                  catalogs (errors/validation/mail). Single source of truth for every
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
  lib/locale.ts            localeMiddleware + requestLocale(c) — negotiates Accept-Language
  middleware/session.ts    requireSession / optionalSession / loadSession  (sets user, sessionId)
  middleware/group.ts      requireGroupRole(role) — resolves the group from :groupId or from
                           recipeId|collectionId|tagId|draftId|inviteId; sets membership
  middleware/staticWeb.ts  serves apps/web/dist when WEB_DIST_DIR is set (the Docker
                           single-origin setup); mounted LAST, owns the SPA fallback
  routes/{auth,groups,recipes,imports,shopping}.ts
  services/auth|groups|recipes|import|media|ocr|mail|shopping/
                           mail/: console.ts · smtp.ts (self-hosted default) · resend.ts
                           media/: thumbnails.ts (generated `<name>.thumb.webp` list images)
  scripts/{migrate,seed,reset-password,uploads-gc}.ts
  test/                    ALL api tests (test/, NOT tests/ — tsconfig only includes test/**)
                           test/support/ shared test helpers (removeUpload — see the note below)
apps/web/src/
  router.tsx               the route tree; screens code-split with TanStack's
                           lazyRouteComponent (NOT a hand-rolled React.lazy wrapper —
                           the router preloads via component.preload(), which only
                           lazyRouteComponent attaches). Two pathless layout routes:
                           "app" = needs a session, "group-scoped" = needs an active group
  lib/{api,queries,query-client,session,validation,format,navigation,theme,storage,pwa,persist,
       viewport,cn}.ts
  lib/i18n/                store.ts (ambient locale + translate()) · I18nProvider.tsx (useT/useLocale)
                           locale.ts (device resolution, <html lang>) · catalogs/<ns>.{de,en}.ts
  components/ui/           the ONLY UI primitives — never re-implement one
  components/layout/       AppShell, TopBar, BottomTabBar, SideNav, InstallPrompt, ErrorBoundary
  features/{auth,recipes,groups,collections,tags,import,shopping}/
```

## Navigation (four tabs, and what is deliberately NOT one)

`components/layout/nav-items.ts` is the single source: `NAV_ITEMS` is the phone tab bar
**and** the top of the sidebar; `SECONDARY_NAV_ITEMS` is sidebar-only. The items carry catalog
**keys**, not labels — resolving at import time would freeze the tab bar at whatever locale loaded
first. The German labels below are what a `de` user sees.

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
  `ERROR_CODES` — a code is a **wire contract, never renamed**. Never leak a stack trace. `message`
  is rendered in the locale the request negotiated; the call site passes an `ErrorText`
  (a `ServerKey`, or `{ key, values }`), never a sentence — `tsc` rejects a literal. `Error.message`
  itself stays English so ops output is one language.
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

- **INTERFACE LANGUAGE AND CONTENT LANGUAGE ARE TWO DIFFERENT AXES, and mistaking one for the other
  is the most damaging edit you can make here.** *Interface* = UI copy, error messages, validation
  messages, mail, date/number formatting. It is bilingual and goes through the catalogs. *Content* =
  the German recipe vocabulary the parsers read and the app stores: `units.ts`, `ingredients.ts`,
  `numbers.ts`, `duration.ts`'s `parseDuration`, `text.ts`'s `FOLD_PAIRS`/`foldText`, `foldSql()`,
  the `recipes.*_fold` columns, `ocr/segment.ts`, `ocr/quantity-fix.ts`, `url/schema-map.ts`, the
  importer's outbound `Accept-Language: de-DE…`, `TESSERACT_LANGS=deu+eng`, `scripts/seed.ts`, and
  `recipes.language` / `draft.language` (which default to `"de"` and describe the RECIPE TEXT).
  **None of that may be routed through `t()` or made to depend on the viewer's locale**, and no
  German vocabulary may be deleted from it — an English-UI user importing a German page must still
  parse `250 g Mehl`. `duration.ts` is the file that shows the split cleanly: `parseDuration` is
  content and German-only, `formatDuration(minutes, locale)` is interface and takes a locale.
  Conversely `users.locale` is interface-only and must never be wired to `recipes.language`.
- **The i18n layer is hand-rolled and its typing is the enforcement, not a lint.** `de` catalogs are
  `as const satisfies NamespaceCatalog<"prefix">`; each `en` catalog is annotated
  `LocaleCatalog<typeof thatDeCatalog>`, a mapped type over the `de` keys — so a key missing from
  `en`, an extra key, or a plural-vs-string mismatch is a **compile** error. `t()` keys are
  `keyof C & string`, so a typo cannot compile either. The runtime missing-key path (returns the key,
  warns once in dev) exists only for a key that arrived **off the wire** from a server of a different
  version; that is what `resolveWireKey` is for, and its callers must fall back to the wire's own
  `message`, never to the raw dotted key. Namespace prefixes keep the merge order-independent.
  A label map frozen at import time cannot follow a locale switch — which is why
  `lib/format.ts`'s `roleLabels`/`difficultyLabels` are gone in favour of
  `ROLE_LABEL_KEYS`/`DIFFICULTY_LABEL_KEYS` (wire values unchanged, only the label moved). Do not
  re-add a label map. Components use `useT()` so they re-render on a switch; `translate()` from
  `lib/i18n/store.ts` is the escape hatch for code OUTSIDE React only (it typechecks inside a
  component and renders stale copy there, which is what makes it dangerous).
- **German copy is a REFACTOR, not a rewrite: every `de` value must be byte-identical to what the app
  rendered before the i18n port.** Umlauts, `„low-high“` quotes, en-dashes, trailing colons and
  ellipses are all part of the string. `scripts/i18n-check.ts` check 1 greps the base commit to prove
  it. If a sentence was assembled from a ternary or a `{" "}` across two JSX lines, it becomes ONE key
  per whole sentence — never a key per fragment, or a language with different word order cannot be
  translated. Ops output is the exception: `console.*`, `env.ts`'s boot validation, `smtp.ts`'s thrown
  connection errors, `ConsoleMailer`'s ASCII box and the CLI scripts are **English literals, never
  keyed** — one language in a log is a feature.
- **THE IMPORT FEATURE'S ERRORS CARRY KEYS, NOT SENTENCES, and that is not decoration.**
  `ImportApiError`'s `title`/`hint` are `ImportErrorText` — `{ key, values? }` or `{ text }` — and
  `describeError()` returns the same. `importApi.ts` is not a component, so it has no `useT()`; using
  the ambient `translate()` there would freeze the copy at THROW time, and `useAutosave` holds a save
  error in React state for as long as the review screen is open, so a language switch would strand a
  stale sentence on screen. Rendering therefore belongs to `lib/importErrorText.ts`:
  `useImportError(error)` in a component, `resolveDescribedError(t, error)` where a hook cannot go
  (inside an `if` branch that returns early, or in a `useCallback` firing a toast). `Error.message`
  deliberately holds the KEY — a translated log line is unsearchable and depends on who was looking
  at the screen. The `{ text }` variant exists because the server's `message` arrives ALREADY
  localised (it negotiated `Accept-Language`) and a library's `Error.message` has no key; note this
  is the opposite of the server-side `ErrorText`, where a pass-through variant was deliberately
  rejected as the loophole that would keep German in handlers. **An empty pass-through string must
  fall back to a key** (`passThroughOr()`) — `describeError()` hands `toImportApiError()`
  `message: ""` for a shell `ApiError` that carries none, and `readJson()` synthesises the same for
  an unparseable body, so passing it through renders a blank headline.
  `test/…/importErrors.test.ts` walks every status/code branch and asserts the key exists in BOTH
  catalogs; `tsc` cannot cover that, since `{ text }` is untyped by design.
- **The language picker's third state is `"system"`, and it is NOT a synonym for `de`.**
  `LocalePreference = Locale | "system"`, encoded exactly like `ThemePreference`: **absent from
  `localStorage` means system**, so `setLocalePreference("system")` REMOVES the key rather than
  storing a resolved locale, and the device keeps following `navigator.languages` afterwards.
  Collapsing the two states is what would show "Deutsch" to somebody who has never chosen anything
  and is only seeing German because their phone is. `useLocalePreference()` (`I18nProvider.tsx`) owns
  the picker state and registers a `languagechange` listener that only acts while the preference is
  `"system"` — re-resolving under an explicit choice would silently overrule the user. The PATCH to
  `users.locale` sends the RESOLVED locale, never `null`: that column exists only so mail can pick a
  language, and the server cannot see `navigator.languages`. It must stay fire-and-forget (a TanStack
  mutation would pause offline for no benefit and `shouldPersistMutation` would not persist it
  anyway). The two language names are **autonyms and identical in every catalog** — a user who
  switched to a language they cannot read needs a way back.
- **THE CONNECTION PRAGMAS IN `db/client.ts` ARE LOAD-BEARING, and `synchronous` has to be re-sent on
  every connection.** libSQL's defaults are `journal_mode=delete` + `synchronous=FULL`, i.e. a full
  fsync per statement: a single-row INSERT measured **15.5 ms** on ext4/NVMe, 5.2 ms with WAL alone and
  **0.04 ms** with WAL + `synchronous=NORMAL`. On the slow storage of a cheap VPS the untuned figure
  is far worse. It
  is paid by every shopping-list write (so by every replayed offline mutation) and by the
  `sessions.last_used_at` refresh any request older than a minute triggers. `journal_mode` is
  PERSISTENT in the file, but **`synchronous` is per-connection** — which is why this lives in
  `createDatabase()` and not in a migration; a connection that skips it silently pays 5 ms a write.
  They are skipped for `:memory:` and for remote `libsql://` (not our storage engine), a rejected
  PRAGMA only warns, and `src/index.ts` awaits `dbReady` so an unopenable DB fails at boot.
  `synchronous=NORMAL` under WAL can lose the last transactions to a power cut, never to a process
  crash — the right trade for a recipe box, not for a ledger.
- **A local libSQL file is ONE SERIALISED LANE, and a connection pool does not change that.** Measured:
  8 parallel copies of the same query take 8× as long as one, whether they share a client or use eight
  (292 ms vs 288 ms). It does NOT block the event loop — `/api/health` stays at 0.06 ms throughout — so
  the symptom is only that DB-touching requests queue behind each other. The lever is therefore making
  queries cheaper, never adding concurrency: the same fix that took search from 36 ms to 4.5 ms took 16
  concurrent searches from 582 ms to 88 ms. Do not add a read pool expecting throughput.
- **libSQL 0.17.4 discards a `file::memory:` DB on transaction commit.** Use a temp file DB in any
  test that touches a transaction. `withTransaction()` in `services/groups/support.ts` already
  degrades to sequential statements on memory DBs.
- **`bun test` forces `DATABASE_URL=file::memory:`** (`NODE_ENV=test` in `env.ts`), so a developer
  `.env` can never point tests at the real DB. Override with `TEST_DATABASE_URL`.
- **`apps/api/tsconfig.json` only includes `test/**`** — never create `apps/api/tests/`, it would be
  invisible to `bun run typecheck`.
- **`apps/web` IS THREE TS PROJECTS, one per runtime, because tsc has ONE global scope per
  program.** `tsconfig.json` = the browser app (`types: ["vite/client"]`, and it EXCLUDES
  `src/**/*.test.ts`); `tsconfig.test.json` = the co-located `bun test` files (adds `bun`, and
  `exclude: []` to undo the parent's); `tsconfig.node.json` = `vite.config.ts` alone (`types: []`,
  extends the ROOT config, no DOM). Merging any two back together puts that runtime's globals in
  scope everywhere: with `bun` in the app project `Bun.env` compiles inside a component, and
  `vite.config.ts` in it is what used to make `process.env` and Node's `Timeout` legal there. There
  is no shim for `bun:test` any more — `@types/bun` is a root devDependency and resolves from every
  workspace. `scripts/typecheck.ts` lists all three explicitly (nothing discovers them), and
  `references`/`composite` is NOT an option: TS 7 rejects a referenced project that disables emit
  (TS6310), so an editor may fall back to an inferred project for a test file.
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
- **PHOTO/PDF IMPORT IS A FEATURE FLAG, AND IT IS OFF BY DEFAULT** (`IMPORT_OCR_ENABLED` →
  `env.ocrImportEnabled`, read only through `isOcrImportEnabled()` in
  `services/import/capabilities.ts`). URL and text import are pure fetch-and-parse; OCR needs
  `tesseract` + `pdftoppm` (~120 MB with language data) and holds sharp, a ~2000 px bitmap and
  `unpdf`'s parsed document per job, which is what a small VPS cannot spare. Five things hang
  together and all five matter:
  - **Only the three upload routes are gated** (`/imports/image`, `/pdf`, `/file` → **501
    `ocr_disabled`**). `/url`, `/text`, drafts, review and commit stay available, so a draft an
    earlier photo import created is still reviewable and committable. The services are NOT gated —
    they keep their unit tests, and an unreached route never loads sharp/unpdf.
  - **`assertOcrImportEnabled()` runs FIRST in the handler**, before `enforceRateLimit` and before
    the multipart body is read. Otherwise a disabled endpoint would buffer 15 MB and burn a
    rate-limit slot to produce a 501 — `test/import/ocr-disabled.test.ts` pins both.
  - **501, not 503 or 404.** It is how the server was built, not an outage, and retrying cannot
    help; 404 would also make a stale PWA look like a routing bug.
  - **The UI hides it via `features.ocrImport` on `/api/health`** (`useOcrImportAvailable()`), and
    **unknown counts as unavailable** — while the probe is in flight, offline, or against a server
    predating the field. Briefly hiding a working button is self-correcting; offering a missing one
    sends the user through an upload to a 501. The 501 is still the enforcement, because an
    installed PWA can be running a bundle from before the flag was flipped.
  - **The seam is `setOcrImportEnabled()`**, because `env` is frozen at module load. Same rule as
    `setMailer`: a test file that sets it MUST hand it back in `afterAll`, or every later file
    inherits it. `test/import/routes.test.ts` turns it ON; `ocr-disabled.test.ts` asserts OFF is the
    default and sets it explicitly rather than trusting env.
- **The Dockerfile installs the OCR binaries only for `--build-arg WITH_OCR=1`**, and
  `IMPORT_OCR_ENABLED` DEFAULTS TO THAT ARG (`ENV IMPORT_OCR_ENABLED=${WITH_OCR}`), so a slim image
  cannot advertise a feature it lacks. Setting the flag on a slim image is not a crash — it degrades
  to the documented 422 naming the missing binary — but it is pointless. `tini` stays in both
  variants: it is PID 1 for the container, not just the tesseract reaper.
- **OCR AND PDF RASTERIZATION ARE NATIVE SUBPROCESSES, not libraries.** `services/ocr/tesseract.ts`
  spawns `tesseract`, `services/ocr/pdf.ts` spawns poppler's `pdftoppm`, and the Docker image
  installs `tesseract-ocr`, `tesseract-ocr-deu`, `tesseract-ocr-eng` and `poppler-utils`. This
  replaced `tesseract.js` (WASM: same models, several times the peak memory, ~15 MB of language data
  loaded into the API process) and `pdf-to-img`, and it is why the deployment no longer needs 2 GB of
  RAM. Consequences worth knowing before you touch it:
  - **A missing binary must stay the documented 422**, never a module-load crash — `ocr_failed`
    (`reason: "tesseract_unavailable"` / `"language_data_missing"`) and `pdf_no_text_layer`
    (`reason: "rasterization_unavailable"`). `TESSERACT_BIN`/`PDFTOPPM_BIN` override the paths.
  - **Adding a language to `TESSERACT_LANGS` needs its `tesseract-ocr-<lang>` package in the
    Dockerfile.** Nothing is downloaded at runtime any more, so a missing pack fails at recognise
    time, not at boot.
  - **One tesseract run writes BOTH `txt` and `tsv`, on purpose.** Only the txt renderer honours
    `preserve_interword_spaces` (which keeps "250 g   Mehl" aligned); only the tsv carries per-word
    confidence. Rebuilding the text from tsv word boxes collapses every run of spaces to one. Writing
    to stdout can emit only ONE format, hence the temp dir.
  - **`parseTesseractOutput` is pure so `bun test` can cover it without the binary** — no test runs
    real OCR, and most dev machines have no `tesseract`. Verify the binary itself by building and
    running the image.
  - **`MAX_CONCURRENT_OCR` is now the ONLY bound on OCR concurrency** (the tesseract.js engine also
    serialized internally, because one WASM worker cannot recognise twice at once). It is therefore
    directly the peak number of concurrent tesseract processes.
  - **The abort signal is now real for OCR** — aborting kills the child — but `withOcrTimeout` must
    STILL be a `Promise.race`, because `unpdf` remains cooperative-only.
- **`test/import/pdf-rasterize.test.ts` is the only test that uses the REAL rasterizer**, it needs
  `pdftoppm` on the machine (CI installs it), and it must keep failing rather than skipping when the
  binary is absent — a silent skip is how the fallback stayed dead the first time. Never stub the
  rasterizer in that file; keep its rendered-size assertion, which a leaked stub would otherwise
  satisfy. Everywhere else, stub via `setPdfRasterizer()` and reset it in `afterEach` — NOT
  `mock.module`, see the mock-leak gotcha below.
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
  `Promise.race` — `unpdf` still ignores the abort signal even though OCR now honours it.
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
- **`delivered` ALONE IS NOT "a mail went out" — the ConsoleMailer resolves too.** It logged the
  message, which is all it promises, so `emailSent: sent.delivered` reported an install with no
  MAIL_TRANSPORT as a successful send and the invite panel announced a mail nobody would ever get.
  `mailDeliveryOf()` (`services/mail/index.ts`) is the only correct reading: it keys off the
  TRANSPORT NAME, same rule as `isMailConfigured()`, and returns the contract's three states —
  `sent` · `not_configured` (console: fine, forward the link by hand) · `failed` (a configured relay
  refused: a broken deployment, somebody has to read the log). The UI colours those three
  differently (`InvitePanel`, `EmailVerificationCard`) and **must never render the last two as
  success**. `/api/auth/email/verify/request` returns the status (200 `{ mailDelivery }`, no longer
  204) because it is authenticated and mails only the session's OWN address; **`/password/forgot`
  deliberately does NOT**, since a delivery status there would reveal whether the address has an
  account. Keep that asymmetry.
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
- **`foldText`/`FOLD_PAIRS` live in `@toon/shared` (src/text.ts), not in the API.** FOUR things must
  agree: `foldSql()` in `services/groups/support.ts` builds the SAME replacements as nested SQLite
  `replace(lower(…))` calls, the web app folds client-side for the merge preview, the stored
  `name_key`/`merge_key` columns hold folded values, and so do the recipe `*_fold` columns. Adding a
  pair changes stored keys — existing rows keep their old key until rewritten.
- **`FOLD_PAIRS` CANNOT BE COMPLETED, and it is deliberately half-finished.** SQLite's `lower()` folds
  ASCII only, so `foldSql()` needs the UPPERCASE twin of every accent to match `foldText()` — but the
  parser overflows at 31 nested `replace()` calls (measured against libSQL 0.17.4: 30 works, 32 is
  `parser stack overflow`), and the full table needs 40. So only `Ä/Ö/Ü` are listed and `foldSql()`
  genuinely disagrees with `foldText()` for an uppercase `È`/`Ç`/`ẞ`. That is survivable because
  `foldSql()` now only runs on small tables (tag/collection/list names); everything on the recipe path
  folds in JS. **Do not "fix" this by adding the missing uppercase pairs — it breaks `foldSql()`
  outright**, and do not write a fold in SQL for anything new.
- **Recipe search reads PRE-FOLDED columns; the fold is never computed per row.** `recipes.title_fold`
  / `description_fold` and `recipe_ingredients.name_fold` are written by the app with `foldText()`
  (`likeStoredFold()` compares against them; `likeFolded()` is the expensive per-row version, kept for
  the small tables). It used to fold in SQL, and because the `total` half of the list envelope is a
  `count(*)` that cannot stop early, EVERY row's title and description were folded on EVERY search:
  36 ms at 2000 recipes, 91 ms for a term matching nothing, growing linearly with the library. Four
  things to know before touching them:
  - **They are `.notNull()` with NO drizzle default, on purpose.** That makes them required in
    `$inferInsert`, so `tsc` fails on an insert site that forgets one instead of storing NULL and
    making the recipe unfindable. There are three such sites (`recipes.service.ts`,
    `import/commit.ts`, `scripts/seed.ts`) plus tests. The migration adds the columns with a SQL-level
    `DEFAULT ''` because SQLite cannot add a NOT NULL column to a populated table without one — a
    deliberate schema/DB divergence, and the reason `db:generate` offers to "fix" it. Decline.
  - **A GENERATED column is not available.** libSQL 0.17.4 bundles **SQLite 3.45.1**, which rejects
    `ALTER TABLE … ADD COLUMN … GENERATED ALWAYS AS (…) STORED` ("cannot add a STORED column").
  - **The backfill is JS, not SQL** (`backfillFoldedColumns()` in `db/migrate.ts`, run by
    `runMigrations`). It must be: reproducing `foldText()` in SQL is impossible for an uppercase accent
    (see the FOLD_PAIRS gotcha). It is idempotent and keyed on `fold = '' AND source <> ''` — `''` is a
    legitimate fold for a recipe with no description, so the SOURCE column has to decide. It runs
    WITHOUT a transaction on purpose: `runMigrations` runs against `file::memory:` in every integration
    test, and a commit there would discard the database.
  - **`?sort=title` orders by `title_fold`** so `recipes_group_title_fold_idx` can supply the order;
    ordering by the equivalent expression forced `USE TEMP B-TREE` over the whole group (6.7 ms → 1.1 ms).
    That index replaced `recipes_group_title_idx` on the raw title, which no query could use.
- **`bun:sqlite` IS A NEWER SQLite THAN THE ONE THE APP USES** — 3.53 against libSQL's 3.45.1 — so a
  migration or query verified only through `bun:sqlite` can be accepted there and rejected in
  production. Generated columns are exactly that trap. Verify DDL through `@libsql/client`.
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
- **A `<fieldset>` carries the browser's own `min-inline-size: min-content`**, so it ignores the
  `min-w-0` rule you would apply to any other flex/grid item — and a horizontal scroller inside one
  cannot shrink. That is how the tag row in "Erweiterte Suche" (which IS a `scroll-x`) grew the
  fieldset to 580px on a 390px phone and made the whole page scroll sideways. Every `<fieldset>`
  wrapping arbitrary content needs `min-w-0` explicitly (`AddRecipeToListDialog` already had it).
- **`block` beats `line-clamp-N`.** The clamp works by setting `display: -webkit-box`; a `block`
  utility on the same element wins in the cascade and the clamp silently does nothing. Drop `block`,
  and when a breakpoint needs single-line truncation instead use `sm:line-clamp-none sm:block
  sm:truncate` — in that order of intent, since the `sm:` rules are emitted later.
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
- **`apple-mobile-web-app-status-bar-style: black-translucent` is banned from `index.html`.** Since
  iOS 11 that value does not float the status bar over the page: it pushes the whole document DOWN
  by the status-bar height AND leaves the layout viewport short by the same amount. So a home-screen
  install rendered every screen — `BottomTabBar` included, `fixed bottom-0` being measured against
  that short viewport — a status-bar height above the physical bottom edge, with a strip of page
  background beneath it. The strip is the page's own colour, so it reads as a layout bug rather than
  a viewport one, and the first vertical drag makes iOS re-lay-out at the true height and it
  disappears for the session — which is why it looks like a scroll glitch. Apple has deprecated the
  value outright. `viewport-fit=cover` (for the insets) plus `<meta name="theme-color">` (kept in
  sync with the theme by `lib/theme.ts`) is the supported replacement and is already in place;
  `pt-safe` on `TopBar` and `Toast` simply resolves to 0 in portrait standalone now. This is
  iOS-only and invisible in a desktop browser AND in mobile Safari — it needs a real home-screen
  install to see or to verify.
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
  This is exactly how `ocr-segment.test.ts` (which stubbed `pdf-to-img`) broke
  `pdf-rasterize.test.ts` in CI while passing locally — one failing test, in ~3 ms, on the
  rendered-size assertion. **PREFER AN EXPLICIT SEAM**: that pair is now `setPdfRasterizer()` +
  `afterEach`, which cannot leak silently, and it is the pattern to copy (`setMailer`, `setOcrEngine`
  are the others). Where `mock.module()` is unavoidable: **the file must hand the module back in
  `afterAll`**, same rule as `setMailer(null)`, and it must snapshot the real export **by value** at
  module-evaluation time (`const real = ns.thing`) — a namespace object is a LIVE view of the
  registry, so `mock.module(spec, () => namespace)` restores the stub over itself and silently does
  nothing. `bun test a.ts b.ts` does NOT let you control the order, so ordering cannot be tested that
  way; inject a stub into a file that already runs earlier instead.
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
  again; the symptom is "the server serves a stale app for days". Hashed `/assets/*` are immutable, and
  `.webmanifest` needs `application/manifest+json` or the install prompt silently never appears.
- **A missing file WITH an extension must 404, not fall back to the SPA shell.** Answering HTML for a
  missing `.js` produces a MIME console error that says nothing about the real problem.
- **`docker/Caddyfile`'s `header_up X-Forwarded-For {remote_host}` stays, even though Caddy logs it
  as "unnecessary".** Measured: Caddy's default already drops a client-supplied `X-Forwarded-For`,
  but adding a `trusted_proxies` line (a common copy-paste) makes the forged value the FIRST entry —
  which is the one `clientIp()` uses, so every rate limit becomes a no-op. The overwrite survives
  that.
- **TLS has two modes and ONE variable: `TOON_TLS_ISSUER`, defaulting to `acme`.** The Caddyfile
  writes it as `tls { issuer {$TOON_TLS_ISSUER:acme} }` — a real Let's Encrypt certificate for a
  public hostname with ports 80/443 reachable, which is the deployment this repo targets. `internal`
  is the LAN escape hatch (Caddy's own CA) and needs `TOON_HSTS_MAX_AGE=0` with it, or a pinned HSTS
  on an internal name locks you out. Two consequences: the global `local_certs` option is GONE (it
  forced internal for everything), and **the local stack test must set `TOON_TLS_ISSUER=internal`** —
  `rezepte.test` has no public DNS, so the default would burn ACME attempts and never serve a page.
  `caddy validate` covers all three states (both values plus the unset default).
- **A self-signed certificate alone does NOT give you the PWA**, which is why `internal` is not the
  default. An untrusted-CA origin is not a secure context even after the user clicks through, so the
  service worker never registers and the offline shopping list is dead. Caddy's local CA root must be
  installed per device (`http://<host>/toon-root-ca.crt`, served over plain http on purpose — a device
  that does not trust the CA yet cannot fetch it over the HTTPS that CA signed). With `acme` none of
  this applies.
- **Mailpit is bound to `127.0.0.1` in compose, never to a public interface.** Its UI shows every
  password-reset and invite link, so exposing it is account takeover for anyone who can reach it.
  Reach it via `ssh -L 8025:127.0.0.1:8025`. Note `ufw` does NOT protect a published container port
  (Docker's chain runs first) — the loopback bind in the compose file is the actual control.
- **Every `MAIL_*` value is overridable from the compose `.env`**, with the Mailpit defaults
  (`mailpit:1025`, `MAIL_SECURITY=none`, empty credentials) as the fallback. `SmtpMailer` skips AUTH
  entirely for an empty user, so the empty defaults are not a broken auth attempt — and `env.ts`
  still refuses `MAIL_SECURITY=none` TOGETHER with credentials, which is what keeps a real relay from
  being configured in plaintext by half-editing the file.
- **`/app/data` is a VOLUME, so anything written there at build time is invisible at runtime.**
  Nothing in the image relies on that today, and the reason is worth keeping: the OCR language data
  used to be prefetched at build time and had to be baked to `/app/seed/tessdata` and copied in by
  `docker/entrypoint.sh` whenever the volume had none, because writing it straight to `/app/data`
  looks like it works and then silently re-downloads ~15 MB on every fresh volume. The native engine
  reads its language data from `/usr/share/tesseract-ocr` — image content a volume cannot hide —
  which is what let that whole dance be deleted. Anything else you are tempted to seed into
  `/app/data` at build time has the same trap.
- **Never verify a Docker build through a pipe** (`docker build … | tail`): the pipeline's exit code
  is `tail`'s, so a failed build reads as success. Redirect to a file and check `$?`.

## Verification gates

All five must be clean before calling anything done:

```bash
bun install
bun run typecheck    # tsc for packages/shared, apps/api, apps/web
bun test             # 934 tests
bun run build        # vite build + PWA
bun run i18n:check   # German catalog parity + no German left in a ported tree
```

`i18n:check` is grep-shaped and **exits non-zero even when the tree is correct** — read its output,
never just the exit code. Three known false-positive classes, all of them expected:

1. *Parity* — a string the base tree wrapped across source lines, so the fragment never matches; and
   **any genuinely NEW German copy**, which by definition has no base-tree counterpart (the language
   card's two hints are the current examples). The check cannot tell new copy from changed copy.
2. *Leftover German* — English comments that QUOTE a German UI label ("bitte prüfen", "Häufig
   gekauft", "Für den Teig"), which rule 12 requires them to keep.
3. *Leftover German* — CONTENT vocabulary that must never move: `UNIT_SUGGESTIONS`, the ingredient
   paste placeholders, `STEP_HEADING_RE`, `html/entities.ts`'s umlaut table.

The useful way to read it is `grep -vE ':[0-9]+: *(\*|//|/\*)'` to drop the comment hits, then check
that everything left is on list 3. That is how the German literal in `services/groups/validation.ts`
was found: it sat in `validationFailed`'s `details` SLOT, not the message slot, so it went out on the
wire untranslated and no type error could catch it.

Plus, for anything touching persistence or auth: `bun run db:migrate` and `bun run seed` against a
fresh `file:` DB, then the curl walkthrough in README.md ("Smoke test against a real server").

For anything touching the Dockerfile, the compose stack or `middleware/staticWeb.ts`, the image has
to be built and the stack actually run — a Dockerfile can be wrong in ways no test catches:

```bash
docker build -t toon-recipe:local . > /tmp/build.log 2>&1; echo $?   # NOT through a pipe
docker compose --env-file .env.local-stack -p toonstack up -d        # see docs/deployment.md
```

`.env.local-stack` MUST carry `TOON_TLS_ISSUER=internal` + `TOON_HSTS_MAX_AGE=0` (see the TLS
gotcha) — with the `acme` default, `rezepte.test` never gets a certificate. Also validate the
Caddyfile in both modes when you touch it:

```bash
for iss in acme internal; do docker run --rm -v "$PWD/docker/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -e TOON_HOSTNAME=rezepte.test -e TOON_TLS_ISSUER=$iss caddy:2.11.4-alpine \
  caddy validate --config /etc/caddy/Caddyfile; done
```
