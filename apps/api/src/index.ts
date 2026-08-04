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
import { authRoutes } from "./routes/auth.ts";
import { groupRoutes } from "./routes/groups.ts";
import { importRoutes } from "./routes/imports.ts";
import { recipeRoutes } from "./routes/recipes.ts";

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
 * Uploaded images (recipe photos, avatars). Public on purpose: the URLs are
 * unguessable UUIDs and <img> tags cannot send credentials cross-origin.
 * Path traversal is blocked by normalising and re-checking the prefix.
 */
app.get("/uploads/:filename", async (c) => {
  const requested = normalize(c.req.param("filename"));
  if (requested.includes("..") || requested.startsWith("/")) return c.notFound();
  const absolute = join(env.uploadDir, requested);
  if (!absolute.startsWith(env.uploadDir) || !existsSync(absolute)) return c.notFound();
  const file = Bun.file(absolute);
  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

// --- feature routers --------------------------------------------------------
// Group-scoped routers are mounted UNDER :groupId; they enforce membership with
// the reusable middleware inside their own file.
app.route("/api/auth", authRoutes);
app.route("/api/groups", groupRoutes);
app.route("/api/groups/:groupId/imports", importRoutes);
app.route("/api/groups/:groupId", recipeRoutes);

if (!env.isTest) {
  console.log(
    `[api] toon-recipe API on http://localhost:${env.API_PORT} (db: ${env.databaseKind}, origins: ${env.webOrigins.join(", ")})`,
  );
}

export default {
  port: env.API_PORT,
  fetch: app.fetch,
  /** 15 MB uploads + a little slack for multipart overhead. */
  maxRequestBodySize: 20 * 1024 * 1024,
};
