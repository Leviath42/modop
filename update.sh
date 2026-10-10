#!/usr/bin/env bash
# update.sh — mise à jour robuste de Modop sur le CT Proxmox.
# Adapté du mécanisme de meal_plan (même logique, adapté à l'architecture
# Modop : serveur Express + front Vite buildé, SQLite better-sqlite3, pm2).
#
# Usage :
#   bash /opt/modop/update.sh            # mise à jour depuis origin/beta
#   bash /opt/modop/update.sh rollback   # restaure la dernière sauvegarde de la base
#
# Ordre des opérations (chaque étape s'arrête net en cas d'échec) :
#   1. stop de l'app (la base ne doit pas être écrite pendant l'échange)
#   2. sauvegarde horodatée de server/modop.db (10 dernières conservées)
#   3. git fetch + reset --hard origin/<branche>
#   4. restauration de la base de production
#   5. npm ci serveur + web (si package-lock a changé)
#   6. build du front (vite build)
#   7. relance pm2 + healthcheck HTTP

set -euo pipefail

APP_DIR="/opt/modop"
PM2_NAME="modop"
BRANCH="${BRANCH:-$(cat "$APP_DIR/.deploy-branch" 2>/dev/null || true)}"
BRANCH="${BRANCH:-beta}"
PORT="${PORT:-3000}"
BACKUP_DIR="$APP_DIR/server/data/backups"
KEEP_BACKUPS=10
DB_FILE="server/modop.db"

cd "$APP_DIR"

log() { printf '[update] %s\n' "$*"; }
die() {
  printf '[update] ERREUR : %s\n' "$*" >&2
  printf "[update] tentative de relance de l'application...\n" >&2
  pm2 restart "$PM2_NAME" >/dev/null 2>&1 \
    || pm2 start npm --name "$PM2_NAME" --prefix "$APP_DIR/server" -- start >/dev/null 2>&1 \
    || true
  pm2 save >/dev/null 2>&1 || true
  exit 1
}

# ---------------------------------------------------------------------------
# Mode rollback : restaurer la dernière sauvegarde de la base
# ---------------------------------------------------------------------------
if [ "${1:-}" = "rollback" ]; then
  log "mode rollback"
  LATEST=$(ls -1t "$BACKUP_DIR"/db-*.db 2>/dev/null | head -1 || true)
  [ -n "$LATEST" ] || die "aucune sauvegarde dans $BACKUP_DIR"
  pm2 stop "$PM2_NAME" 2>/dev/null || true
  rm -f "$DB_FILE-wal" "$DB_FILE-shm"
  cp "$LATEST" "$DB_FILE"
  STAMP2=$(basename "$LATEST" .db)
  [ -f "$BACKUP_DIR/$STAMP2.db-wal" ] && cp "$BACKUP_DIR/$STAMP2.db-wal" "$DB_FILE-wal" || true
  [ -f "$BACKUP_DIR/$STAMP2.db-shm" ] && cp "$BACKUP_DIR/$STAMP2.db-shm" "$DB_FILE-shm" || true
  pm2 restart "$PM2_NAME" --update-env 2>/dev/null \
    || pm2 start npm --name "$PM2_NAME" --prefix "$APP_DIR/server" -- start
  pm2 save
  log "base restaurée : $LATEST"
  exit 0
fi

# ---------------------------------------------------------------------------
# Mise à jour
# ---------------------------------------------------------------------------
BEFORE=$(git rev-parse --short HEAD)

log "arrêt de l'application"
pm2 stop "$PM2_NAME" 2>/dev/null || log "process pm2 absent, on continue"

log "sauvegarde de la base (WAL inclus)"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
[ -f "$DB_FILE" ] && cp "$DB_FILE" "$BACKUP_DIR/db-$STAMP.db" || touch "$BACKUP_DIR/db-$STAMP.db"
[ -f "$DB_FILE-wal" ] && cp "$DB_FILE-wal" "$BACKUP_DIR/db-$STAMP.db-wal" || true
[ -f "$DB_FILE-shm" ] && cp "$DB_FILE-shm" "$BACKUP_DIR/db-$STAMP.db-shm" || true
chmod 600 "$BACKUP_DIR"/db-$STAMP.db* 2>/dev/null || true
ls -1t "$BACKUP_DIR"/db-*.db | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --

log "récupération du code ($BEFORE -> ?)"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
AFTER=$(git rev-parse --short HEAD)

log "restauration de la base de production"
rm -f "$DB_FILE-wal" "$DB_FILE-shm"
cp "$BACKUP_DIR/db-$STAMP.db" "$DB_FILE"
[ -f "$BACKUP_DIR/db-$STAMP.db-wal" ] && cp "$BACKUP_DIR/db-$STAMP.db-wal" "$DB_FILE-wal" || true
[ -f "$BACKUP_DIR/db-$STAMP.db-shm" ] && cp "$BACKUP_DIR/db-$STAMP.db-shm" "$DB_FILE-shm" || true

if ! git diff --quiet "$BEFORE" "$AFTER" -- server/package-lock.json; then
  log "server/package-lock.json a changé : npm ci"
  (cd server && NODE_ENV=development npm ci) || die "npm ci serveur a échoué"
fi
if ! git diff --quiet "$BEFORE" "$AFTER" -- web/package-lock.json; then
  log "web/package-lock.json a changé : npm ci"
  (cd web && NODE_ENV=development npm ci) || die "npm ci web a échoué"
fi

log "build du front"
(cd web && npm run build) || die "build web a échoué"

log "relance de l'application"
pm2 restart "$PM2_NAME" --update-env 2>/dev/null \
  || pm2 start npm --name "$PM2_NAME" --prefix "$APP_DIR/server" -- start
pm2 save

log "healthcheck"
CODE=000
for _ in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/health" || true)
  [ -n "$CODE" ] && [ "$CODE" != "000" ] && break
  sleep 3
done

if [ -z "$CODE" ] || [ "$CODE" = "000" ]; then
  die "l'application ne répond pas sur le port $PORT (logs : pm2 logs $PM2_NAME). Retour arrière : bash update.sh rollback"
fi

case "$CODE" in
  [23]??) ;;
  *)
    die "healthcheck : HTTP $CODE. Logs : pm2 logs $PM2_NAME. Retour arrière : bash update.sh rollback"
    ;;
esac

log "healthcheck : HTTP $CODE"
log "mise à jour $BEFORE -> $AFTER terminée"
