# Modop — Roadmap

*Dernière mise à jour : après C-63 — **priorité redéfinie : le fonctionnel et le mode édition (vagues 7-8)**, **vague 10 (sécurité) en standby** (décision propriétaire 2026-10-18) ; Uptime Kuma déployé sur le Proxmox (healthcheck supervisé, remonté dans Home Assistant) ; vague 9 terminée côté code et ops ; production maintenue sur `beta` (activation `MODOP_DEPLOY_BRANCH=main` différée) ; reste côté propriétaire : recevoir les premières PR Dependabot.*

L'historique complet des vagues livrées (v0 → v6bis) est archivé dans [archives/roadmap-v1-a-v6bis.md](archives/roadmap-v1-a-v6bis.md). La série de correctifs UI/UX (C-01 → C-51) est journalisée dans [correctifs.md](correctifs.md).

## ✅ Implémenté (v0 → v6bis + correctifs C-01..C-51)

- **Éditeur complet** : canevas par étape (photos libres, flèches/zones/textes clic-clic, corbeille de drag), étape active dynamique, autosave des métadonnées, uploads galerie **ou appareil photo**, barre d'outils sticky avec labels, pictos couleur+texte, familles/types.
- **Publication versionnée** : V1 → Vn immuable (snapshot complet : canevas + mise en page), changelog à la publication, restauration de version, duplication.
- **Lecture** : PC (sommaire, sélecteur d'étape ▶, versions publiées), mobile (lecture guidée une-étape-par-écran, boutons fixes en bas), lightbox plein écran (RF-31), QR imprimable, mode sombre.
- **Accueil** : regroupement Publié/Brouillon puis par famille, groupes repliables persistés, recherche debouncée, filtres (état, famille, à revoir), tri.
- **Terrain** : signalement par étape (lecteur), page dédiée « ⚑ Terrain » (à traiter / traitées, Résoudre, Corriger l'étape).
- **GED** : date de revue, responsable (sélecteur à recherche, comptes actifs), badge+filtre « à revoir », garde-fou à la désactivation du responsable.
- **Comptes** : rôles reader/author/admin, Prénom/Nom, modale d'édition complète, SSO OIDC optionnel, sessions révocables.
- **Statistiques (admin)** : usage, top consultés/exportés (libellés lisibles), activité récente, journal d'audit (200 lignes).
- **Suppression MO** : admin uniquement, double confirmation, case décochée par défaut.
- **Sécurité** : anti-CSRF (+ allowlist `MODOP_ALLOWED_HOSTS`), magic numbers, rate limits (login, feedback), révocation au changement de rôle, en-têtes durcis, audit.
- **Ops** : mise à jour/retour arrière depuis l'interface (admin), journal en direct, tests rationalisés (~9 s serveur + ~16 s front).

## 🚧 Restant à implémenter

> **Priorité actuelle (décision propriétaire, 2026-10-18) : le fonctionnel et le mode édition** — les vagues 7 et 8 passent devant ; la vague 10 (sécurité) est en standby. Dans la vague 8, les items d'édition (images, statut éditorial) sont en tête.

### Vague 7 (proposition — reprise de l'ancienne vague 6)

| # | Fonctionnalité | Notes |
|---|---------------|-------|
| 1 | **Workflow de validation** | brouillon → relecture → publié, commentaires par relecteur (les stats et l'UI admin existent déjà côté API) |
| 2 | **Comparaison de versions** | diff Vn/Vn+1 (titres, étapes ajoutées/supprimées) — l'historique existe déjà |
| 3 | **SSO réel** | brancher l'IdP de l'entreprise (l'OIDC est prêt : variables d'env, bouton de connexion déjà branché) |
| 4 | **PWA : cache amélioré** | pré-cache des MO publiés pour lecture hors-ligne complète |

### Vague 8 — Gestion documentaire avancée (proposition, à spécifier)

| # | Fonctionnalité | Pistes |
|---|---------------|-------|
| 1 | **Nouvelle image : drag & drop / presse-papiers** | Ctrl+V dans l'étape + glisser-déposer sur le canevas ; compression conservée — prioritaire (mode édition) |
| 2 | **Gestion de statut éditorial** | brouillon / en relecture / validé / obsolète (distinct de publié), filtrage, badges |
| 3 | **Arborescence documentaire paramétrable** | types de documents + regroupements multi-niveaux (Famille > Sous-famille > Type) |
| 4 | **Page de menu** | navigation par arborescence ou tuiles (la liste groupée actuelle peut servir de base) |
| 5 | **Documents parents** | rattachement parent/enfants (notice machine > MO associés), navigation |
| 6 | **Import de MO existants (RF-78)** | conversion automatique `.docx` / `.pdf` / scans → brouillon Modop : extraction texte + images, détection des étapes, relecture obligatoire par l'auteur avant publication (jamais de publication automatique) |

### Vague 9 — Durcissement industriel (issue #8)

Automatisation des portes qualité et cycle de déploiement — revue externe du 2026-10-17, par priorité :

| # | Action | Priorité | État |
|---|---------------|---|---|
| 1 | **CI GitHub Actions** sur push/PR `beta` et `main` : jobs `server` (typecheck + build + tests runtime) et `web` (build + tests front), badge de statut dans le README | 🔴 | ✅ livré (C-57) — `npm ci` racine + scripts par workspace, portes lint/typecheck/build/tests des deux côtés, badge README |
| 2 | **Lint et formatage automatisés** : ESLint (TS strict) + Prettier sur `server` et `web`, 4ᵉ porte qualité en CI, reformatage ponctuel en un commit dédié | 🔴 | ✅ livré (C-57) — lint vert sur `server` et `web` en CI ; Prettier configuré (`.prettierrc` racine, scripts `format`) ; reformatage ponctuel du code existant non exécuté (à faire en commit dédié si souhaité) |
| 3 | **Supply-chain** : Dependabot (ou Renovate) + porte `npm audit --omit=dev --audit-level=high` en CI ; statuer sur `--ignore-scripts` pour `npm ci` (esbuild, better-sqlite3) | 🟠 | ✅ livré (C-56 + C-57) — Dependabot actif, job `audit` en CI ; décision : **scripts d'install conservés** (better-sqlite3/esbuild en ont besoin — voir durcissement-securite.md § 5) |
| 4 | **Branche de déploiement paramétrable** : `MODOP_DEPLOY_BRANCH` (défaut `beta` rétro-compatible pour l'homelab), production sur `main` ; à terme CT de recette sur `beta` + CT de prod sur `main` | 🟠 | ✅ livré (C-57) — env > `.deploy-branch` > `beta` ; update.sh + proxmox-install.sh adaptés aux workspaces au passage ; **décision propriétaire (2026-10-18) : production maintenue sur `beta` pour le moment** |
| 5 | **Observabilité minimale** : supervision du healthcheck (ex. Uptime Kuma auto-hébergé sur le Proxmox) avec notification ; optionnel : endpoint `/metrics` | 🟡 | ✅ livré et **déployé** (C-62) — Uptime Kuma en production sur le Proxmox, moniteur `GET /api/health`, état visible depuis Home Assistant ; extensions possibles (non retenues pour l'instant) : moniteur push « sauvegarde/déploiement OK », expiration du certificat du tunnel, endpoint `/metrics` |
| 6 | **Sauvegardes SQLite cohérentes** : remplacer la copie de fichier par `VACUUM INTO` ou `.backup()` (better-sqlite3) dans `update.sh` ; test de restauration automatisé (`PRAGMA integrity_check`) | 🟡 | ✅ livré (C-57) — `server/scripts/backup-db.mjs` (VACUUM INTO + integrity_check de la copie, contrôle aussi après restauration/rollback), 3 tests runtime (`server/test/backup-restore.test.ts`) |

Critères d'acceptation (issue #8) : un push cassant typecheck/build/tests refusé par le CI (✅ CI fonctionnelle) ; lint vert sur `server` et `web` (✅) ; premières PR Dependabot reçues (⏳ côté GitHub) ; déploiement de production visant `main` (✅ `MODOP_DEPLOY_BRANCH` — ⏳ activation différée : production maintenue sur `beta`, décision propriétaire) ; healthcheck supervisé avec alerte (✅ Uptime Kuma déployé, supervisé depuis Home Assistant) ; une sauvegarde restaure une base `integrity_check = ok` (✅ testé en runtime).

### Vague 10 — Palier sécurité entreprise (issue #9) — ⏸️ **en standby**

*Décision propriétaire (2026-10-18) : pas de besoin pour le moment — priorité au fonctionnel et au mode édition. Contenu conservé pour relance ultérieure. Rappel en attendant : l'UI de login n'a pas de champ `totp`, **`MODOP_TOTP_SECRET` reste désactivé**.*

| # | Action | Priorité | État |
|---|---|---|---|
| 1 | **MFA TOTP par compte** (RF-79) : QR `otpauth://` à l'activation, code de secours à usage unique, admin obligatoire / auteur optionnel / lecteur exempt, login SSO exempt, anti-replay, révocation à la désactivation | 🔴 | partiel — porte serveur livrée (secret global `MODOP_TOTP_SECRET`, login admin uniquement, tests `server/test/mfa-totp.test.ts`) ; **l'UI de login n'envoie pas de champ `totp` : ne pas activer en production avant le front** ; reste : par compte, activation QR, code de secours, anti-replay, UI |
| 2 | **Chiffrement at-rest de la base** : SQLCipher via better-sqlite3 ou chiffrement applicatif ; clé hors base (`MODOP_DB_KEY` ou fichier monté) ; exports de sauvegarde chiffrés avec la même clé ; procédure de restauration documentée et testée | 🟠 | à faire |
| 3 | **Scan offensif externe** : OWASP ZAP (active) ou Nuclei sur l'instance de recette + checklist manuelle (upload non-image, IDOR `/api/workflows` et `/api/photos`, injection SQL dans la recherche, brute force login derrière le tunnel) ; rapport dans `docs/revue-securite-externe.md` | 🟡 | à faire |
| 4 | **PRA écrit et testé** : `docs/plan-de-reprise.md` + **exercice réel** chronométré (base + photos dans un CT vierge), corriger le doc ; lié au test de restauration de la vague 9 | 🟡 | partiel — brouillon du document présent ; exercice de restauration à faire |

Critères d'acceptation (issue #9) : un compte admin sans code TOTP valide ne se connecte pas (replay impossible) ; la base est illisible sans la clé ; sauvegardes chiffrées et restauration testée sur CT vierge ; rapport ZAP/Nuclei archivé et constats classés ; `plan-de-reprise.md` + exercice chronométré.

### Vision long terme

- Multi-langue (interface + contenus)
- API publique (intégrations GMAO)
- Statistiques d'usage fines par MO

## 🧭 Principes de développement

Vagues IA supervisées : contrat figé avant chaque vague, missions bornées, portes qualité (typecheck + build + tests d'exécution réels), fusion séquentielle sur `beta`, validation humaine sur le CT — voir [processus-vagues.md](processus-vagues.md).
