#!/usr/bin/env bash
# proxmox-install.sh — installation de Modop dans un conteneur LXC Proxmox.
# Encapsule toute l'application dans le conteneur : rien n'est installé sur
# l'hôte Proxmox. Exécuter DANS le conteneur (pas sur l'hôte).
#
# Usage (dans le shell du conteneur, en root) :
#   apt update && apt install -y curl git
#   curl -fsSL https://raw.githubusercontent.com/Leviath42/modop/beta/scripts/proxmox-install.sh | bash -
#   # ou après clonage : bash scripts/proxmox-install.sh
#
# Installe : Node.js 22, pm2, clone le dépôt dans /opt/modop, installe les
# dépendances, build le front, crée le premier compte admin, lance sous pm2
# (démarrage automatique au boot du conteneur), configure update.sh.

set -euo pipefail

APP_DIR="/opt/modop"
BRANCH="${BRANCH:-beta}"
PORT="${PORT:-3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@modop.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangerMoi123}"

log() { printf '[install] %s\n' "$*"; }
die() { printf '[install] ERREUR : %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "à exécuter en root dans le conteneur"

log "Node.js 22"
if ! command -v node >/dev/null || ! node -v | grep -q "v2[02]"; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt install -y nodejs >/dev/null
fi
node --version

log "pm2"
npm install -g pm2 >/dev/null 2>&1 || die "installation de pm2 impossible"

log "clone du dépôt (branche $BRANCH)"
apt install -y git >/dev/null 2>&1 || true
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone -b "$BRANCH" https://github.com/Leviath42/modop.git "$APP_DIR"
fi
cd "$APP_DIR"
echo "$BRANCH" > .deploy-branch
chmod +x update.sh

log "dépendances serveur + build de production"
(cd server && npm ci && npm run build) || die "build serveur"

log "dépendances web + build"
(cd web && npm ci && npm run build) || die "build web"

log "base + compte admin initial ($ADMIN_EMAIL)"
cd server
if [ ! -f modop.db ] && [ ! -f data/modop.db ]; then
  npm run seed -- modop.db "$ADMIN_EMAIL" "$ADMIN_PASSWORD" admin \
    || die "création du compte initial impossible"
  printf '[install] IMPORTANT : connexion initiale %s / %s\n' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" >&2
  printf '[install] Changez ce mot de passe dès la première connexion (page Profil).\n' >&2
else
  printf '[install] Base existante conservée.\n'
fi

log "lancement sous pm2"
pm2 delete modop >/dev/null 2>&1 || true
pm2 start npm --name modop --prefix "$APP_DIR/server" -- start
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save

log "healthcheck"
CODE=000
for _ in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/health" || true)
  [ -n "$CODE" ] && [ "$CODE" != "000" ] && break
  sleep 3
done
[ "$CODE" = "200" ] || die "healthcheck HTTP $CODE — voir pm2 logs modop"

log "OK — Modop tourne sur le port $PORT du conteneur"
log "Mises à jour : page /deploy dans l'application (admin), ou bash $APP_DIR/update.sh"
