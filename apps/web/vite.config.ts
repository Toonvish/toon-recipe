import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Service-worker runtime caching for READ-ONLY offline use.
 *
 * The TanStack Query cache persisted in IndexedDB (src/lib/persist.ts) is what
 * actually makes a screen render offline; these rules only cover what the query
 * cache cannot hold — the hero-image bytes — plus a network-first fallback for
 * recipe GETs so a flaky connection degrades instead of failing.
 *
 * FOUR RULES THAT MUST NOT BE RELAXED, each for a specific reason:
 *
 *  1. `/api/auth/*` IS NEVER CACHED. A cached `/api/auth/me` would let a signed-out
 *     or revoked session keep looking valid, and on a shared phone it is exactly the
 *     response that must never be answered from disk. `/api/auth/` is matched and
 *     excluded BEFORE the recipe rule, because a `NetworkOnly` rule that comes
 *     second would never be consulted.
 *  2. IMPORT ENDPOINTS ARE NEVER CACHED. They are uploads and OCR results, i.e.
 *     mutations and mid-edit state; a replayed one is a data-correctness bug.
 *  3. EVERY entry is `private`-safe and bounded. `expiration` caps keep a phone from
 *     filling up, and `cacheableResponse: { statuses: [200] }` keeps a 401 or a 403
 *     from being stored as if it were content.
 *  4. SHOPPING LISTS ARE NEVER CACHED HERE. Their offline copy is the persisted
 *     TanStack cache, which also holds the queued offline edits; a second, unaware
 *     cache layer would overwrite optimistic state with a stale body. See the rule.
 *
 * `/uploads/…` URLs now carry `?exp&sig` (see apps/api/src/lib/uploadUrls.ts). The
 * signature is stable for a 12-hour window, so cache entries do hit; when it rotates
 * the old entry simply ages out under `maxEntries`.
 */
const RUNTIME_CACHING = [
  {
    // Rule 1 — first, so nothing below can ever claim an auth request.
    urlPattern: /\/api\/auth\//,
    handler: "NetworkOnly" as const,
  },
  {
    // Rule 2 — imports (upload + OCR + draft edits) are never replayed.
    urlPattern: /\/api\/groups\/[^/]+\/imports/,
    handler: "NetworkOnly" as const,
  },
  {
    /**
     * Rule 4 — SHOPPING LISTS ARE NEVER CACHED HERE, even though they are the most
     * offline-critical screen in the app. Their offline copy is the persisted TanStack
     * cache (src/lib/persist.ts), which is the same store the queued offline mutations
     * live in, so the two stay consistent by construction.
     *
     * A service-worker cache would actively BREAK that: a `NetworkFirst` hit would hand
     * TanStack a stale list body that looks like a fresh success, and `onSuccess` would
     * write it over the optimistic state — silently un-ticking items the user just
     * checked off. Must come before the recipes rule for the same reason rule 1 does.
     */
    urlPattern: /\/api\/groups\/[^/]+\/shopping-lists/,
    handler: "NetworkOnly" as const,
  },
  {
    // Recipes, tags, collections: fresh when there is a connection, cached when the
    // wifi in the kitchen gives up. The short timeout is what makes that feel fast
    // rather than like a hang.
    urlPattern: /\/api\/groups\/[^/]+\/(recipes|tags|collections)/,
    handler: "NetworkFirst" as const,
    method: "GET" as const,
    options: {
      cacheName: "toon-api-recipes",
      networkTimeoutSeconds: 4,
      expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Hero images: bytes never change under a given signed URL, so cache-first is
    // both correct and the difference between a usable and an empty offline list.
    urlPattern: /\/uploads\//,
    handler: "CacheFirst" as const,
    method: "GET" as const,
    options: {
      cacheName: "toon-uploads",
      expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
      cacheableResponse: { statuses: [200] },
    },
  },
];

/**
 * Vite config for @toon/web.
 *
 *  - `envDir: "../../"`               -> the single .env lives in the monorepo root,
 *  - `envPrefix: ["VITE_","PUBLIC_"]` -> `import.meta.env.PUBLIC_API_URL` is inlined,
 *  - `@/*` + `@toon/shared` aliases mirror apps/web/tsconfig.json (paths, no baseUrl — TS 7),
 *  - `server.proxy` forwards `/api` and `/uploads` to the API so the app can also be
 *    run same-origin in dev (set `PUBLIC_API_URL=""` in .env). With the default
 *    `PUBLIC_API_URL=http://localhost:3001` the browser talks to the API directly;
 *    that works because the API sends `Access-Control-Allow-Credentials: true` +
 *    `Access-Control-Allow-Origin: <WEB_ORIGIN>` and `localhost:5173`/`localhost:3001`
 *    are the same *site*, so the `SameSite=Lax` session cookie is still sent.
 *  - `VitePWA` generates the service worker + web manifest. The precache/navigation
 *    fallback NEVER covers `/api` or `/uploads` (see navigateFallbackDenylist), so a
 *    stale worker can never answer an API call or hide an upload.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here("../../"), ["VITE_", "PUBLIC_", "API_"]);
  const apiTarget =
    env.PUBLIC_API_URL || env.VITE_API_URL || `http://localhost:${env.API_PORT || "3001"}`;
  const proxy = {
    "/api": { target: apiTarget, changeOrigin: false, secure: false },
    "/uploads": { target: apiTarget, changeOrigin: false, secure: false },
  } as const;

  return {
    root: here("."),
    envDir: "../../",
    envPrefix: ["VITE_", "PUBLIC_"],
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        // src/lib/pwa.ts registers `/sw.js` itself (production only, so a worker never
        // sits in front of the dev server and breaks HMR).
        injectRegister: false,
        filename: "sw.js",
        manifest: {
          id: "/",
          name: "Rezepte",
          short_name: "Rezepte",
          description:
            "Rezepte gemeinsam sammeln: importiere aus Webseiten, Fotos und PDFs und koche mit Familie und Freunden.",
          lang: "de",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "any",
          background_color: "#faf5ee",
          theme_color: "#c2532c",
          categories: ["food", "lifestyle", "productivity"],
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icons/maskable-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/icons/maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          shortcuts: [
            {
              name: "Rezept importieren",
              short_name: "Importieren",
              url: "/import",
              icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
            },
            {
              name: "Neues Rezept",
              short_name: "Neu",
              url: "/recipes/new",
              icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
            },
          ],
        },
        workbox: {
          // App shell: hashed build output + icons. Source maps stay out of the cache.
          globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
          globIgnores: ["**/*.map"],
          navigateFallback: "/index.html",
          // NEVER serve the SPA shell for API calls or uploads. Unchanged, and it
          // must stay that way whatever runtimeCaching below does.
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
          navigationPreload: false,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: RUNTIME_CACHING,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        "@": here("./src"),
        "@toon/shared": here("../../packages/shared/src/index.ts"),
      },
    },
    server: { port: 5173, host: true, proxy },
    preview: { port: 4173, host: true, proxy },
    // sourcemap: false — `true` shipped 86 *.js.map files (5.0 MB of dist/assets)
    // next to the bundle, so anyone with the deployed URL could read the entire
    // TypeScript client source. Use "hidden" plus an upload step if you add error
    // reporting later.
    build: { target: "es2022", sourcemap: false },
  };
});
