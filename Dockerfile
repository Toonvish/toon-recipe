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
#  2. DEBIAN, NOT ALPINE. `sharp` ships a prebuilt glibc binary for linux-arm64;
#     on musl it would be rebuilt from source on the Pi, which takes the better
#     part of an hour when it works. Debian also has `tesseract-ocr` and
#     `poppler-utils` as ordinary packages, which is what the OCR and PDF
#     pipelines now shell out to.
#  3. THE WEB BUNDLE IS BUILT ON THE BUILD PLATFORM ($BUILDPLATFORM), not the
#     target. Its output is architecture-independent JavaScript, so building it
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
# deps — production node_modules FOR THE TARGET ARCHITECTURE.
#
# The only stage that must run under emulation when cross-building, because this
# is where sharp's arm64 binary is fetched. No compilation happens (it is
# prebuilt), so QEMU is tolerable here.
#
# There is no `tessdata` stage any more: OCR language data used to be downloaded at
# build time because tesseract.js fetches its ~15 MB `.traineddata` over HTTPS on
# first use. The native engine reads it from an OS package instead (installed in
# the runtime stage), so the download, the seed copy and the entrypoint's volume
# seeding are all gone.
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

# --- native OCR + PDF rasterization -----------------------------------------
# THE APP SHELLS OUT TO BOTH OF THESE; without them every photo and scanned-PDF
# import answers 422. They replaced tesseract.js and pdf-to-img, which is where
# most of this deployment's memory footprint used to go.
#
#   tesseract-ocr          the engine (services/ocr/tesseract.ts)
#   tesseract-ocr-deu/-eng one package PER language in TESSERACT_LANGS. Adding a
#                          language to that variable without adding its package
#                          here fails at recognise time, not at boot.
#   poppler-utils          pdftoppm, the PDF rasterizer (services/ocr/pdf.ts)
#
# tini reaps zombies and forwards signals. It matters more now, not less: every
# recognition is a CHILD PROCESS, and PID 1 without an init leaves a killed
# tesseract as a zombie on every aborted or timed-out import.
RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      tini \
      ca-certificates \
      tesseract-ocr \
      tesseract-ocr-deu \
      tesseract-ocr-eng \
      poppler-utils \
 && rm -rf /var/lib/apt/lists/* \
 && tesseract --version \
 && tesseract --list-langs \
 && pdftoppm -v

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
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# `bun` is the unprivileged user the oven/bun images ship with (uid 1000, which is
# also the default `pi` uid — so a bind-mounted ./data is writable without chown).
RUN mkdir -p /app/data/uploads && chown -R bun:bun /app/data
USER bun

VOLUME ["/app/data"]
EXPOSE 3001

# Uses the API's own health endpoint, so "healthy" means Hono is answering and the
# env validated — not merely that the process exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:'+(process.env.API_PORT??3001)+'/api/health'); process.exit(r.ok ? 0 : 1)"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["bun", "apps/api/src/index.ts"]
