# Modop — Roadmap

*Dernière mise à jour : 2026-10-11 — basé sur [docs/cahier-des-charges.md](cahier-des-charges.md)*

## 📋 Résumé

Application web de création, publication et consultation de **modes opératoires** — pensée atelier : une étape, une photo, un pictogramme. Auto-hébergée (conteneur LXC Proxmox), accessible sur PC comme sur mobile (PWA), mise à jour depuis l'interface.

**Accès** : LAN interne + beta publique via tunnel Cloudflare (`modop-beta.calironi.com`).

## 👥 Rôles

| Rôle | Accès |
|------|-------|
| **Admin** | Tout + gestion des comptes, déploiement, statistiques |
| **Author** | Créer, modifier, publier, versionner, exporter |
| **Reader** | Consulter, rechercher, exporter |

## 📊 État du projet — vagues 0 à 5 TERMINÉES

| Vague | Fonctionnalité | État | Validation |
|-------|---------------|------|-----------|
| 0 | Contrat figé (schéma, API, routing) | ✅ | 79 tests runtime |
| 1 | Auth, CRUD workflows/étapes, photos, publication V1/Vn, consultation, export DOCX | ✅ | Testé en réel sur CT 105 |
| 2 | UI React complète (login, liste, éditeur, lecteur) | ✅ | Smoke tests jsdom |
| 3 | Sécurité : SSO OIDC générique (off par défaut), sessions expirantes, rate-limit, en-têtes, audit log, deploy verrouillable | ✅ | Audit + tests |
| 4 | Gestion comptes admin, suppression MO, pictos couleur+texte, familles/types | ✅ | Campagne beta |
| 5 | Duplication, tri, recherche plein texte, PWA hors-ligne, annotations photo, restauration version, stats | ✅ | Tests runtime + interaction jsdom |
| — | Thème sombre/clair (communauté, PR #4) | ✅ | Intégré |
| — | Taille/position des photos (S/M/L/Plein + alignement), bandeaux sticky, clic-clic annotation | ✅ | À valider en campagne |

### Constats des campagnes de tests
- Annotation : le drag natif navigateur entre en conflit avec les cartes d'étapes → **clic-clic** retenu (départ/arrivée), plus le déplacement des formes posées.
- Express : deux routers sur le même préfixe de path → le premier absorbe tout (règle « un-path-un-domaine » au contrat).
- Les tests jsdom ne font pas de layout réel (`scrollWidth` = 0) : les vérifications visuelles restent manuelles sur le CT.

## 🛠️ Stack

- **Serveur** : Express + better-sqlite3 (un seul process, sert aussi le front buildé)
- **Front** : React + Vite (PWA : manifest + service worker)
- **Tests** : `node:test` (79 backend) + smoke tests jsdom (UI)
- **Déploiement** : conteneur LXC Proxmox, pm2, `update.sh` (sauvegarde base + git reset + build + healthcheck), tunnel Cloudflare

## 🚧 Prochaines étapes (vague 6 — proposition)

| # | Fonctionnalité | Notes |
|---|---------------|-------|
| 1 | **UI statistiques** | Page admin dédiée consommant `/api/stats` (existe déjà côté API) |
| 2 | **Workflow de validation** | brouillon → relecture → publié, commentaires par relecteur |
| 3 | **Comparaison de versions** | diff Vn/Vn+1 (titres, étapes ajoutées/supprimées) |
| 4 | **SSO réel** | brancher l'IdP de l'entreprise (OIDC prêt — variables d'env) |
| 5 | **Annotations sur le DOCX** | dessiner les shapes sur les images exportées |
| 6 | **PWA : cache amélioré** | pré-cache des MO publiés pour lecture hors-ligne complète |

## 🗺️ Vision long terme

- Multi-langue (interface + contenus)
- API publique (intégrations GMAO)
- Comparaison/ restauration fine par étape
- Statistiques d'usage par MO (vues, exports)

## 🧭 Principes (inchangés)

Vagues IA supervisées : contrat figé avant chaque vague, missions bornées, portes (typecheck + build + tests d'exécution réels), fusion séquentielle, validation humaine sur le CT.
