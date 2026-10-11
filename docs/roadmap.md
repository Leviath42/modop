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

### Correctifs récents (canevas d'étape, thème, flèches)

- **Référentiel vertical FIXE (240 px)** : les positions y (photos et formes) sont désormais stockées en fraction d'une hauteur de référence constante — auparavant elles étaient Relatives à la hauteur visible du canevas et l'éditeur ré-appliquait un facteur `y × 0,6` à chaque chargement : les zones rectangulaires et les photos **remontaient vers le haut à chaque cycle sauvegarde/rechargement**. Le lecteur et l'éditeur partagent le même référentiel.
- **Hauteur adaptative** : la hauteur du canevas s'adapte à la position et à la taille **réelles** des images (ratio mesuré au chargement) ; les images placées en bas ne sont plus rognées.
- **Sélection au rectangle** : appliquée au **relâchement avec déplacement** — un clic sur le fond ne vide plus la sélection ; le clic objet unique redevient fiable.
- **Pointe des flèches** : un marqueur SVG par couleur de forme — la pointe prend enfin la couleur de la flèche (éditeur et lecteur).
- **Thème sombre/clair** : icône ☀️/🌙 homogène partout (fini le bouton texte « Clair/Sombre » de la nav), `meta theme-color` mobile mis à jour au changement, cache service worker passé en v2 pour éviter qu'un vieux front servi hors-ligne fasse régresser le réglage.
- **Lecteur** : plus de nom d'étape en légende sous les photos (l'ancien rendu affichait `alt = titre de l'étape` sous chaque image ; le composant `AnnotatedPhoto` et son import mort sont retirés du lecteur).

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

## 🚧 Vague 7 — Gestion documentaire avancée (proposition, à spécifier)

Demandes du propriétaire à intégrer au cahier des charges :

| # | Fonctionnalité | Pistes |
|---|---------------|-------|
| 1 | **Arborescence documentaire paramétrable** | Types de documents paramétrables + regroupements multi-niveaux (ex. Famille > Sous-famille > Type) ; remplace/complète les filtres famille/type actuels |
| 2 | **Page de menu** | Accueil/navigation par arborescence (au lieu de la liste plate actuelle) ; à définir : entrée par famille, recherche, tuiles ? |
| 3 | **Nouvelle image : drag & drop / presse-papiers** | Coller une capture d'écran (Ctrl+V) dans l'étape + glisser-déposer un fichier sur le canevas ; compression existante conservée |
| 4 | **Gestion des versions enrichie** | Historique par version avec **description des modifications apportées** (changelog saisi à la publication), affichage côte à côte avec la liste actuelle (auteur, date) et la restauration |
| 5 | **Documents parents** | Un MO peut être rattaché à un document parent (ex. notice machine > modes opératoires associés) ; navigation parent/enfants |
| 6 | **Gestion de statut** | Statut éditorial paramétrable sur le document (ex. brouillon / en relecture / validé / obsolète), distinct de l'état publication actuel ; filtrage et badges |

À décider avant dév : modèle de données (tables types/regroupements, colonnes parent_id, status), permissions par statut, migration des données existantes.

## 🗺️ Vision long terme

- Multi-langue (interface + contenus)
- API publique (intégrations GMAO)
- Comparaison/ restauration fine par étape
- Statistiques d'usage par MO (vues, exports)

## 🧭 Principes (inchangés)

Vagues IA supervisées : contrat figé avant chaque vague, missions bornées, portes (typecheck + build + tests d'exécution réels), fusion séquentielle, validation humaine sur le CT.
