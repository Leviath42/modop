# Roadmap Modop

État au : vague 3 terminée (beta en ligne sur tunnel Cloudflare).

## ✅ Livré

### Vague 0 — Fondations
- Contrat figé : schéma SQLite, types, API REST, routing
- Cahier des charges, processus de développement par vagues

### Vague 1 — MVP métier
- Authentification maison (bcrypt, sessions, rôles lecteur/auteur/admin)
- CRUD modes opératoires + étapes (réordonnancement glisser-déposer)
- Photos : upload compressé côté client, stockage disque
- Publication : versionnement automatique V1/V2/V3, snapshots, historique
- Consultation : liste avec recherche, vue une-étape-par-écran mobile, sommaire PC
- Export DOCX (en-tête, étapes, photos, pictos)

### Vague 2 — Interface
- UI React complète : login, liste, éditeur, lecteur responsive

### Vague 3 — Sécurité & exploitation
- SSO OIDC générique (off par défaut, activable par env)
- Sessions expirantes, rate-limit login, en-têtes de sécurité, audit log
- Mise à jour depuis le front (page Déploiement, update.sh, rollback base)
- Conteneur LXC Proxmox : install en une commande, pm2, migrations auto
- Tunnel Cloudflare + durcissement (pare-feu, cookies sécurisés)

### Vague 4 — Gestion & ergonomie (répond aux retours beta)
- **Gestion des comptes** (admin) : création, rôles, désactivation (révocation immédiate), reset mot de passe temporaire
- **Suppression de mode opératoire** avec confirmation et cascade
- **Pictogrammes enrichis** : couleur + texte libre par étape (édition, lecture, export)
- **Classement famille / type** : champs dédiés, filtre par famille, badges

## 🚧 Prochaine vague — Vague 5 (proposée)

| # | Fonctionnalité | Détail |
|---|---|---|
| 1 | **Annotations photo** | Flèches, rectangles, zones sur les photos (canvas), intégrées à l'export |
| 2 | **Hors-ligne PWA** | Manifest + service worker, consultation des MO déjà vus sans réseau |
| 3 | **Recherche plein texte** | Dans les descriptions d'étapes, pas seulement titre/référence |
| 4 | **Duplication de mode opératoire** | Point de départ rapide d'un MO similaire |
| 5 | **Tri de la liste** | Par famille, type, date, titre |

## 🗺️ Visions moyenne / longue terme

- **SSO réel** : brancher le SSO de l'entreprise (OIDC déjà prêt — il suffit de la config env) ; 2FA/TOTP pour les admins si pas de SSO
- **Workflow de validation** : brouillon → relecture → publié (avec commentaires)
- **Comparaison de versions** : diff entre Vn et Vn+1, restauration d'une version antérieure
- **Statistiques d'usage** : MO les plus consultés, exports, activité par utilisateur
- **API publique** : pour intégrations (Home Assistant, GMAO existante…)
- **Multi-langue** : interface et contenus

## 🧭 Principes

- Processus : vagues IA supervisées (contrat figé, missions bornées, portes tsc/build/tests runtime, fusion séquentielle, validation humaine sur Proxmox)
- Sécurité : LAN/tunnel uniquement, SSO dès que disponible, audit de tout
- Simplicité : un conteneur, une base SQLite, zéro dépendance externe
