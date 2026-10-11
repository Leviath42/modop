#!/usr/bin/env bash
# Tests front Modop — exécution PARALLÈLE (xargs -P) avec propagation
# d'échec : si un seul fichier de test échoue, le script échoue.
# Rationalisation : chaque fichier de test est un process tsx séparé
# (~1,1 s de boot + ~1,6 s d'import jsdom) — en séquentiel 55 s,
# en parallèle sur 8 workers ~15 s.
set -u
cd "$(dirname "$0")/.."

fails=0
run_one() {
  local f="$1"
  if ! npx tsx "$f" >/dev/null 2>&1; then
    echo "ÉCHEC: $f" >&2
    return 1
  fi
}
export -f run_one

ls src/lib/*.test.* | xargs -P 8 -I{} bash -c 'run_one "$@"' _ {} || fails=1

if [ "$fails" -ne 0 ]; then
  echo "AU MOINS UN TEST FRONT A ÉCHOUÉ" >&2
  exit 1
fi
echo "TOUS LES TESTS FRONT PASSENT"
