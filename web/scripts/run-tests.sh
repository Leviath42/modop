#!/usr/bin/env bash
# Tests front Modop — exécution PARALLÈLE (xargs -P) avec propagation
# d'échec : si un seul fichier de test échoue, le script échoue.
# Chaque fichier est un process tsx séparé (~1,1 s de boot + ~1,6 s d'import
# jsdom) — en séquentiel ~55 s, en parallèle ~15 s.
#
# Robustesse charge (CI) : les tests jsdom attendent des délais fixes après
# montage React ; sur un runner partagé (4 vCPU, process privés de CPU), un
# délai peut expirer avant le rendu. Trois parades :
#   - parallélisme adaptatif : moitié des cœurs, borné à [2, 8] ;
#   - chaque fichier est réessayé une fois en cas d'échec ;
#   - la sortie d'un test qui échoue deux fois est AFFICHÉE (diagnostic CI).
#
# Usage :
#   bash scripts/run-tests.sh          # parallèle
#   bash scripts/run-tests.sh --seq    # séquentiel, stop au premier échec
set -u
cd "$(dirname "$0")/.."

run_one() {
  local f="$1" out="" rc=1 attempt
  for attempt in 1 2; do
    out=$(npx tsx "$f" 2>&1)
    rc=$?
    [ "$rc" -eq 0 ] && return 0
    sleep 2
  done
  echo "ÉCHEC: $f" >&2
  printf '%s\n' "$out" | tail -15 >&2
  return 1
}
run_one_seq() {
  local f="$1" out rc
  out=$(npx tsx "$f" 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "ÉCHEC: $f" >&2
    printf '%s\n' "$out" | tail -15 >&2
    return 1
  fi
  return 0
}
export -f run_one

if [ "${1:-}" = "--seq" ]; then
  for f in src/lib/*.test.*; do
    run_one_seq "$f" || exit 1
  done
  echo "TOUS LES TESTS FRONT PASSENT (séquentiel)"
  exit 0
fi

fails=0
JOBS=$(( $(nproc 2>/dev/null || echo 4) / 2 ))
[ "$JOBS" -lt 2 ] && JOBS=2
[ "$JOBS" -gt 8 ] && JOBS=8

ls src/lib/*.test.* | xargs -P "$JOBS" -I{} bash -c 'run_one "$@"' _ {} || fails=1

if [ "$fails" -ne 0 ]; then
  echo "AU MOINS UN TEST FRONT A ÉCHOUÉ" >&2
  exit 1
fi
echo "TOUS LES TESTS FRONT PASSENT"
