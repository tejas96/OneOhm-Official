#!/usr/bin/env bash
# Daily PostgreSQL backup for the production compose stack (run from the repo root).
# Keeps 14 daily and 8 weekly dumps in BACKUP_DIR; copy that folder off the VM
# (for example to OCI Object Storage with `oci os object bulk-upload`).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/oneohm/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker/compose.production.yaml}"
ENV_FILE="${ONEOHM_ENV_FILE:-/opt/oneohm/.env}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

for database in "${POSTGRES_DB:?POSTGRES_DB is required}" temporal temporal_visibility; do
  target="$BACKUP_DIR/daily/${database}-${STAMP}.dump"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:?POSTGRES_USER is required}" -Fc "$database" > "$target"
  echo "wrote $target ($(du -h "$target" | cut -f1))"
done

if [ "$(date -u +%u)" = "7" ]; then
  cp "$BACKUP_DIR"/daily/*-"$STAMP".dump "$BACKUP_DIR/weekly/"
fi
find "$BACKUP_DIR/daily" -name '*.dump' -mtime +14 -delete
find "$BACKUP_DIR/weekly" -name '*.dump' -mtime +56 -delete
