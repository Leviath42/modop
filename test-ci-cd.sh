#!/bin/bash
# Test CI/CD : modification délibérée pour forcer un échec

echo "Ajout d'une erreur de syntaxe pour tester le CI/CD..."

echo "const test = (" >> server/src/test.ts

git add server/src/test.ts

git commit -m "Test CI/CD : erreur de syntaxe délibérée"

git push origin beta

echo "Test CI/CD lancé. Vérifiez le statut du workflow GitHub Actions."