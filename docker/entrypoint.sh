#!/bin/sh
# =============================================================================
# Container entrypoint: make the data volume usable, then hand over to the API.
#
# Everything here is idempotent — it runs on every start, including a restart
# after a crash and a `docker compose up` on an existing volume.
# =============================================================================
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
SEED_TESSDATA_DIR="${SEED_TESSDATA_DIR:-/app/seed/tessdata}"

log() { printf '[entrypoint] %s\n' "$*"; }

mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/tessdata"

# --- OCR language data -------------------------------------------------------
# The image ships deu+eng traineddata prefetched at build time, but /app/data is a
# VOLUME: a bind mount (or a fresh named volume created from an empty host dir)
# hides whatever the image had at that path. So the packs live at /app/seed and are
# copied in whenever the volume has none.
#
# Skipping this does not fail loudly — it makes the FIRST photo/PDF import download
# ~15 MB while a user waits, and fail outright on a host without outbound HTTPS.
if [ -d "$SEED_TESSDATA_DIR" ] && ! ls "$DATA_DIR"/tessdata/*.traineddata >/dev/null 2>&1; then
  log "seeding OCR language data into $DATA_DIR/tessdata"
  cp -n "$SEED_TESSDATA_DIR"/*.traineddata "$DATA_DIR/tessdata/" 2>/dev/null || \
    log "WARNUNG: OCR-Sprachdaten konnten nicht kopiert werden — der erste Import lädt sie neu"
fi

# --- schema ------------------------------------------------------------------
# Migrations are applied on every boot. They are the only writer of the schema, so
# a fresh volume gets a working DB with no manual step, and an upgraded image
# applies its new migrations before it starts answering requests.
#
# A FAILED MIGRATION MUST STOP THE CONTAINER. Starting the API against a
# half-migrated database would answer requests with confusing 500s instead, and the
# healthcheck would report the container as fine.
if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
  log "SKIP_MIGRATIONS=1 — Migrationen werden übersprungen"
else
  log "applying database migrations"
  bun apps/api/scripts/migrate.ts
fi

log "starting: $*"
exec "$@"
