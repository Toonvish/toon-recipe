/**
 * toon-recipe API — Bun.serve + Hono.
 *
 * This file is FOUNDATION-OWNED: it wires CORS, logging, error handling, static
 * uploads and mounts the four feature routers. Feature agents add their routes
 * inside src/routes/*.ts and their middleware inside src/middleware/* — nobody
 * needs to edit this file, which keeps merges conflict-free.
 */
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.ts";
import { notFoundHandler, onErrorHandler } from "./lib/errors.ts";
import type { AppEnv } from "./lib/types.ts";
import {
  UPLOAD_EXP_PARAM,
  UPLOAD_SIG_PARAM,
  verifyUploadSignature,
} from "./lib/uploadUrls.ts";
import { webAppMiddleware } from "./middleware/staticWeb.ts";
import { authRoutes } from "./routes/auth.ts";
import { groupRoutes } from "./routes/groups.ts";
import { importRoutes } from "./routes/imports.ts";
import { recipeRoutes } from "./routes/recipes.ts";
import { shoppingRoutes } from "./routes/shopping.ts";
import { shutdownOcr } from "./services/ocr/index.ts";

export const app = new Hono<AppEnv>();

app.onError(onErrorHandler);
app.notFound(notFoundHandler);

if (!env.isTest) app.use("*", logger());

app.use(
  "/api/*",
  cors({
    origin: (origin) => (env.webOrigins.includes(origin) ? origin : env.webOrigins[0] ?? ""),
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Disposition", "Location"],
    maxAge: 86400,
  }),
);

/** Liveness/readiness probe. */
app.get("/api/health", (c) =>
  c.json({
    status: "ok" as const,
    version: process.env.npm_package_version ?? "0.1.0",
    time: new Date().toISOString(),
    database: env.databaseKind,
  }),
);

/**
 * Uploaded images (recipe photos, avatars, group covers).
 *
 * NOT public: every URL must carry `?exp&sig` minted by the API when the owning
 * row was serialised (see lib/uploadUrls.ts for the scheme and for why a cookie
 * check cannot work here — a cross-origin `<img>` sends no credentials). An
 * unsigned, forged or expired request is a 404, exactly like a missing file, so
 * this route never confirms that a given UUID exists.
 *
 * Import SOURCE scans are not reachable here at all: nothing mints a signature for
 * them, and they are served by the membership-checked
 * `GET /api/groups/:groupId/imports/:draftId/source`.
 *
 * Path traversal is blocked by normalising and re-checking the prefix.
 */
app.get("/uploads/:filename", async (c) => {
  const requested = normalize(c.req.param("filename"));
  if (requested.includes("..") || requested.startsWith("/")) return c.notFound();

  const verdict = verifyUploadSignature(
    requested,
    c.req.query(UPLOAD_EXP_PARAM),
    c.req.query(UPLOAD_SIG_PARAM),
  );
  if (verdict !== "ok") return c.notFound();

  const absolute = join(env.uploadDir, requested);
  if (!absolute.startsWith(env.uploadDir) || !existsSync(absolute)) return c.notFound();
  const file = Bun.file(absolute);
  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      // `private` because the URL is now a capability, not a public address: a
      // shared proxy must not hand one client's signed response to another. The
      // max-age stays inside the signature's own lifetime.
      "Cache-Control": "private, max-age=21600, immutable",
    },
  });
});

// --- feature routers --------------------------------------------------------
// Group-scoped routers are mounted UNDER :groupId; they enforce membership with
// the reusable middleware inside their own file.
app.route("/api/auth", authRoutes);
app.route("/api/groups", groupRoutes);
app.route("/api/groups/:groupId/imports", importRoutes);
app.route("/api/groups/:groupId/shopping-lists", shoppingRoutes);
// LAST: this one owns the /api/groups/:groupId catch-all, so anything mounted on a
// deeper path has to be registered above it.
app.route("/api/groups/:groupId", recipeRoutes);

/**
 * The built web app, same-origin, when WEB_DIST_DIR is set (that is how the Docker
 * image runs; in dev vite serves it instead).
 *
 * Registered AFTER every router on purpose: this middleware falls back to the SPA
 * shell for unknown paths, so anything it saw first would never reach a real route.
 * It also refuses `/api/*` and `/uploads/*` itself — see middleware/staticWeb.ts.
 */
if (env.webDistDir !== null) {
  app.use("*", webAppMiddleware(env.webDistDir));
}

/**
 * Graceful shutdown. `shutdownOcr()` terminates the long-lived tesseract worker;
 * without this it was only ever torn down by process exit, which on a redeploy
 * means a killed worker mid-recognition and (on some hosts) a leaked child.
 *
 * Registered once, guarded so a repeated signal cannot start a second teardown,
 * and never in tests — bun's test runner owns the process there.
 */
if (!env.isTest) {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] ${signal} — beende OCR-Worker …`);
    void shutdownOcr()
      .catch((error: unknown) => console.warn("[api] OCR-Shutdown fehlgeschlagen:", error))
      .finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (!env.isTest) {
  console.log(
    `[api] toon-recipe API on http://localhost:${env.API_PORT} (db: ${env.databaseKind}, origins: ${env.webOrigins.join(", ")}, mail: ${env.mailTransport}, web: ${env.webDistDir ?? "extern"})`,
  );
}

export default {
  port: env.API_PORT,
  fetch: app.fetch,
  /** 15 MB uploads + a little slack for multipart overhead. */
  maxRequestBodySize: 20 * 1024 * 1024,
};
