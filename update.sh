#!/usr/bin/env bash
# update.sh — mise à jour robuste de Modop sur le CT Proxmox.
# Adapté du mécanisme de meal_plan (même logique, adapté à l'architecture
# Modop : serveur Express + front Vite buildé, SQLite better-sqlite3, pm2).
#
# Usage :
#   bash /opt/modop/update.sh            # mise à jour depuis origin/<branche>
#   bash /opt/modop/update.sh rollback   # restaure la dernière sauvegarde de la base
#
# Branche de déploiement : $MODOP_DEPLOY_BRANCH > fichier .deploy-branch >
# "beta" par défaut (rétro-compatible homelab ; la production vise "main").
#
# Ordre des opérations (chaque étape s'arrête net en cas d'échec) :
#   1. stop de l'app (la base ne doit pas être écrite pendant l'échange)
#   2. sauvegarde cohérente de server/modop.db : VACUUM INTO + integrity_check
#      (fichier unique, WAL inclus — plus de copie .db/-wal/-shm), 10 dernières conservées
#   3. git fetch + reset --hard origin/<branche>
#   4. restauration de la base de production (vérifiée)
#   5. npm ci à la racine (monorepo workspaces : lockfile racine unique)
#   6. build du front (vite build) et du serveur
#   7. relance pm2 + healthcheck HTTP

set -euo pipefail

# ---------------------------------------------------------------------------
# Auto-snapshot : la mise à jour fait `git reset --hard`, qui REMPLACE
# update.sh pendant son propre exécution. Bash bufférise les petits scripts
# (lu d'un seul bloc) mais relit le fichier au fil des commandes dès qu'il
# dépasse son tampon : un script réécrit en plein vol s'exécute alors de façon
# corrompue — pm2 déjà arrêté, plus de relance, serveur injoignable. On
# s'exécute donc depuis une copie hors du dépôt (server/data, non suivi par
# git), insensible à sa propre réécriture quelle que soit la taille. Le mode
# rollback ne touche pas au dépôt : pas besoin de snapshot. Une copie
# invoquée hors du dépôt (ex. /root) est déjà protégée.
# ---------------------------------------------------------------------------
if [ "${1:-}" != "rollback" ] && [ "${MODOP_UPDATE_SNAPSHOT:-}" != "1" ]; then
  SCRIPT_DIR=$(dirname "$0")
  if [ -f "$SCRIPT_DIR/package.json" ]; then
    mkdir -p "$SCRIPT_DIR/server/data"
    SNAPSHOT="$SCRIPT_DIR/server/data/.update-snapshot.sh"
    cp "$0" "$SNAPSHOT"
    chmod +x "$SNAPSHOT"
    exec env MODOP_UPDATE_SNAPSHOT=1 bash "$SNAPSHOT" "$@"
  fi
fi

APP_DIR="/opt/modop"
PM2_NAME="modop"
BRANCH="${MODOP_DEPLOY_BRANCH:-$(cat "$APP_DIR/.deploy-branch" 2>/dev/null || true)}"
BRANCH="${BRANCH:-beta}"
PORT="${PORT:-3000}"
BACKUP_DIR="$APP_DIR/server/data/backups"
KEEP_BACKUPS=10
DB_FILE="server/modop.db"
BACKUP_TOOL="$APP_DIR/server/scripts/backup-db.mjs"

cd "$APP_DIR"
mkdir -p "$APP_DIR/server/data"

log() { printf '[update] %s\n' "$*"; }

# Garantie centrale : quelle que soit la façon dont ce script meurt (échec non
# prévu sous set -e, commande non gardée), l'application est relancée — pm2 ne
# doit jamais rester à l'arrêt. die() et le trap EXIT partagent relaunch(),
# idempotent (une seule relance par exécution).
APP_RELAUNCHED=0
relaunch() {
  if [ "$APP_RELAUNCHED" = "1" ]; then return 0; fi
  APP_RELAUNCHED=1
  pm2 restart "$PM2_NAME" >/dev/null 2>&1 \
    || pm2 start "$APP_DIR/server/ecosystem.config.cjs" >/dev/null 2>&1 \
    || true
  pm2 save >/dev/null 2>&1 || true
}
die() {
  printf '[update] ERREUR : %s\n' "$*" >&2
  printf "[update] tentative de relance de l'application...\n" >&2
  relaunch
  exit 1
}
on_unexpected_exit() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ "$APP_RELAUNCHED" != "1" ]; then
    printf "[update] sortie inattendue (code %s) : relance de l'application\n" "$rc" >&2
    relaunch
  fi
}
trap on_unexpected_exit EXIT

