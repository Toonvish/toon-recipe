# syntax=docker/dockerfile:1.7
# =============================================================================
# toon-recipe — one image, one origin, one port.
#
# The API serves the built PWA from its own port (see
# apps/api/src/middleware/staticWeb.ts), so a deployment needs no second web
# server, no CORS entry and no API URL baked into the bundle. That is the whole
# reason this is a single container and not three.
#
# BUILT FOR A RASPBERRY PI, WHICH SHAPES THREE DECISIONS:
#
#  1. TARGET IS linux/arm64 (Pi 4 / Pi 5 on a 64-BIT OS). There is no Bun build
#     for 32-bit ARM, so Raspberry Pi OS *must* be the 64-bit release — `uname -m`
#     has to say `aarch64`. A 32-bit userland cannot run this image at all.
#  2. DEBIAN, NOT ALPINE. `sharp` and `@napi-rs/canvas` (via pdf-to-img) ship
#     prebuilt glibc binaries for linux-arm64; on musl they would be rebuilt from
#     source on the Pi, which takes the better part of an hour when it works.
#  3. THE WEB BUNDLE AND THE TESSERACT LANGUAGE DATA ARE BUILT ON THE BUILD
#     PLATFORM ($BUILDPLATFORM), not the target. Both outputs are
#     architecture-independent — JavaScript and *.traineddata — so building them
#     natively on the amd64 CI runner instead of under QEMU emulation is the
#     difference between a ~4 minute and a ~40 minute build. Only the native
#     node_modules are installed for arm64.
# =============================================================================

ARG BUN_VERSION=1.3.14

# -----------------------------------------------------------------------------
# base — the workspace manifests and the lockfile, shared by every stage below.
# Copying only the manifests first means a source-only change does not invalidate
# the (slow) dependency install.
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-debian AS manifests
WORKDIR /app
COPY package.json bun.lock ./
# The ROOT tsconfig.json is not optional for the web build: vite/rolldown resolves
# it for the `@toon/shared` path mapping, and its absence fails the build with
# "Tsconfig not found" rather than anything about paths.
COPY tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# -----------------------------------------------------------------------------
# web-build — vite build, ALWAYS on the build platform (output is portable JS).
#
# PUBLIC_API_URL is deliberately EMPTY: it makes lib/api.ts emit relative URLs
# ("/api/…"), which is what lets one image work behind any hostname. Baking an
# absolute URL in here would hard-code the Pi's address into the bundle and break
# the moment it is reached by a different name.
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-debian AS web-build
WORKDIR /app
COPY --from=manifests /app/ ./
RUN bun install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ENV PUBLIC_API_URL=""
ENV NODE_ENV=production
RUN bun --filter @toon/web build && test -f apps/web/dist/index.html && test -f apps/web/dist/sw.js

# -----------------------------------------------------------------------------
# tessdata — the OCR language packs, downloaded ONCE at build time.
#
# `bun run ocr:prefetch` performs a real recognition, because tesseract.js only
# writes its cache when a worker actually initialises. Done here rather than on
# first use so that (a) the first photo import on the Pi is not a 15 MB download
# while someone waits, and (b) an install with no outbound HTTPS works at all.
# Also on the BUILD platform: *.traineddata is just data.
#
# It needs sharp, hence a full install — but the ~15 MB of output is all we keep.
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-debian AS tessdata
WORKDIR /app
COPY --from=manifests /app/ ./
RUN bun install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# env.ts validates at import time, so give it the minimum it insists on. None of
# this reaches the final image.
ENV NODE_ENV=production \
    DATABASE_URL="file:./data/build.db" \
    SESSION_SECRET="build-time-only-not-a-real-secret-0000" \
    TESSERACT_LANGS="deu+eng"
RUN bun run ocr:prefetch && ls -la data/tessdata/*.traineddata

# -----------------------------------------------------------------------------
# deps — production node_modules FOR THE TARGET ARCHITECTURE.
#
# The only stage that must run under emulation when cross-building, because this
# is where sharp's and @napi-rs/canvas's arm64 binaries are fetched. No
# compilation happens (they are prebuilt), so QEMU is tolerable here.
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-debian AS deps
WORKDIR /app
COPY --from=manifests /app/ ./
RUN bun install --frozen-lockfile --production

# -----------------------------------------------------------------------------
# runtime
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-debian AS runtime
WORKDIR /app

# tini reaps zombies and forwards signals. The API's SIGTERM handler shuts the
# long-lived tesseract worker down gracefully (see src/index.ts); as PID 1 without
# an init, that signal handling is unreliable and a redeploy can leak the worker.
RUN apt-get update \
 && apt-get install --no-install-recommends -y tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    API_PORT=3001 \
    # The API serves the PWA itself — this is what makes it one origin.
    WEB_DIST_DIR=/app/apps/web/dist \
    DATABASE_URL="file:/app/data/local.db" \
    UPLOAD_DIR=/app/data/uploads \
    TESSERACT_LANGS="deu+eng"

COPY --from=manifests /app/package.json ./package.json
COPY --from=manifests /app/apps/api/package.json ./apps/api/package.json
COPY --from=manifests /app/apps/web/package.json ./apps/web/package.json
COPY --from=manifests /app/packages/shared/package.json ./packages/shared/package.json
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY --from=web-build /app/apps/web/dist ./apps/web/dist

# --- node_modules: THREE directories, not one -------------------------------
# Bun 1.3 uses the ISOLATED linker for workspaces. The real packages live in the
# store at `node_modules/.bun/<pkg>@<version>/`, and each workspace gets its OWN
# `node_modules` full of symlinks into it — `/app/node_modules` itself contains
# nothing but `.bun`.
#
# Copying only the root therefore produces an image that builds, starts, and dies
# on the first import with "Cannot find module '@libsql/client'". All three paths
# have to come across for the symlinks to resolve. apps/web is absent on purpose:
# its bundle is already built.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
# Seed copy, NOT the live path: /app/data is a volume, so anything written there
# at build time disappears behind a bind mount. The entrypoint copies these in
# when the volume has none. See docker/entrypoint.sh.
COPY --from=tessdata /app/data/tessdata /app/seed/tessdata
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# `bun` is the unprivileged user the oven/bun images ship with (uid 1000, which is
# also the default `pi` uid — so a bind-mounted ./data is writable without chown).
RUN mkdir -p /app/data/uploads /app/data/tessdata && chown -R bun:bun /app/data
USER bun

VOLUME ["/app/data"]
EXPOSE 3001

# Uses the API's own health endpoint, so "healthy" means Hono is answering and the
# env validated — not merely that the process exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:'+(process.env.API_PORT??3001)+'/api/health'); process.exit(r.ok ? 0 : 1)"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["bun", "apps/api/src/index.ts"]
