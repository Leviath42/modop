# Modop — Roadmap

*Dernière mise à jour : après C-88 — **cycle de retour terrain clos (C-70 → C-80, fusionné sur main) + correctifs GED/lecture C-81 → C-88** : export en entête du lecteur, fidélité du composite docx, alerte « à revoir » expliquée avec lien, date de revue/responsable portés par les versions publiées, recherche de responsable accessible aux auteurs, délai de revue par défaut paramétrable (30 j), champs date/responsable robustes dès la création, numéro unique vérifié en direct (casse ignorée) + Familles en liste de recherche. **Backlog prioritaire** : undo/redo global, **templates de documents** (mode de réaction, tableau, enregistrements, FIT, fiches d'aspect), vidéo liée au MO, texte riche. Vague 10 (sécurité) en standby. Vague 9 terminée code + ops ; production sur `beta`. **Ajout (26 oct. 2026) : vague 11 « preuve de formation » (quiz de compréhension pré/post) proposée — voir § Vague 11.*** **Ajout (26 oct. 2026) : § Conformité & traçabilité contractuelle — suivi des versions des CGV (art. 19) + liaison licence ↔ version.** **Porte de déploiement (26 oct. 2026)** ajoutée en Vague 9 #7 : `update.sh` devra refuser un SHA dont la CI est rouge — constat : un déploiement a eu lieu alors que la CI était rouge (échec audit undici).***

L'historique complet des vagues livrées (v0 → v6bis) est archivé dans [archives/roadmap-v1-a-v6bis.md](archives/roadmap-v1-a-v6bis.md). La série de correctifs UI/UX (C-01 → C-88) est journalisée dans [correctifs.md](correctifs.md).

## ✅ Implémenté (v0 → v6bis + correctifs C-01..C-88)

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
| 7 | **Porte de déploiement** : `update.sh` interroge le statut CI du SHA à déployer (check-runs via l'API GitHub) et **refuse un SHA rouge** ; override manuel explicite (`--force`) consigné dans le journal | 🔴 | 🟠 à faire — proposé le 26 oct. 2026 ; constat : un déploiement a eu lieu alors que la CI était rouge (échec job audit undici, découvert 2 j après — runs 40117974090 / 40279284449) |

Critères d'acceptation (issue #8) : un push cassant typecheck/build/tests refusé par le CI (✅ CI fonctionnelle) ; lint vert sur `server` et `web` (✅) ; premières PR Dependabot reçues (⏳ côté GitHub) ; déploiement de production visant `main` (✅ `MODOP_DEPLOY_BRANCH` — ⏳ activation différée : production maintenue sur `beta`, décision propriétaire) ; healthcheck supervisé avec alerte (✅ Uptime Kuma déployé, supervisé depuis Home Assistant) ; une sauvegarde restaure une base `integrity_check = ok` (✅ testé en runtime).; `update.sh` refuse de déployer un SHA dont la CI est rouge, override `--force` consigné (⏳ Vague 9 #7).

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
| 4 | **PRA écrit et testé** : `docs/plan-de-reprise.md` + **exercice réel** chronométré (base + photos dans un CT vierge), corriger le doc ; lié au test de restauration de la vague 9 | 🟡 | partiel — brouillon du document présent ; exercice de restauration à faire |

Critères d'acceptation (issue #9) : un compte admin sans code TOTP valide ne se connecte pas (replay impossible) ; la base est illisible sans la clé ; sauvegardes chiffrées et restauration testée sur CT vierge ; rapport ZAP/Nuclei archivé et constats classés ; `plan-de-reprise.md` + exercice chronométré.

### Vague 11 — Preuve de formation & habilitation (proposition — ajoutée le 26 oct. 2026)

*Origine : pattern pédagogique « pré-quiz → contenu → knowledge checks → post-quiz » observé dans [microsoft/Web-Dev-For-Beginners](https://github.com/microsoft/Web-Dev-For-Beginners) lors d'une analyse du top 200 GitHub (26 oct. 2026). Objectif : faire passer Modop de la **consultation** de MO à la **preuve de formation** — argument habilitation / ISO 9001, et mesure concrète pour le dossier de création de poste (taux de réussite, temps d'habilitation). Réutilise l'existant : rôles, stats admin, journal d'audit, snapshot versionné. À spécifier avant implémentation (contrat figé `shared/`).*

| # | Fonctionnalité | Pistes |
|---|---------------|-------|
| 1 | **Quiz de prérequis (pré-lecture)** | questions rattachées au MO, **versionnées avec le snapshot** à la publication (Vn immuable = quiz immuable) ; optionnel par MO |
| 2 | **Quiz de compréhension (post-lecture)** | global ou par étape, correction immédiate, seuil de réussite paramétrable ; une nouvelle version publiée impose de re-valider l'acquis |
| 3 | **Traçabilité & audit** | tentatives (utilisateur, date, score, version du MO) en SQLite, jamais modifiables côté lecteur ; export admin pour audit habilitation |
| 4 | **Stats admin** | taux de réussite par MO / par opérateur / par version, temps d'habilitation — alimente le tableau de bord existant |
| 5 | **Rédaction des questions** | côté éditeur (author), par étape ou par MO ; anti-triche minimal : ordre aléatoire, tentatives limitées par défaut |

Critères d'acceptation (à affiner) : un MO avec quiz actif conserve les scores par version ; une tentative enregistrée n'est jamais modifiable côté lecteur ; l'admin peut exporter l'historique des tentatives par opérateur ; la publication d'une nouvelle version réinitialise l'acquis à re-valider.

### Conformité & traçabilité contractuelle (ajouté le 26 oct. 2026)

- [ ] **Suivi des versions des CGV (art. 19) + liaison licence ↔ version** : si Modop est un jour distribué commercialement (via Néliora), chaque révision des CGV doit être versionnée, datée et archivée, et chaque licence/contrat enregistré avec **la version des CGV acceptée + la date de licence** — même mécanique que meal_plan. En interne dès maintenant : versionner les documents contractuels associés aux déploiements clients (conditions d'accès, charte) et conserver la date d'acceptation.

### Vision long terme

- Multi-langue (interface + contenus)
- API publique (intégrations GMAO)
- Statistiques d'usage fines par MO

## 🧭 Principes de développement

Vagues IA supervisées : contrat figé avant chaque vague, missions bornées, portes qualité (typecheck + build + tests d'exécution réels), fusion séquentielle sur `beta`, validation humaine sur le CT — voir [processus-vagues.md](processus-vagues.md).
