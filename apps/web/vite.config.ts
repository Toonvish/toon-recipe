import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

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
          // App shell only: hashed build output + icons. Source maps stay out of the cache.
          globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
          globIgnores: ["**/*.map"],
          navigateFallback: "/index.html",
          // NEVER serve the SPA shell (or anything cached) for API calls or uploads.
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
          navigationPreload: false,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          // Belt and braces: no runtime caching rule may ever match /api or /uploads.
          runtimeCaching: [],
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
