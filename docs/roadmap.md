# Modop — Roadmap

*Dernière mise à jour : 16 nov. 2026, après C-100 — **cycle de retour terrain clos (C-70 → C-80, fusionné sur main) + correctifs GED/lecture C-81 → C-88** : export en entête du lecteur, fidélité du composite docx, alerte « à revoir » expliquée avec lien, date de revue/responsable portés par les versions publiées, recherche de responsable accessible aux auteurs, délai de revue par défaut paramétrable (30 j), champs date/responsable robustes dès la création, numéro unique vérifié en direct (casse ignorée) + Familles en liste de recherche. **Backlog prioritaire** : undo/redo global, **templates de documents** (mode de réaction, tableau, enregistrements, FIT, fiches d'aspect), vidéo liée au MO, texte riche. Vague 10 (sécurité) en standby. Vague 9 terminée code + ops ; production sur `beta`. **Ajout (26 oct. 2026) : vague 11 « preuve de formation » (quiz de compréhension pré/post) proposée — voir § Vague 11.*** **Ajout (26 oct. 2026) : § Conformité & traçabilité contractuelle — suivi des versions des CGV (art. 19) + liaison licence ↔ version.** **Porte de déploiement (26 oct. 2026)** ajoutée en Vague 9 #7 : `update.sh` refuse un SHA rouge / en cours / sans run (livré C-89, 15 nov. 2026) — constat : un déploiement a eu lieu alors que la CI était rouge (échec audit undici).*** **Ajout (16 nov. 2026) : C-90/C-91 — serveur MCP natif sur `/mcp` (24 outils IA + instructions serveur), premier pas de la Vision long terme « API publique » ; doc `docs/connecteur-mcp.md`. Nouvel item backlog : texte des étapes en dessous des images.** **Ajout (16 nov. 2026) : Vague 12 « corrections retour terrain » (texte des étapes sous les images en tête, fidélité docx, édition) + Vague 13 « API publique, exports multi-formats & accès IA » (spéc `docs/spec-api-ia.md`). O2 retiré : la production reste sur `beta` jusqu'à une prod réelle stable.** **Livré (16 nov. 2026) : C-93 — texte des étapes sous les images (Vague 12 #1) ; C-94 — arborescence documentaire paramétrable (1 à X niveaux, titres renommables, slug immuable) + documents parents (Vague 12 #11-12 / Vague 13 #1).** **Livré aussi (16 nov. 2026) : C-92/C-95 — annotations photo portées par les versions publiées et rendues (lecture, guidé, éditeur, export docx) + formes basses non tronquées (Vague 12 #2-4).** **Livré aussi (16 nov. 2026) : C-96 — retours terrain ouverts visibles en édition (badges global + par étape vers la page de traitement), commentaire de version vidé après publication, commentaires d'auteurs par étape — jamais publiés (Vague 12 #5-7).** **Livré (16 nov. 2026) : C-97 — indications métiers paramétrables (page Paramètres + flyout éditeur dynamique + résolution des pictos API/MCP) et reset d'un brouillon même sans version publiée (V12 #8-9). La Vague 12 est entièrement soldée.** **Livré (16 nov. 2026) : C-98 — chemins arborescents exposés en API (category_path sur workflow, liste, catégories), exports Markdown et JSON canonique (?format=md|json, ancres d'étapes MO-xxx/etapes/n), champ image_description + édition alt/description après upload (PUT /api/photos/:id/meta) + warning non bloquant à la publication (V13 #1/#2/#3/#5).** **Livré aussi (16 nov. 2026) : C-99 — renommage `image_description` (le nom décrit la donnée, pas un consommateur), vignettes cliquables par étape pour éditer les descriptions des photos, correction du numéro de version dans la confirmation de publication.** **Livré aussi (16 nov. 2026) : C-100 — montées de versions sécurité des dépendances (npm audit fix, transitifs minimatch/eslint, 9→0 sur beta) ; main réaligné sur beta (31 commits C-81→C-100 fusionnés — les 24 high Dependabot venaient du retard de main, déjà corrigés sur beta).** **Livré (17 nov. 2026) : C-101 — import de documents multiformat (Vague 8 #6, RF-78) : docx/pdf/xlsx → brouillon dans l'éditeur, relecture obligatoire, OCR refusé proprement en v1, lecteur xlsx maison (exceljs écarté supply-chain).** **Livré (17 nov. 2026) : C-102 — multer 2.5.0 (CVE-2025-7338 : la vraie cause du « 30 vuln » Dependabot persistant ; main réaligné sur beta).** **Livré (17 nov. 2026) : C-103 — import xlsx v2 : cellules fusionnées, images embarquées ancrées, repères Étape/Phase sur toutes les colonnes, multi-feuilles.** **Livré (17 nov. 2026) : C-104/C-105/C-106 — Vague 13 soldée (corpus+manifest `GET /api/corpus`, outils MCP `get_workflow_markdown`/`export_corpus`, export PDF pdf-lib) ; reste #8 tokens API (gelé jusqu'à prod réelle). Arbitrage V11 (17/11 soir) : **pas de quiz dans modop — V11 retirée** ; si besoin, app de formation dédiée consommant l'API (cadrage conservé : `docs/spec-preuve-formation.md`).**

L'historique complet des vagues livrées (v0 → v6bis) est archivé dans [archives/roadmap-v1-a-v6bis.md](archives/roadmap-v1-a-v6bis.md). La série de correctifs UI/UX (C-01 → C-88) est journalisée dans [correctifs.md](correctifs.md).

## ✅ Implémenté (v0 → v6bis + correctifs C-01..C-91)

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
- **Connecteur MCP (C-90/C-91)** : serveur MCP natif sur `/mcp` — 24 outils IA (workflows, étapes, photos, versions, publication, export docx, retours terrain), Bearer `MODOP_MCP_TOKEN` + compte service `svc-mcp` (rôle author), appels API en loopback (validations, rate limits et audit identiques), instructions serveur à l'initialize ; doc `docs/connecteur-mcp.md`.
- **Refonte UI (C-64)** : Tailwind v4 + design tokens de la palette officielle (bleu-gris/orange, clair + sombre) + composants type shadcn faits maison (`web/src/components/ui/`) ; toutes les pages migrées vers les classes/utilitaires, comportements, aria et invariants conservés ; guide de référence `docs/guide-interface-utilisateur.md`, palette `web/src/styles.css`.

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
| 3 | **Arborescence documentaire paramétrable** | ✅ livré C-94 (16 nov. 2026, item détaillé en Vague 13 #1) — le reste de la table garde les pistes d'origine |
| 4 | **Page de menu** | navigation par arborescence ou tuiles (la liste groupée actuelle peut servir de base) |
| 5 | **Documents parents** | ✅ livré C-94 (16 nov. 2026, Vague 12 #12) — parent affiché au lecteur + « Documents liés » |
| 6 | **Import de MO existants (RF-78)** | ✅ livré C-101→C-103 (17 nov. 2026) : `POST /api/import/document` (`.docx` titres+images / `.pdf` textuel / `.xlsx` v2 : cellules fusionnées, images embarquées ancrées à l'étape, repères Étape/Phase sur toutes les colonnes, multi-feuilles) → brouillon direct dans l'éditeur, relecture obligatoire avant publication (jamais d'auto-publication) ; OCR non couvert (pdf scan refusé 422), `.xls` binaire refusé (convertir en .xlsx), dates Excel non converties, 100 étapes / 30 images / 20 Mo max |

### Vague 9 — Durcissement industriel (issue #8)

Automatisation des portes qualité et cycle de déploiement — revue externe du 2026-10-17, par priorité :

| # | Action | Priorité | État |
|---|---------------|---|---|
| 1 | **CI GitHub Actions** sur push/PR `beta` et `main` : jobs `server` (typecheck + build + tests runtime) et `web` (build + tests front), badge de statut dans le README | 🔴 | ✅ livré (C-57) — `npm ci` racine + scripts par workspace, portes lint/typecheck/build/tests des deux côtés, badge README |
| 2 | **Lint et formatage automatisés** : ESLint (TS strict) + Prettier sur `server` et `web`, 4ᵉ porte qualité en CI, reformatage ponctuel en un commit dédié | 🔴 | ✅ livré (C-57) — lint vert sur `server` et `web` en CI ; Prettier configuré (`.prettierrc` racine, scripts `format`) ; reformatage ponctuel du code existant non exécuté (à faire en commit dédié si souhaité) |
| 3 | **Supply-chain** : Dependabot (ou Renovate) + porte `npm audit --omit=dev --audit-level=high` en CI ; statuer sur `--ignore-scripts` pour `npm ci` (esbuild, better-sqlite3) | 🟠 | ✅ livré (C-56 + C-57) — Dependabot actif, job `audit` en CI ; décision : **scripts d'install conservés** (better-sqlite3/esbuild en ont besoin — voir durcissement-securite.md § 5) |
| 4 | **Branche de déploiement paramétrable** : `MODOP_DEPLOY_BRANCH` (défaut `beta` rétro-compatible pour l'homelab), production sur `main` ; à terme CT de recette sur `beta` + CT de prod sur `main` | 🟠 | ✅ livré (C-57) — env > `.deploy-branch` > `beta` ; update.sh + proxmox-install.sh adaptés aux workspaces au passage ; **décision propriétaire (2026-10-18) : production maintenue sur `beta`** ; **O2 retiré (16 nov. 2026) : pas de bascule `main` programmée — uniquement à une prod réelle stable** |
| 5 | **Observabilité minimale** : supervision du healthcheck (ex. Uptime Kuma auto-hébergé sur le Proxmox) avec notification ; optionnel : endpoint `/metrics` | 🟡 | ✅ livré et **déployé** (C-62) — Uptime Kuma en production sur le Proxmox, moniteur `GET /api/health`, état visible depuis Home Assistant ; extensions possibles (non retenues pour l'instant) : moniteur push « sauvegarde/déploiement OK », expiration du certificat du tunnel, endpoint `/metrics` |
| 6 | **Sauvegardes SQLite cohérentes** : remplacer la copie de fichier par `VACUUM INTO` ou `.backup()` (better-sqlite3) dans `update.sh` ; test de restauration automatisé (`PRAGMA integrity_check`) | 🟡 | ✅ livré (C-57) — `server/scripts/backup-db.mjs` (VACUUM INTO + integrity_check de la copie, contrôle aussi après restauration/rollback), 3 tests runtime (`server/test/backup-restore.test.ts`) |
| 7 | **Porte de déploiement** : `update.sh` interroge le statut CI du SHA à déployer (check-runs via l'API GitHub) et **refuse un SHA rouge** ; override manuel explicite (`--force`) consigné dans le journal | 🔴 | ✅ livré (C-89, 15 nov. 2026) — vérifié AVANT tout arrêt : rouge / en cours / sans run / API injoignable = refus, matrice testée en réel (vert cf7858b, rouge 01756d8, --force) ; l'activation de la prod sur `main` reste une décision propriétaire |

Critères d'acceptation (issue #8) : un push cassant typecheck/build/tests refusé par le CI (✅ CI fonctionnelle) ; lint vert sur `server` et `web` (✅) ; premières PR Dependabot reçues (⏳ côté GitHub) ; déploiement de production visant `main` (`MODOP_DEPLOY_BRANCH` — clos le 16 nov. 2026 : prod durablement sur `beta`, O2 retiré ; bascule `main` uniquement à prod réelle stable) ; healthcheck supervisé avec alerte (✅ Uptime Kuma déployé, supervisé depuis Home Assistant) ; une sauvegarde restaure une base `integrity_check = ok` (✅ testé en runtime).; `update.sh` refuse de déployer un SHA dont la CI est rouge, override `--force` consigné (✅ C-89, 15 nov. 2026).

### Palette d'outils d'édition — déploiement incrémental ([spec-palette-outils.md](spec-palette-outils.md))

Architecture livrée (C-67) : **registre de commandes modulaire** (`web/src/editor/tools/` — ajouter un outil = une entrée `EDITOR_COMMANDS`) + **barre basse fixe** (flyouts, bouton parent affichant l'outil actif, actions contextuelles, raccourcis E/P/F/A/R/T/I). Backlog, par priorité :

| Priorité | Outil | Notes |
|---|---|---|
| ✅ P0 livré | Étape +, Photos (galerie/appareil), Formes (flèche/zone/texte + couleur), Indications (encarts métier), suppression contextuelle | C-67 |
| P0 | **Undo/redo global fusionné** (texte + structure + annotations) | spec § 5 — historique des commandes, la pièce maîtrante manquante |
| P1 | Texte riche par étape (gras, italique, listes, titres internes) + barre flottante desktop | décision ouverte : markdown léger vs TipTap |
| P1 | Numéros de repère sur image (callouts ①②③), ligne/chemin de geste | extensions du groupe Formes (nouvelles entrées du registre) |
| P1 | Recadrage/pivot d'image post-import | flyout Photos |
| P1 | Palette de commandes (Ctrl+K) | accès clavier à tous les outils, remplace tout panneau latéral |
| P2 | Titre de section, séparateur, note/astuce (encart info), tableau, masquage/floutage, variables dynamiques | selon besoin métier |
| **P2 — demandés (C-70)** | **Personnalisation des indications métiers** (presets éditables : migration + API paramétrage) · **Commentaires auteurs par étape** (schema + API + panneau édition) | nouveaux chantiers, contrat à faire évoluer proprement |
| P2 — demandés (C-72) | **Vidéo liée au MO** (upload/streaming serveur + lecteur dans l'étape, poster ; impact export docx et stockage CT) | média riche pour gestes complexes — gros chantier stockage |
| **P1 — demandés (C-79)** | **Templates de documents** : plusieurs types de documents au-delà des modes opératoires — **mode de réaction, tableau, enregistrements, FIT, fiches d'aspect, autres**. Chaque type a son gabarit (blocs/sections/pictos préremplis) : type de document en base, gabarit par type à la création, filtrage/regroupement de l'accueil par type, export par gabarit | gros chantier transverse : contrat figé `shared/` + éditeur + exports docx + accueil — à spécifier avant implémentation |
| À challenger | TipTap/ProseMirror comme socle document (spec § 6) | changerait le contrat figé `shared/` + export docx + rendu serveur — à décider AVANT toute adoption |

### Vague 10 — Palier sécurité entreprise (issue #9) — ⏸️ **en standby**

*Décision propriétaire (2026-10-18) : pas de besoin pour le moment — priorité au fonctionnel et au mode édition. Contenu conservé pour relance ultérieure. Rappel en attendant : l'UI de login n'a pas de champ `totp`, **`MODOP_TOTP_SECRET` reste désactivé`***

| # | Action | Priorité | État |
|---|---|---|---|
| 1 | **MFA TOTP par compte** (RF-79) : QR `otpauth://` à l'activation, code de secours à usage unique, admin obligatoire / auteur optionnel / lecteur exempt, login SSO exempt, anti-replay, révocation à la désactivation | 🔴 | partiel — porte serveur livrée (secret global `MODOP_TOTP_SECRET`, login admin uniquement, tests `server/test/mfa-totp.test.ts`) ; **l'UI de login n'envoie pas de champ `totp` : ne pas activer en production avant le front** ; reste : par compte, activation QR, code de secours, anti-replay, UI |
| 2 | **Chiffrement at-rest de la base** : SQLCipher via better-sqlite3 ou chiffrement applicatif ; clé hors base (`MODOP_DB_KEY` ou fichier monté) ; exports de sauvegarde chiffrés avec la même clé ; procédure de restauration documentée et testée | 🟠 | à faire |
| 3 | **Scan offensif externe** : OWASP ZAP (active) ou Nuclei sur l'instance de recette + checklist manuelle (upload non-image, IDOR `/api/workflows` et `/api/photos`, injection SQL dans la recherche, brute force login derrière le tunnel) ; rapport dans `docs/revue-securite-externe.md` | 🟡 | à faire |
| 4 | **PRA écrit et testé** : `docs/plan-de-reprise.md` + **exercice réel** chronométré (base + photos dans un CT vierge), corriger le doc ; lié au test de restauration de la vague 9 | ✅ | soldé — exercice 17/11 (restore scratch 250 depuis vzdump 203 : 39 s, preuves pm2/health/base/photos), PRA finalisé v1.2 le 23/11 (IDs 105→203, REX IP scratch) ; reste le cron RPO 15 min (A-BKP5, maillon fin) |

Critères d'acceptation (issue #9) : un compte admin sans code TOTP valide ne se connecte pas (replay impossible) ; la base est illisible sans la clé ; sauvegardes chiffrées et restauration testée sur CT vierge ; rapport ZAP/Nuclei archivé et constats classés ; `plan-de-reprise.md` + exercice chronométré.

### Vague 11 — Preuve de formation & habilitation — ❌ **RETIRÉE (17 nov. 2026, décision propriétaire)**

**Pas de quiz dans modop.** Si le besoin survient, la preuve de formation vivra dans une **application de formation dédiée** consommant l'API modop : exports md/json/pdf, corpus `GET /api/corpus` (ré-embedding incrémental), MCP 26 outils, tokens API publics (V13 #8, à activer à prod réelle). Cadrage complet conservé et transférable : [spec-preuve-formation.md](spec-preuve-formation.md) — modèle de données versionné par snapshot, tentatives immuables, 3 briques autonomes, angles morts déjà listés.

### Vague 12 — Corrections retour terrain : GED, docx & édition (ajoutée le 16 nov. 2026)

*Portés depuis vibe_docs « Corrections Modop » (28 oct. 2026) + demande propriétaire du 16 nov. Réordonnés par priorité ; les doublons déjà en Vague 8 sont renvoyés en fin de table.*

| # | Correction | Notes |
|---|---|---|
| 1 | **Texte des étapes en dessous des images** | ✅ livré C-93 (16 nov. 2026) — lecture, guidé, édition |
| 2 | Docx : images et formes légèrement décalées | ✅ livré C-92 + C-95 (16 nov. 2026) — annotations photo portées par le snapshot et rendues (lecture, guidé, éditeur, docx) |
| 3 | Docx : mauvaise gestion des photos et formes (position relative) | ✅ livré C-95 — dessin factorisé photo/canevas dans le composite docx |
| 4 | Docx : formes plus basses que l'image tronquées en lecture | ✅ livré C-95 — la hauteur du canevas de lecture inclut les formes |
| 5 | Remontées terrain non visibles en mode édition (indiquer que des corrections sont à faire) | ✅ livré C-96 (16 nov. 2026) — badge global + badge ⚑ par étape, lien vers la page de traitement |
| 6 | Si pas de commentaire de version, le commentaire précédent est repris | ✅ livré C-96 (16 nov. 2026) — champ vidé après chaque publication |
| 7 | Section de commentaires réservée aux auteurs en mode édition, à chaque étape | ✅ livré C-96 (16 nov. 2026) — table step_comments, composant repliable par étape, jamais publiés ; le workflow de validation reste Vague 7 #1 |
| 8 | Paramétrage des indications métiers | ✅ livré C-97 (16 nov. 2026) — liste paramétrable en page Paramètres (admin), flyout éditeur dynamique, pictos posés par l'API/MCP résolus en objets auto-porteurs |
| 9 | Pouvoir abandonner un brouillon introuvable | ✅ livré C-97 (16 nov. 2026) — POST /api/workflows/:id/reset-draft (V0 = purge complète, publié = retour à Vn) ; pictos/canvas corrompus ne 500 plus |
| 10 | Nouvelle image par drag & drop ou presse-papier | repris en Vague 8 #1 |
| 11 | Arborescence documentaire paramétrable | ✅ livré C-94 (16 nov. 2026) — voir Vague 13 #1 |
| 12 | Gestion de documents parents | ✅ livré C-94 (16 nov. 2026) — parent affiché au lecteur + « Documents liés » |

### Vague 13 — API publique, exports multi-formats & accès IA (proposition — ajoutée le 16 nov. 2026)

*Spécification complète : [spec-api-ia.md](spec-api-ia.md) — arborescence, étape = chunk + ancre profonde, corpus + manifest (ré-embedding incrémental), tokens API à périmètre. La MCP (C-90) est la vitrine IA ; la REST publique sera la vitrine GMAO/intégrateurs. Chaque brique est autonome et livrable indépendamment.*

| # | Fonctionnalité | Notes |
|---|---|---|
| 1 | **Arborescence documentaire** Famille > Sous-famille > Type | ✅ livré C-94 + C-98 (16 nov. 2026) : catégories imbriquées 1 à X niveaux (titres renommables, slug immuable), rattachement MO, filtre par sous-arbre, page admin `/categories` ; chemins `category_path` exposés en API (workflow, liste, catégories) — calcul à la volée, jamais stockés |
| 2 | **Export Markdown** (`?format=md`) | ✅ livré C-98 (16 nov. 2026) — YAML front matter + étapes + ancres `MO-xxx/etapes/n` + descriptions des photos |
| 3 | **Export JSON canonique** (`?format=json`) | ✅ livré C-98 (16 nov. 2026) — snapshot exact + bloc meta (GED, chemin, ancres) — zéro perte |
| 4 | **Export PDF** (`?format=pdf`) | ✅ livré C-106 (17 nov. 2026) : rendu structuré pdf-lib (page de garde GED + étapes + composite photo+formes du docx, pagination) — pas de headless Chrome en CT |
| 5 | **Description détaillée des images** | ✅ livré C-98 (16 nov. 2026) — champ `image_description` (upload, `PUT /api/photos/:id/meta`, MCP) ; warning non bloquant à la publication + panneau d'édition dans l'éditeur ; C-99 : renommé `image_description`, vignettes cliquables par étape |
| 6 | **Outils MCP lecture IA** | ✅ livré C-105 (17 nov. 2026) : `get_workflow_markdown` (markdown brut, économie de tokens) + `export_corpus` (zip base64) — 26 outils |
| 7 | **Corpus + manifest** | ✅ livré C-104 (17 nov. 2026) : `GET /api/corpus?since=` zip md+json + manifest (checksums sha256, chemins, versions) — ré-embedding incrémental, aucune base vectorielle dans modop v1 |
| 8 | **Tokens API publics à périmètre** | read-only par défaut, rate limit, ETag — pattern `svc-mcp` ; activation seulement à prod réelle stable (O2 retiré) |

### Conformité & traçabilité contractuelle (ajouté le 26 oct. 2026)

- [ ] **Suivi des versions des CGV (art. 19) + liaison licence ↔ version** : si Modop est un jour distribué commercialement (via Néliora), chaque révision des CGV doit être versionnée, datée et archivée, et chaque licence/contrat enregistré avec **la version des CGV acceptée + la date de licence** — même mécanique que meal_plan. En interne dès maintenant : versionner les documents contractuels associés aux déploiements clients (conditions d'accès, charte) et conserver la date d'acceptation.
- [ ] **Suspension / réactivation d'une licence ou d'un accès** : action admin (raison tracée, date) — cas d'usage : litige, départ d'un opérateur, incident de sécurité, test ; l'accès suspendu est bloqué sans suppression des données ; toute suspension/réactivation consignée dans le journal d'audit existant. Ajouté le 26 oct. 2026.

### Vision long terme

- Multi-langue (interface + contenus)
- API publique (intégrations GMAO) — **premier pas livré (C-90)** : serveur MCP natif sur `/mcp`, 24 outils, doc `docs/connecteur-mcp.md` ; **plan complet : Vague 13 + [spec-api-ia.md](spec-api-ia.md)**
- Statistiques d'usage fines par MO

## 🧭 Principes de développement

Vagues IA supervisées : contrat figé avant chaque vague, missions bornées, portes qualité (typecheck + build + tests d'exécution réels), fusion séquentielle sur `beta`, validation humaine sur le CT — voir [processus-vagues.md](processus-vagues.md).
