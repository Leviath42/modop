# Processus de développement — vagues IA supervisées

Ce document décrit le mode de fonctionnement du projet Modop : développement par **vagues de travail parallèle** orchestrées par un **agent chef de projet (CP)**, avec contrat figé, missions bornées, portes de qualité et validation humaine.

## 1. Rôles

| Rôle | Qui | Responsabilité |
|---|---|---|
| **Propriétaire** | Humain | Validation sur conteneur Proxmox, promotion `beta → main`, tag `last-stable`, décisions de blocage |
| **Chef de projet (CP)** | Agent IA | Figer le contrat, lancer/encadrer les workers, merges séquentiels, conformité |
| **Workers** | 1 agent IA par fonctionnalité | Mission bornée sur worktree + branche `feature/*` dédiée |

## 2. Branches

```
main          ← production validée (tag last-stable)
beta          ← intégration : contrat figé + fusions séquentielles
feature/<nom> ← un worker, une mission
```

- `beta` est **la seule branche d'intégration**. Aucun worker ne pousse dessus.
- `main` ne reçoit que des promotions décidées par le propriétaire après tests sur le conteneur Proxmox.

## 3. Le contrat figé (prérequis de vague)

Avant de lancer les workers d'une vague, le CP commite sur `beta` tout ce qui est **partagé** et ne doit plus être modifié pendant la vague :

- schéma de base de données + migrations initiales ;
- liens de navigation / squelette de routing (pages vides) ;
- routes publiques (conventions d'API : URLs, méthodes, formats de réponse) ;
- types/interfaces partagés (contrats TypeScript) ;
- conventions de code (lint, format, structure des dossiers) ;
- fixtures/seeds communes.

**Règle : un worker ne modifie jamais un fichier du contrat.** S'il en a besoin, il s'arrête et remonte le besoin au CP, qui arbitre et, si nécessaire, met à jour le contrat pour **tous** avant de relancer.

## 4. Mission worker (template)

Chaque worker reçoit une mission **bornée** :

```yaml
feature: <nom>
branche: feature/<nom>
worktree: ../modop-<nom>
spec: |
  <comportement attendu, références RF-x du cahier des charges>
fichiers_autorises:
  - <chemin/glob>
fichiers_interdits:
  - <chemin/glob — dont tout le contrat>
critères_acceptation:
  - <test exécutable ou vérification runtime>
```

Isolation matérielle : chaque worker travaille dans son **git worktree** détaché, avec sa propre base de données de test, afin d'éviter toute collision.

## 5. Portes de qualité (obligatoires avant tout merge)

Aucune fusion tant que les trois portes ne passent pas **dans le worktree du worker** :

1. **Typecheck** : `npm run typecheck` (tsc strict, zéro erreur).
2. **Build** : `npm run build` (production, zéro erreur).
3. **Tests d'exécution réels** : `npm test` — notamment pour **toute action serveur qui écrit en base** :
   - la base de test est réellement ouverte et écrite (pas de mock) ;
   - chaque route POST/PUT/DELETE est appelée en runtime avec ses effets vérifiés ;
   - pièges connus : `tsc` et `build` ne détectent **pas** les transactions asynchrones refusées par le driver SQL (ex. `better-sqlite3`), ni les erreurs de contrainte, ni les codes de statut incorrects. Seul le runtime les révèle.

Un worker qui échoue à une porte corrige chez lui ; il ne demande jamais de relâcher la porte.

## 6. Fusion séquentielle

1. Les workers terminés se déclarent avec le résumé de leurs changements et les résultats des trois portes.
2. Le CP fusionne **une branche à la fois** dans `beta` : `git merge --no-ff feature/<nom>`.
3. Après chaque fusion, le CP **rejoue les trois portes sur `beta`** et vérifie la conformité :
   - pas de fichier du contrat modifié ;
   - pas de fichier hors périmètre de la mission touché ;
   - critères d'acceptation de la fonctionnalité vérifiés en runtime.
4. Conflit ou non-conformité ⇒ la fusion est annulée, le worker corrige sur sa branche, on recommence. **Jamais de résolution de conflit « à l'aveugle » par le CP.**
5. Une fois toutes les branches de la vague fusionnées, `beta` est déployée sur le conteneur Proxmox pour validation humaine.

## 7. Validation humaine et promotion

1. Le propriétaire teste la vague sur le conteneur Proxmox (parcours réels : créer, consulter, exporter…).
2. En cas de retour : le CP ouvre les corrections en priorité, soit sur la branche d'origine si elle n'est pas encore absorbée, soit en nouvelle mini-vague sur `beta`.
3. **Promotion** : sur décision du propriétaire uniquement :
   ```bash
   git checkout main && git merge --no-ff beta
   git tag -f last-stable && git push origin main last-stable
   ```
4. `last-stable` est la référence de rollback en cas de régression.

## 8. Vague type — calendrier

```
CP   [contrat figé ........] [fusion W1][rejeu portes][fusion W2]... [déploiement beta]
W1                            [mission bornée .......]
W2                            [mission bornée .......]
W3                            [mission bornée .......]
Propriétaire                                                                          [tests Proxmox] [promotion]
```

## 9. Application au lot 1 (MVP) de Modop

### Vague 0 — contrat figé (CP seul, sur `beta`)

- Stack retenue : monorepo Node + TypeScript, base SQLite (`better-sqlite3`) adaptée à un conteneur unique, PWA React.
- Schéma DB : `users`, `workflows` (mode opératoire), `steps`, `photos`, `versions`.
- Migrations initiales, squelette de routing (login, liste, éditeur, lecteur), routes API publiques documentées (conventions REST), types partagés, seeds.

### Vague 1 — workers parallèles

| Worker | Fonctionnalité | RF |
|---|---|---|
| W1 | Authentification (comptes maison, rôles, reset) | RF-1 à RF-3 |
| W2 | CRUD mode opératoire + étapes (réordonnancement) | RF-10 à RF-12 |
| W3 | Upload/gestion des photos (compression côté client) | RF-13 |
| W4 | Publication + numérotation V1/V2/V3 | RF-20 à RF-23 |
| W5 | Consultation mobile/PC + recherche | RF-30 à RF-32 |
| W6 | Export DOCX | RF-40, RF-41 |

Fusions séquentielles dans l'ordre de dépendance : W1 → W2 → W3 → W4 → W5 → W6, portes rejouées entre chaque.

### Vagues suivantes

- **Vague 2** : annotations photos, pictogrammes, hors-ligne PWA (RF-14, RF-15, RF-33).
- **Vague 3** : historique de versions consultable, aperçu temps réel, ergonomie avancée.

## 10. Anti-patterns interdits

- Modifier le contrat depuis un worker.
- Fusionner deux branches simultanément ou sauter les portes sur `beta`.
- Se fier à `tsc`/`build` pour valider une écriture en base.
- Résoudre un conflit de merge sans comprendre les deux intentions.
- Pousser sur `main` sans décision du propriétaire.