# ---------------------------------------------------------------------------
# Mode rollback : restaurer la dernière sauvegarde de la base
# ---------------------------------------------------------------------------
if [ "${1:-}" = "rollback" ]; then
  log "mode rollback (branche $BRANCH)"
  LATEST=$(ls -1t "$BACKUP_DIR"/db-*.db 2>/dev/null | head -1 || true)
  [ -n "$LATEST" ] || die "aucune sauvegarde dans $BACKUP_DIR"
  pm2 stop "$PM2_NAME" 2>/dev/null || true
  rm -f "$DB_FILE-wal" "$DB_FILE-shm"
  cp "$LATEST" "$DB_FILE"
  node "$BACKUP_TOOL" check "$APP_DIR/$DB_FILE" \
    || die "base restaurée incohérente (integrity_check) : $LATEST"
  pm2 restart "$PM2_NAME" --update-env 2>/dev/null \
    || pm2 start "$APP_DIR/server/ecosystem.config.cjs"
  pm2 save >/dev/null 2>&1 || true
  log "base restaurée et vérifiée : $LATEST"
  exit 0
fi

# ---------------------------------------------------------------------------
# Mise à jour
# ---------------------------------------------------------------------------
BEFORE=$(git rev-parse --short HEAD)

log "arrêt de l'application"
pm2 stop "$PM2_NAME" 2>/dev/null || log "process pm2 absent, on continue"

log "sauvegarde cohérente de la base (VACUUM INTO + integrity_check)"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE=""
if [ -f "$DB_FILE" ]; then
  BACKUP_FILE="$BACKUP_DIR/db-$STAMP.db"
  node "$BACKUP_TOOL" backup "$APP_DIR/$DB_FILE" "$BACKUP_FILE" \
    || die "la sauvegarde de la base a échoué"
  chmod 600 "$BACKUP_FILE" 2>/dev/null || true
  log "sauvegarde vérifiée : $BACKUP_FILE"
else
  log "aucune base à sauvegarder ($DB_FILE absent)"
fi
ls -1t "$BACKUP_DIR"/db-*.db 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -- || true
# résidus -wal/-shm des anciennes sauvegardes (avant VACUUM INTO)
rm -f "$BACKUP_DIR"/db-*.db-wal "$BACKUP_DIR"/db-*.db-shm 2>/dev/null || true

log "récupération du code ($BEFORE -> ?, branche $BRANCH)"
git fetch origin "$BRANCH" || die "git fetch a échoué (réseau ?)"
git reset --hard "origin/$BRANCH" || die "git reset a échoué"
AFTER=$(git rev-parse --short HEAD)

log "restauration de la base de production"
rm -f "$DB_FILE-wal" "$DB_FILE-shm"
if [ -n "$BACKUP_FILE" ]; then
  cp "$BACKUP_FILE" "$DB_FILE"
fi

# npm ci racine (monorepo npm workspaces : un seul lockfile à la racine) si le
# lock a changé OU si node_modules est absent (un clone neuf n'en a jamais —
# « le lock n'a pas changé » ne doit pas empêcher l'installation).
if ! git diff --quiet "$BEFORE" "$AFTER" -- package-lock.json || [ ! -d node_modules ]; then
  log "npm ci racine (lock changé ou node_modules absent)"
  npm ci || die "npm ci a échoué"
fi

# Garde-fou : dépendances critiques résolues avant de relancer (un npm ci
# partiel ou un dossier corrompu plantait le serveur en boucle pm2).
node -e "require.resolve('better-sqlite3')" 2>/dev/null \
  || { log "better-sqlite3 introuvable : réinstallation complète"; \
       npm ci || die "npm ci a échoué"; }

log "build du front"
(cd web && npm run build) || die "build web a échoué"

log "build du serveur"
(cd server && npm run build) || die "build serveur a échoué"

log "relance de l'application"
pm2 restart "$PM2_NAME" --update-env 2>/dev/null \
  || pm2 start "$APP_DIR/server/ecosystem.config.cjs"
pm2 save >/dev/null 2>&1 || true

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
