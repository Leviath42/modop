#!/usr/bin/env bash
# Tests runtime de update.sh — sans CT Proxmox ni pm2 réel :
# dépôt git temporaire + stubs pm2/node/curl/npm sur le PATH.
#
# Scénarios :
#   B. mise à jour où update.sh est lui-même réécrit par git reset ->
#      doit aller au bout (exécution depuis server/data/.update-snapshot.sh) ;
#   C. git fetch en échec -> die() propre + relance de l'application ;
#   D. échec non gardé (abort brutal sous set -e, après le pm2 stop) ->
#      trap EXIT -> relance de l'application ;
#   E. rollback -> la dernière sauvegarde est restaurée, vérifiée, app relancée ;
#   F. better-sqlite3 indisponible (node_modules cassé) -> sauvegarde brute de
#      secours, mise à jour menée à terme ; rollback dégradé assumé « non vérifié ».
#
# Sortie : exit 0 si tout passe, exit 1 sinon. Lancé par la CI (job serveur)
# et en local via `npm run test:update`.

set -u

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PM2LOG="$T/pm2.log"
fail=0

ok() { printf '  ok    : %s\n' "$1"; }
ko() { printf '  ÉCHEC : %s\n' "$1"; fail=1; }

# ------------------------------------------------------------------ stubs ---
mkdir -p "$T/bin"
printf '#!/bin/bash\necho "pm2 $*" >> "$PM2LOG"\nexit 0\n' > "$T/bin/pm2"
printf '#!/bin/bash\nif [ "${2:-}" = "backup" ]; then : > "${@: -1}"; fi\nif [[ "$*" == *"require.resolve"* ]] && [ "${NODE_RESOLVE_RC:-0}" -ne 0 ]; then exit 1; fi\nexit 0\n' > "$T/bin/node"
printf '#!/bin/bash\necho 200\n' > "$T/bin/curl"
printf '#!/bin/bash\nexit 0\n' > "$T/bin/npm"
chmod +x "$T/bin/"*

# --------------------------------------------------- dépôt git de départ ---
git init -q --bare -b beta "$T/origin"
mkdir "$T/repo" && cd "$T/repo" || exit 1
git init -q -b beta
git config user.email test@modop.local
git config user.name test
git remote add origin "$T/origin"
echo '{}' > package.json
mkdir -p server/scripts server/data web node_modules
printf '# stub\n' > server/scripts/backup-db.mjs
: > server/modop.db
sed "s|APP_DIR=\"/opt/modop\"|APP_DIR=\"$T/repo\"|" "$REPO_ROOT/update.sh" > update.sh
git add -A && git commit -qm "depart" && git push -q origin beta

run_update() { PATH="$T/bin:$PATH" MODOP_DEPLOY_BRANCH=beta bash update.sh "$@"; }

# ------------------------------- B : update.sh réécrit pendant l'exécution ---
echo "B : mise à jour où update.sh lui-même change (auto-snapshot)"
git clone -q "$T/origin" "$T/bump" && cd "$T/bump" || exit 1
sed -i '5i# decalage' update.sh
git commit -qam "change update.sh" && git push -q origin beta
cd "$T/repo" || exit 1
: > "$PM2LOG"
out=$(run_update 2>&1); rc=$?
[ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "terminée" \
  && ok "mise à jour menée à terme (rc=$rc)" || ko "la mise à jour a échoué (rc=$rc)"
[ -f server/data/.update-snapshot.sh ] \
  && ok "exécution depuis le snapshot hors dépôt" || ko "pas de snapshot"
grep -q restart "$PM2LOG" && ok "pm2 relancé" || ko "pm2 jamais relancé"

# ------------------------------------------------- C : git fetch en échec ---
echo "C : git fetch en échec -> die() + relance"
git remote set-url origin "$T/nowhere"
: > "$PM2LOG"
out=$(run_update 2>&1); rc=$?
[ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q "git fetch a échoué" \
  && ok "échec propre via die() (rc=$rc)" || ko "pas d'échec propre (rc=$rc)"
grep -q restart "$PM2LOG" && ok "application relancée après l'échec" || ko "application laissée à l'arrêt"
git remote set-url origin "$T/origin"

# ---------------------------------- D : abort brutal non gardé -> trap EXIT ---
echo "D : échec non gardé (set -e brutal) -> trap EXIT relance l'app"
sed -i 's|^log "récupération du code|false # échec injecté\nlog "récupération du code|' update.sh
: > "$PM2LOG"
out=$(run_update 2>&1); rc=$?
[ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q "sortie inattendue" \
  && ok "abort intercepté par le trap EXIT (rc=$rc)" || ko "abort non intercepté (rc=$rc)"
grep -q restart "$PM2LOG" && ok "application relancée après l'abort" || ko "application laissée à l'arrêt"
git checkout -q -- update.sh

# ------------------------------------------------ E : rollback (fin nominal) ---
echo "E : rollback -> sauvegarde restaurée, vérifiée, app relancée"
: > "$PM2LOG"
out=$(run_update rollback 2>&1); rc=$?
[ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "base restaurée et vérifiée" \
  && ok "rollback complet (rc=$rc)" || ko "rollback a échoué (rc=$rc)"
grep -q restart "$PM2LOG" && ok "application relancée après rollback" || ko "application laissée à l'arrêt"

# ------------- F : better-sqlite3 indisponible (node_modules cassé) ---
echo "F : better-sqlite3 indisponible -> sauvegarde brute de secours, update qui va au bout"
cd "$T/bump" || exit 1
sed -i '6i# decalage F' update.sh
git commit -qam "change update.sh (F)" && git push -q origin beta
cd "$T/repo" || exit 1
: > "$PM2LOG"
out=$(NODE_RESOLVE_RC=1 run_update 2>&1); rc=$?
[ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "sauvegarde brute, non vérifiée" \
  && ok "dégradation propre : copie brute, update menée à terme (rc=$rc)" || ko "node_modules cassé bloque la mise à jour (rc=$rc)"
ls server/data/backups/db-*.db >/dev/null 2>&1 && ok "sauvegarde de secours présente" || ko "aucune sauvegarde de secours"

echo "F2 : rollback avec better-sqlite3 indisponible -> restauration non vérifiée assumée"
out=$(NODE_RESOLVE_RC=1 run_update rollback 2>&1); rc=$?
[ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "NON VÉRIFIÉE" \
  && ok "rollback dégradé complet (rc=$rc)" || ko "rollback dégradé a échoué (rc=$rc)"

echo
if [ "$fail" -eq 0 ]; then echo "TOUS LES SCÉNARIOS UPDATE PASSENT"; else echo "DES SCÉNARIOS UPDATE ÉCHOUENT"; fi
exit "$fail"
