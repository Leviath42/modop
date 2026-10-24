# Plan de reprise d'activité (PRA) — Modop

> **v1.1 (24 oct. 2026)** — étoffé depuis le squelette v1.0. Règle : *un PRA non répété n'est pas un PRA* — l'exercice chronométré (§6) fait partie du livrable (critère d'acceptation vague 10, issue #9).

## 1. Objectifs

| Objectif | Cible | Signification concrète |
|---|---|---|
| RTO (délai de reprise) | 1 h | les ateliers retrouvent la lecture des MO publiés en moins d'1 h |
| RPO (perte max de données) | 15 min | au plus 15 min de saisie perdues (brouillons, publications) |

## 2. Composants critiques

| Composant | Emplacement | Si perdu |
|---|---|---|
| Conteneur LXC Proxmox | CT Modop (`/opt/modop`) | app injoignable — rien d'irrécupérable si §3 est respecté |
| Base SQLite (workflows, étapes, comptes, audit) | fichier unique du serveur | **tout** le contenu |
| Fichiers photos des étapes | stockage du serveur, hors base | les images des MO (la base n'en garde que les références) |
| Sauvegardes | snapshots `VACUUM INTO` (`server/scripts/backup-db.mjs`, vérifiés `integrity_check`) | capacité de restauration |
| `.env` du serveur (secrets, `MODOP_DEPLOY_BRANCH`…) | CT | config perdue, secrets à recréer |
| Tunnel DNS public | gestionnaire DNS/tunnel | accès extérieur uniquement (le LAN continue) |
| Supervision Uptime Kuma | hors CT (Proxmox / Home Assistant) | **précieuse en sinistre** : elle alerte et survit au CT |

Dépendances externes : hôte Proxmox, copie de sauvegarde hors CT, gestionnaire DNS du tunnel. Chiffrement at-rest (SQLCipher, `MODOP_DB_KEY`) : **non activé à ce jour** (vague 10) — le jour où il l'est, la clé devient un composant critique (stockée hors CT) et le §4 doit être mis à jour.

## 3. Prérequis de sauvegarde (ce qui doit être vrai pour tenir le RPO)

| # | Prérequis | État |
|---|---|---|
| 1 | Snapshot `VACUUM INTO` + `integrity_check` **avant chaque update** (`update.sh` ; fallback copie brute assumée si `better-sqlite3` indisponible — C-61) | ✅ automatique |
| 2 | `server/scripts/backup-db.mjs` : snapshot vérifié en un fichier, restauration testée en runtime (C-57) | ✅ livré |
| 3 | **Planification régulière** de la sauvegarde (cible : toutes les 15 min pour tenir le RPO) + **copie hors CT** | ⚠️ **à planifier** — sans elle, le RPO réel = « depuis la dernière mise à jour » |
| 4 | Sauvegarde du dossier photos, même cadence que la base | ⚠️ à inclure dans le cron n° 3 |
| 5 | Sauvegarde du `.env` (secrets) hors CT | ⚠️ idem — sans les secrets, la base restaurée ne démarre pas |
| 6 | Piste supervision : moniteur push Kuma « battement sauvegarde OK » (une absence de battement alerte) | documentée, non implémentée |

## 4. Scénarios de sinistre et procédures

### S1 — Échec de mise à jour / base endommagée (le plus courant)
1. `update.sh` ne laisse jamais l'app à l'arrêt (trap EXIT / `die()` relance pm2) — si le serveur répond, la prod vit déjà.
2. `bash update.sh rollback` : restaure le dernier snapshot vérifié (`integrity_check` repassé après restauration).
3. Si le rollback échoue ou que la base reste corrompue : `pm2 stop`, restaurer l'avant-dernier snapshot, `pm2 start`.
4. Vérifications §5.

### S2 — Perte du conteneur (suppression, hôte HS, corruption massive)
1. Reconstruire un CT vierge et réinstaller : `git clone -b <branche prod> https://github.com/Leviath42/modop.git /opt/modop` (production maintenue sur `beta`, décision propriétaire ; `MODOP_DEPLOY_BRANCH` > `.deploy-branch` > `beta`), puis installation selon `docs/guide-test-proxmox.md`.
2. Recréer le `.env` depuis la copie hors CT (secrets, `MODOP_DEPLOY_BRANCH`).
3. Restaurer la base : dernier snapshot `VACUUM INTO` → emplacement du fichier de base, puis `PRAGMA integrity_check`.
4. Restaurer le dossier photos depuis la copie externe (**même date que la base**, sinon références/étapes incohérentes).
5. Démarrage PM2 puis healthcheck `GET /api/health` → `{ ok: true }`.
6. Vérifications §5 + Kuma repasse Up.

### S3 — Compromission suspectée (comptes, données altérées)
1. Révoquer **toutes** les sessions (page admin — sessions révocables).
2. Réinitialiser les mots de passe admin ; passer l'audit des actions en revue (il permet de dater les altérations).
3. Restaurer la base du dernier snapshot **sain** si des données ont été modifiées.
4. Rotation des secrets du `.env` ; si `MODOP_TOTP_SECRET` est activé un jour : le régénérer.
5. Scan offensif en soutien (vague 10) : rapport `docs/revue-securite-externe.md`.

### S4 — Tunnel DNS indisponible
1. Pas de sinistre de données : accès LAN direct.
2. Kuma alerte (si le moniteur vise l'URL publique) — diagnostiquer côté gestionnaire DNS.
3. Ne pas reconstruire le CT pour ça : une panne DNS n'est pas une panne app.

## 5. Vérifications post-restauration

- [ ] `GET /api/health` → `{ ok: true }` (HTTP 200)
- [ ] `pm2 status` : processus en ligne, pas de crash-loop
- [ ] Un MO publié s'ouvre en **lecture** : toutes les photos s'affichent (références base ↔ fichiers OK)
- [ ] Connexion d'un compte connu ; journal d'audit lisible
- [ ] Publication d'essai sur un MO de test puis suppression (droits en écriture OK)
- [ ] Uptime Kuma : moniteur Up
- [ ] Page /deploy (admin) : version affichée cohérente avec la branche

## 6. Exercice chronométré (à faire — critère d'acceptation vague 10)

Reconstruire **un CT vierge** en ne suivant que ce document, chronomètre en main :

- cible : RTO tenu (≤ 1 h), base et photos restaurées, vérifications §5 toutes vertes ;
- noter pendant l'exercice : durée réelle, chemins exacts manquants, commandes fausses, étapes ambiguës ;
- corriger ce PRA dans la foulée — le PRA est vivant, il se réécrit à chaque exercice ;
- périodicité ensuite : 1×/an, ou après tout changement majeur (chiffrement at-rest, changement d'hôte, passage de la production sur `main`).
