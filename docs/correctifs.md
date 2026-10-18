# Modop — Journal des correctifs UI/UX (série post-audit)

Série de petits correctifs UI/UX appliqués un par un sur beta.
Chaque entrée : problème constaté → correctif → fichiers touchés → état.

*Les correctifs listés ici sont retirés de la roadmap (vague 6 livrée) : ce journal trace la série en cours.*

> **Agents IA** : ce journal dépasse 800 lignes — **ne pas le lire en entier**. Chercher la zone visée par mot-clé (`grep -n "<mot-clé>" docs/correctifs.md`) et lire seulement l'entrée correspondante. Routage complet : [AGENTS.md](../AGENTS.md).

---

## C-38 — Canevas : un clic sur une flèche la déplaçait (réalisé)

**Problème** : cliquer/taper sur une forme déjà posée (flèche, zone) la déplaçait d'environ 1 cm dans la direction du geste. Cause : le drag des formes démarrait au `pointerdown` **sans seuil de tolérance** — au tactile, le micro-glissement naturel du doigt pendant un tap (quelques px) était traité comme un déplacement, et la forme suivait.

**Correctif** : **hystérésis de 6 px** — le déplacement d'une forme (ou photo) ne s'engage qu'après ~6 px de trajet réel depuis le point de départ ; en dessous, c'est un clic : la sélection s'applique mais rien ne bouge, et aucune sauvegarde inutile n'est envoyée (le `PUT canvas`/layout n'est émis que si un vrai déplacement a eu lieu).

**Test** : scénario C-38 dans `step-canvas-adaptive.test.ts` — tap sur le centre d'une flèche avec micro-glissement de 3 px : aucun `PUT /canvas` émis, la flèche ne bouge pas.

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/lib/step-canvas-adaptive.test.ts`

## C-45 — Comptes : Prénom/Nom + responsable à sélectionner + garde-fou à revoir (réalisé)

**Problème** : les comptes n'étaient qu'un email ; le « Responsable » d'un MO se tapait à la main sans lien avec les comptes ; et rien ne se passait quand le compte responsable disparaissait.

**Correctif** :
1. **Prénom/Nom sur les comptes** : colonnes `first_name`/`last_name` (migration idempotente), champs à la création et à l'édition dans la page Comptes (admin), affichage « Prénom Nom (email) ». Le login et `/api/auth/me` renvoient les deux champs ; le SSO OIDC les remplit depuis `given_name`/`family_name`.
2. **Responsable à sélectionner** : dans les détails d'un MO, le champ Responsable devient un **input avec recherche** (`datalist`) listant les **comptes actifs** — saisir quelques lettres filtre, choisir pose l'email. Plus de saisie manuelle aveugle.
3. **Garde-fou à la désactivation** : désactiver le compte responsable marque automatiquement **À REVOIR** tous ses MO sans date de revue (`review_due` = aujourd'hui), tracé dans le journal d'audit (`flag_review_no_owner`). Les MO concernés remontent dans le filtre « À revoir » pour réattribution.

**Test** : `security.test.ts` (C-45) — création avec prénom/nom, login les renvoie, MO avec responsable, désactivation → `review_due` posé + action tracée dans l'audit.

**Fichiers** : `server/src/db/schema.ts`, `server/src/auth/sessions.ts`, `server/src/routes/auth.ts`, `server/src/routes/admin.ts`, `web/src/api.ts`, `web/src/pages/admin.tsx`, `web/src/pages/editor.tsx`, `server/test/security.test.ts`

**État** : ✅ livré sur beta — 107/107 tests serveur, tsc + build + tous tests front verts.

---

## C-57 — Vague 9 (fin) : CI fonctionnelle, lint web, audit, sauvegardes VACUUM INTO, branche de déploiement (réalisé)

**Problème** : la CI livrée en C-56 était un brouillon non fonctionnel (jobs joués à la racine d'un monorepo workspaces, `npm run typecheck` inexistant côté serveur) ; `update.sh` restait cassé par la migration workspaces de C-56 (`npm ci` et lockfile cherchés dans `server/` et `web/`) ; la sauvegarde de la base copiait brutalement `.db` + `-wal` + `-shm` (image possiblement incohérente, résidus à gérer au rollback) ; pas de lint web, pas de porte `npm audit`, branche de déploiement en dur ; `test-ci-cd.sh` (test volontairement cassant poussé sur beta) traîné dans le dépôt.

**Correctif** :
1. **CI** (`.github/workflows/ci-cd.yml` réécrit) : `npm ci` unique à la racine puis scripts par workspace (`-w server` / `-w web`), portes **lint + typecheck + build + tests** des deux côtés, job **audit** (`npm audit --omit=dev --audit-level=high`), déclenché sur push et PR `beta`/`main`, badge README.
2. **Lint/format** : `web/eslint.config.js` (typescript-eslint `recommended`, `no-unused-vars` avec convention `_`), scripts `lint`/`typecheck` côté web et `typecheck`/`format` côté serveur, Prettier configuré à la racine (`.prettierrc` + `.prettierignore`, style du code existant) — lint vert sur `server` et `web` (24 erreurs web corrigées : code mort, imports/variables inutilisés, deux `eslint-disable react-hooks` sans plugin correspondant).
3. **Sauvegardes cohérentes** : `server/scripts/backup-db.mjs` — `VACUUM INTO` (snapshot en un seul fichier, WAL inclus, écriture impossible sur une sauvegarde existante) **+ `PRAGMA integrity_check`** de la copie ; `update.sh` sauvegarde, vérifie, et vérifie aussi la base **après restauration** (rollback) ; plus de `-wal`/`-shm` à recopier.
4. **update.sh adapté aux workspaces** : `npm ci` à la racine (lockfile racine, garde-fou `better-sqlite3` résolu depuis la racine), plus de référence aux lockfiles supprimés ; idem `scripts/proxmox-install.sh`.
5. **Branche de déploiement paramétrable** : `MODOP_DEPLOY_BRANCH` (env) > fichier `.deploy-branch` > `beta` par défaut — la production peut viser `main` sans toucher au script.
6. **Nettoyages** : `test-ci-cd.sh` supprimé (il cassait volontairement le build et poussait sur beta), `jest`/`@types/jest` retirés du package.json racine (jamais utilisés — tests `node:test`), résidus non suivis retirés (`.github/eslintrc.json`, `.github/prettierrc`, `server/src/db/index.ts`), `.vscode/` ignoré.

**Tests** : `server/test/backup-restore.test.ts` (3 tests runtime, vraie base better-sqlite3 : snapshot VACUUM INTO avec écritures WAL non checkpointées → restauration → `integrity_check` ok + données intactes ; refus d'écraser une sauvegarde ; détection d'une base corrompue) — suite serveur 117/117, lint vert server + web, build tsc + vite OK.

**Fichiers** : `.github/workflows/ci-cd.yml`, `README.md`, `package.json` + `package-lock.json`, `.prettierrc` + `.prettierignore` (nouveaux), `.gitignore`, `web/eslint.config.js` (nouveau), `web/package.json`, `server/package.json`, `server/scripts/backup-db.mjs` (nouveau), `server/test/backup-restore.test.ts` (nouveau), `update.sh`, `scripts/proxmox-install.sh`, `web/src/step-canvas.tsx`, `web/src/pages/{editor,list,deploy}.tsx`, `web/src/lib/*.test.*` (suppressions de code mort), `test-ci-cd.sh` (supprimé), `docs/{guide-test-proxmox,roadmap,durcissement-securite}.md`

**État** : livré sur beta.

---

## C-56 — MFA TOTP admin (serveur) + outillage : workspaces npm, ESLint, CI, PRA (réalisé)

**Problème** : issues #8 et #9 — aucun second facteur sur le login admin (auth maison), portes qualité purement manuelles (aucun CI), pas de lint automatisé, PRA non documentée.

**Correctif** :
1. **MFA TOTP (RF-79, transitoire)** : `server/src/auth/totp.ts` (lib `otpauth`) — quand `MODOP_TOTP_SECRET` est posé, le login local des comptes **admin** exige un code TOTP valide ; vérifié **après** le mot de passe, échecs tracés dans l'audit (`login_mfa_echec`), couvert par le rate-limit login ; lecteurs et SSO exemptés. Version par compte (QR, code de secours, anti-replay) + UI : vague 10.
2. **Outillage** : migration **npm workspaces** (package.json racine, lockfile racine unique — `server/package-lock.json` retiré) ; ESLint (`eslint.config.js`, script `lint`) + Prettier côté serveur ; `tsconfig.test.json` pour le typecheck des tests.
3. **CI / supply-chain** : `.github/workflows/ci-cd.yml` (jobs server/web sur push `beta`/`main`) — **brouillon non fonctionnel** (pas de `working-directory`, scripts appelés inexistants à la racine), correction tracée en vague 9 (issue #8) ; **Dependabot** configuré (`.github/dependabot.yml`, mises à jour npm quotidiennes).
4. **PRA** : `docs/plan-de-reprise.md` (brouillon ; l'exercice chronométré reste à faire — vague 10, issue #9).
5. Nettoyages : `deployRouter()` / `staticPhotos()` n'exigent plus le `db`, code mort et variables inutiles retirés, `photosDir()` résolu à chaque appel.

**Tests** : `server/test/mfa-totp.test.ts` (7 tests runtime : MFA active, code valide/invalide, login admin sans code / mauvais code / bon code, lecteur sans TOTP) — suite serveur 111/111, build tsc OK, build + tests front OK.

**Fichiers** : `server/src/auth/totp.ts` (nouveau), `server/src/routes/auth.ts`, `server/src/app.ts`, `server/src/routes/{deploy,export,photos}.ts`, `server/test/*` (mfa-totp nouveau + nettoyages), `server/package.json`, `package.json` + `package-lock.json` (racine, workspaces), `server/eslint.config.js` (nouveau), `server/tsconfig.test.json` (nouveau), `.github/workflows/ci-cd.yml` + `.github/dependabot.yml` (nouveaux), `docs/plan-de-reprise.md` (nouveau), `test-ci-cd.sh`

**État** : livré sur beta.

---

## C-55 — Doc optimisée pour sessions IA : AGENTS.md, routage documentaire, journal consulté par mot-clé (réalisé)

**Problème** : une nouvelle session IA devait enchaîner README (section agents verbeuse), cahier des charges, roadmap et journal des correctifs (~800 lignes) pour se situer — orientation lente et coût en tokens élevé. Le projet meal_plan démontre l'approche inverse : un point d'entrée unique dense (stack, arborescence annotée, conventions) et des pointeurs vers les docs détaillées.

**Correctif** :
1. **`AGENTS.md` à la racine** (nouveau) : contexte complet compressé — pitch, stack, commandes, arborescence annotée (routes, auth, pages, tests), conventions, env de durcissement, **routage documentaire par zone** (« pour toucher X → lire Y »), travaux en cours. Lu automatiquement par la plupart des agents IA.
2. **README allégé** : la section « Pour les agents IA » devient un pointeur vers `AGENTS.md` (une seule source de vérité).
3. **Note en tête de ce journal** : consultation par `grep` sur mot-clé, jamais une lecture intégrale.

**Fichiers** : `AGENTS.md` (nouveau), `README.md`, `docs/correctifs.md`

**État** : livré sur beta. La livraison du code MFA/CI en cours prendra le numéro **C-56**.

---

## C-54 — Plan d'action issues #8/#9 intégré : vagues 9-10, RF-79, MODOP_TOTP_SECRET documenté (réalisé)

**Problème** : les revues externes du 2026-10-17 (issues #8 et #9 — durcissement industriel, palier sécurité entreprise) n'étaient tracées dans aucune documentation ; la MFA TOTP partiellement implémentée n'était documentée ni dans le guide de durcissement ni dans la spécification (aucun RF), et rien n'indiquait que l'UI de login ne sait pas encore saisir de code TOTP (activation du secret = admins bloqués hors de l'interface).

**Correctif** : vagues **9** (CI GitHub Actions, lint/formatage, supply-chain, branche de déploiement paramétrable, observabilité, sauvegardes SQLite cohérentes) et **10** (MFA par compte, chiffrement at-rest, scan externe, PRA testé) ajoutées à la roadmap avec priorités, états constatés et critères d'acceptation des issues ; **RF-79** (MFA TOTP) ajouté au cahier des charges ; `MODOP_TOTP_SECRET` documenté dans le guide de durcissement avec son statut transitoire et l'avertissement UI ; README aligné (plage de correctifs, vagues restantes).

**Fichiers** : `docs/roadmap.md`, `docs/cahier-des-charges.md`, `docs/durcissement-securite.md`, `docs/correctifs.md`, `README.md`

**État** : livré sur beta (documentation seule). La livraison du code MFA/CI en cours dans l'arbre de travail prendra le numéro **C-56** (avec son entrée et ses tests, conformément aux conventions).

---

## C-53 — Guide utilisateur réécrit (réalisé)

**Problème** : le guide n'était plus à jour — structure cassée par les ajouts successifs (des paragraphes d'édition/lecture mélangés dans « Canevas d'étape », doublons C-41, la section « Header d'édition » décrivait l'ancien bouton « + » remplacé par la barre permanente C-49/50/51), et il manquait : lecture guidée, QR, versions avec changelog, signalements côté lecteur, filtre/statut « à revoir », responsable, stats, journal d'audit, changement de mot de passe.

**Correctif** : guide **réécrit entièrement**, structuré par parcours : Accueil → Connexion (+ changement de mot de passe) → **Consulter** (liste, lecture : sélecteur ▶, versions/changelog, lightbox, signalement, Guidé, QR, hors-ligne, page ⚑ Terrain) → **Créer** (bandeau vs barre d'outils sticky, étape active dynamique, étapes, photos galerie/appareil, annotations avec texte sur place et corbeille, indications, publication avec changelog, revue/responsable, suppression admin) → **Administrer** (comptes avec Prénom/Nom et modale, stats avec audit, déploiement) → Dépannage. Toutes les entrées correspondent à l'état C-51 du code.

**Fichiers** : `docs/guide-utilisateur.md`

**État** : ✅ livré sur beta.

---

## C-52 — Documentation restructurée : archive des vagues, roadmap courte, README agents (réalisé)

**Problème** : la documentation s'était empilée — la roadmap contenait tout l'historique des vagues (221 lignes), le README mélangeait marketing et technique, et rien n'était optimisé pour un agent IA qui reprend le projet (perte de contexte à chaque session).

**Correctif** :
1. **`docs/archives/`** : l'ancienne roadmap (v0→v6bis, tableaux d'audit inclus) et la revue de cahier des charges y sont archivées — l'historique complet reste consultable mais hors du chemin principal.
2. **`docs/roadmap.md` (nouvelle, courte)** : ce qui est **implémenté** (v0→v6bis + C-01→C-51, résumé par domaine) et ce qui **reste** (vague 7 : workflow validation, comparaison versions, SSO réel, PWA cache ; vague 8 : arborescence, menu, drag&drop, parents, statut éditorial).
3. **`README.md` simplifié** : « Ce que ça fait » (humains), installation, table des docs, dev — plus une section **« Pour les agents IA »** : branche de travail (`beta`), stack, structure, conventions (C-xx, portes qualité, tests runtime obligatoires, piège du formatage compacté), variables d'env, et où lire l'historique avant de retravailler une zone.
4. **`docs/cahier-des-charges.md` v1.5** : statut mis à jour (v0→v6bis + C-01→C-51), chaque RF marqué *implémenté* (RF-13, 16, 31, 75 avec détails) ou *restant* (RF-62/63/64/66 vague 8, RF-67/76 partiels), état du lot 1 (✅ atteint).

**Fichiers** : `README.md`, `docs/roadmap.md`, `docs/cahier-des-charges.md`, `docs/archives/` (roadmap + revue déplacées)

**État** : ✅ livré sur beta.

---

## C-51 — Barre d'outils : sticky sous le bandeau (réalisé)

**Problème** : C-50 avait sorti la barre du bandeau, mais elle restait en haut de page — au défilement, les outils disparaissaient : inutilisables sur un MO long.

**Correctif** : la barre devient **sticky** et se colle **juste sous le bandeau** qui est lui-même sticky sous la nav — les trois niveaux (nav → bandeau léger → barre d'outils) restent visibles en permanence pendant le défilement. La hauteur du bandeau est publiée en variable CSS (`--bandeau-h`, même mécanique que `--nav-h` via ResizeObserver) pour que la barre s'accroche à la bonne position quelle que soit la hauteur du bandeau (détails repliés/dépliés). `zIndex` 25 — sous le bandeau (30), au-dessus du contenu ; fond opaque, bord et ombre pour rester lisible par-dessus les étapes.

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build verts (pas de test supplémentaire, sur demande).

---

## C-50 — Barre d'outils : sortie du bandeau, rangée indépendante + labels (réalisé)

**Problème** : après C-49, la barre vivait DANS le bandeau sticky — l'ensemble (titre, Publier, replier, sélecteur d'étape, + 12 boutons d'outils) formait une masse compacte illisible, et le header n'était « plus du tout compréhensible ».

**Correctif** :
1. **Le bandeau redevient léger** : titre + Enregistrement…, Détails, Publier, replier, sélecteur d'étape active. Rien d'autre.
2. **La barre d'outils est une rangée indépendante juste sous le bandeau** (carte surface avec bordure, comme le reste de la page) — groupes conservés : Étape | Insertion | Indications | Actions.
3. **Labels sur les boutons** : Photos, Flèche, Zone, Texte, Couleur, Indications portent leur nom en toutes lettres à côté de l'icône (0.75 rem) — plus besoin de survoler pour comprendre. Compteur conservé sur Indications.
4. Popovers inchangés (galerie/appareil, couleurs, pictos) ; fermetures Échap/clic extérieur conservées.

**Tests** : `header-tools` (barre + labels + popover couleurs), `empty-tools`, `photo-source` — tous passent sans modification supplémentaire ; 107/107 serveur.

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front + 107/107 tests serveur verts.

---

## C-49 — Palette d'édition refondue : barre d'outils permanente (réalisé)

**Problème** : la palette exigeait un clic sur « Outils » pour apparaître, s'étalait en une rangée dense sans hiérarchie (photos, 3 formes, 4 pastilles couleur, pictos, suppressions tout au même niveau), et disparaissait à chaque erreur de manipulation.

**Refonte (inspiration Figma / Google Docs / Procreate)** :
1. **Barre permanente** : plus de bouton « Outils » — la barre est visible en permanence sous le bandeau (une ligne, wrap sur mobile), tous les outils à un clic.
2. **Groupes sémantiques** séparés par des séparateurs fins : **Étape** (+ étape) | **Insertion** (photos, flèche, zone, texte, couleur) | **Indications** (pictos) | **Actions** (suppression étape, objets sélectionnés — en rouge, uniquement contextuelles).
3. **Couleur compacte** : les 4 pastilles ne sont plus étalées — un bouton pastille affiche la **couleur courante**, le clic ouvre un popover de choix (fermeture Échap/clic extérieur). Un seul bouton au lieu de quatre.
4. État actif marqué (fond accent) sur l'outil et le picto en cours ; les menus contextuels (photos galerie/appareil, pictos, couleurs) restent des popovers.

**Tests** : `header-tools` réécrit (barre visible sans clic, bouton Outils disparu, groupes présents, 4 couleurs dans le popover) ; `empty-tools` (+ étape visible sans clic sur un MO vide) ; `photo-source` (menu Photos accessible directement).

**Fichiers** : `web/src/pages/editor.tsx`, `web/src/lib/header-tools.test.ts`, `web/src/lib/empty-tools.test.tsx`, `web/src/lib/photo-source.test.ts`

**État** : ✅ livré sur beta — 107/107 tests serveur, tsc + build + tous tests front verts.

---

## C-48 — Comptes : bug « sans nom » persistant + fenêtre d'édition complète (réalisé)

**Problème** : 1) après validation de l'édition, le compte restait « sans nom » ; 2) l'édition inline (C-47) était jugée peu pratique.

**Cause du bug (racine, prouvée en runtime)** : le `GET /api/admin/users` **omettait** `first_name`/`last_name` dans son SELECT — le PUT écrivait correctement, mais le refresh de la liste renvoyait les comptes sans les noms, et l'affichage retombait sur « (sans nom) ». Corrigé : le SELECT du listing renvoie désormais les deux colonnes (prouvé : PUT Jean/Moulin → GET renvoie Jean/Moulin).

**Correctif** : l'édition inline est remplacée par une **fenêtre (modale) d'édition complète du compte** : Prénom, Nom, **Rôle** et **Compte actif** pré-remplis — Enregistrer envoie le PUT complet et rafraîchit ; protections conservées (pas d'auto-rétrogradation/désactivation de soi-même, garde-fou « à revoir » à la désactivation C-45) ; fermeture par Annuler, clic sur le fond ou Échap.

**Test** : `admin-name-edit.test.ts` réécrit — modale ouverte avec les 4 champs pré-remplis, PUT complet (noms + rôle + actif) vers le bon compte, modale fermée après enregistrement ; serveur : le GET renvoie les noms (scénario runtime C-45 étendu implicitement par la correction, 107/107).

**Fichiers** : `server/src/routes/admin.ts` (SELECT du listing corrigé), `web/src/pages/admin.tsx` (modale), `web/src/lib/admin-name-edit.test.ts`

**État** : ✅ livré sur beta — 107/107 tests serveur, tsc + build + tous tests front verts.

---

## C-47 — Comptes existants : édition inline du Prénom/Nom (réalisé)

**Problème** : les comptes créés avant C-45 n'ont pas de prénom/nom, et la page Comptes n'offrait pas de moyen de les renseigner (seule la création portait les champs).

**Correctif** : **édition inline** dans la liste des comptes — un bouton **✎** à côté de chaque nom ouvre deux champs Prénom/Nom (pré-remplis) avec **✓** (Valider) et Annuler ; la validation envoie le `PUT` admin (`first_name`/`last_name`) et rafraîchit la liste. Les comptes sans nom affichent « (sans nom) » pour signifier le champ à compléter.

**Test** : `admin-name-edit.test.ts` — compte sans nom rendu, bouton ✎ présent, champs ouverts en édition, saisie conservée, PUT émis vers le bon compte avec `first_name`/`last_name`.

**Fichiers** : `web/src/pages/admin.tsx`, `web/src/lib/admin-name-edit.test.ts`

**État** : ✅ livré sur beta — 107/107 tests serveur, tsc + build + tous tests front verts.

---

## C-46 — Suppression d'un MO : case décochée par défaut + admins uniquement (réalisé)

**Problème** : à la dernière étape de confirmation de suppression, la case « Je comprends… » arrivait **cochée** (le même état servait de flag d'étape et de case), et tout auteur pouvait supprimer définitivement un MO.

**Correctif** :
1. **Case décochée par défaut** : l'état d'étape et la case sont désormais séparés (`deleteAck`) — à l'étape finale, la case est **décochée** et le bouton « Supprimer définitivement » **désactivé** jusqu'à cochetée explicite. Annuler réinitialise tout.
2. **Admins uniquement** : côté serveur, `DELETE /api/workflows/:id` passe de `requireAuth("author")` à **`requireAuth("admin")`** — la destruction irréversible (cascade étapes/photos/versions) est une opération de gestion. Côté front, la section de suppression n'est **visible que des admins**.

**Tests** : serveur — l'auteur reçoit **403**, l'admin supprime (cascade prouvée) dans `workflows.test.ts` et `features.test.ts` ; front — `delete-guard.test.ts` : section invisible d'un non-admin, visible d'un admin, case décochée, bouton désactivé.

**Fichiers** : `server/src/routes/workflows.ts`, `web/src/pages/editor.tsx`, `server/test/workflows.test.ts`, `server/test/features.test.ts`, `web/src/lib/delete-guard.test.ts`

**État** : ✅ livré sur beta — 106/106 tests serveur, tsc + build + tous tests front verts.

---

## C-44 — Accueil : groupes Publié/Brouillon et familles repliables (réalisé)

**Problème** : le regroupement C-43 affichait tout déplié — pas moyen de rabattre un état ou une famille pour focaliser la liste.

**Correctif** : les en-têtes **« Publié »/« Brouillon »** et chaque **famille** sont des boutons de repli (chevron ▸ pivotant, compteur toujours visible, `aria-expanded`). Replier un état masque toutes ses familles et cartes ; replier une famille masque ses cartes (l'en-tête et le compteur restent). **Persistance localStorage** (`modop-collapsed-groups`) : les replis survivent aux rechargements et navigations.

**Test** : `list-groups.test.ts` étendu — replier « Publié » masque ses MO et garde le brouillon visible, le repli est persisté (`state:published` dans localStorage), déplier remonte les cartes ; replier la famille « Mécanique » masque ses MO sans toucher aux autres familles, en-tête et compteur conservés.

**Fichiers** : `web/src/pages/list.tsx`, `web/src/lib/list-groups.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front + 106/106 tests serveur verts.

---

## C-43 — Accueil : MO regroupés par état puis famille (réalisé)

**Problème** : la liste d'accueil était plate — publiés et brouillons mélangés, familles dispersées.

**Correctif** : la liste regroupe désormais les MO par **état** (« Publié » en tête, avec compteur ; « Brouillon » ensuite) puis par **famille** (tri alphabétique, « Sans famille » pour les MO sans famille renseignée). Chaque groupe : en-tête d'état avec compteur-badge, nom de famille, cartes compactes inchangées (titre, référence, ✎). Les filtres et le tri existants continuent de s'appliquer avant le regroupement.

**Test** : `web/src/lib/list-groups.test.ts` — 4 MO (brouillon méca, publié élec, publié méca, publié sans famille) : en-têtes Publié AVANT Brouillon, familles dans l'ordre attendu (Électrique, Mécanique, Sans famille, puis Mécanique en brouillon), sections peuplées correctement.

**Fichiers** : `web/src/pages/list.tsx`, `web/src/lib/list-groups.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front (dont le nouveau) + 106/106 tests serveur verts.

---

## C-42 — Photos : galerie OU appareil photo au choix + bandeau d'action (réalisé)

**Problème** : le bouton Photos n'offrait que le sélecteur de fichiers unique — sur mobile, pas de choix direct entre la galerie et l'appareil photo (l'OS propose parfois les deux, pas toujours) ; et le bandeau « cette étape n'a pas de photo » était un simple texte sans action.

**Correctif** :
1. Le bouton **Photos** de la palette ouvre un menu deux choix : **« 🖼 Depuis la galerie »** (sélecteur de fichiers, multi-sélection) et **« 📷 Prendre une photo »** (input `capture="environment"` — **capture natif du navigateur**, ouvre directement l'appareil photo sur mobile, l'explorateur de fichiers sur desktop — sans couche supplémentaire, comme n'importe quelle application).
2. Le bandeau **« Cette étape n'a pas de photo »** porte désormais les deux **boutons d'action directs** (Galerie / Prendre une photo) — plus besoin d'ouvrir la palette pour ajouter la première photo d'une étape.
3. Fermeture du menu au clic extérieur/Échap, même ergonomie que les autres menus ; l'étape ciblée reste l'étape active (C-41).

**Test** : `web/src/lib/photo-source.test.ts` — menu avec les deux options, input `capture="environment"` présent, input galerie `multiple` intact, boutons du bandeau branchés (clic sur « Prendre une photo » → input capture déclenché, prouvé par interception).

**Fichiers** : `web/src/pages/editor.tsx`, `web/src/lib/photo-source.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front (dont le nouveau) + 106/106 tests serveur verts.

---

## C-41 — Étape active dynamique + saisie du texte sur place (réalisé)

**Problème** : l'étape active du sélecteur ne changeait que si on la choisissait explicitement ou cliquait son titre — éditer une autre étape (poser un outil, cliquer le canevas, taper la description) ne la rendait pas active : la palette et le bouton Supprimer continuaient de cibler l'ancienne étape, source d'erreurs. Et l'outil Texte affichait son champ de saisie en **bas de l'étape**, loin du point cliqué.

**Correctif** :
1. **Étape active automatique** : le `StepCanvas` émet `onInteract` à toute interaction (pointerdown dans le canevas, pose d'outil) ; l'éditeur rend l'étape active. La frappe dans le titre ou la description d'une étape la rend aussi active. Le sélecteur, la palette et les actions suivent l'étape réellement travaillée — plus besoin de sélectionner avant d'agir.
2. **Texte saisi sur place** : l'input de l'outil Texte apparaît **dans le canevas, au point cliqué** (style du futur texte : fond de la couleur choisie, texte blanc, bordure blanche) — plus de bloc en bas d'étape. Entrée valide, Échap annule, et la perte de focus (tap ailleurs) valide aussi.

**Test** : `web/src/lib/active-step.test.ts` — déplier l'étape 2, revenir à l'étape 1 via le sélecteur, cliquer dans le canevas de l'étape 2 : le sélecteur passe à l'étape 2 (marqueur ▶).

**Fichiers** : `web/src/step-canvas.tsx` (onInteract, input texte in-canvas), `web/src/pages/editor.tsx` (branchement onInteract, titre/description activent l'étape), `web/src/lib/active-step.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front (dont le nouveau) + 106/106 tests serveur verts.

---

## C-40 — Le VRAI bug des flèches : bond au premier déplacement (réalisé)

**Problème** ( уточнение de C-38) : une flèche sélectionnée sautait **d'un bond** non pas au clic, mais **au moindre déplacement** — le bond valait la moitié de la longueur de la flèche, dans la direction du geste.

**Cause racine** : incohérence entre le point de saisie et l'assignation au move. Le grab (offset pointeur → forme) est calculé depuis le **centre** de la flèche (`(x1+x2)/2`), mais le move assignait la position du pointeur moins le grab (= le nouveau **centre**) **directement à `x1`** — qui est le point de **départ** de la flèche. La flèche se retrouvait donc translatée de la moitié de sa longueur au premier mouvement. (C-38 avait traité un vrai problème connexe — le micro-glissement du tap — mais pas celui-ci.)

**Correctif** : le move conserve le **centre sous le pointeur** — `x1 = centre.x − lenX/2`, `x2 = centre.x + lenX/2` (idem en y), avec bornage aux bords du canevas. La flèche suit exactement le geste, sans bond. (Les zones et photos étaient déjà cohérentes : leur grab est relatif au coin d'origine.)

**Test** : scénario C-40 dans `step-canvas-adaptive.test.ts` — saisir une flèche par son centre, glisser de (+0.025, +0.05) : les coordonnées rendues bougent d'exactement le delta du geste (l'assertion à ±0.005 aurait détecté le bond d'avant). Au passage : mock `clientWidth` en jsdom (le rendu SVG lit `clientWidth`, toujours 0 en jsdom) et attente d'un tick entre pointerdown et pointermove (le temps que l'effet attache les listeners window).

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/lib/step-canvas-adaptive.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front (9 OK dans le canvas adaptatif) + 106/106 tests serveur verts.

---

## C-39 — Palette d'outils : persistante pendant l'usage + scroll recalé à l'ouverture (réalisé)

**Problème** : la palette se refermait au premier clic dans le canevas (poser une flèche = rouvrir la palette pour l'outil suivant) ; et à l'ouverture, la palette — posée en absolu sous le bandeau sticky — pouvait dépasser du bas de l'écran sans recalage du scroll.

**Correctif** :
1. La palette **reste affichée** pendant l'utilisation des outils (pose de formes, sélection, photos…) — fermeture uniquement par le bouton Outils, Échap ou navigation. Les pictos et menus secondaires conservent leur fermeture au clic extérieur (menus contextuels, pas palettes de travail).
2. À l'ouverture, le scroll est **recalé** : si le bas de la palette dépasse du viewport, la fenêtre défile doucement pour que la palette soit entièrement visible (le bas du bandeau étendu devient la ligne de flottaison).

**Fichiers** : `web/src/pages/editor.tsx`

**État (C-38/C-39)** : ✅ livrés sur beta — tsc + build + tous tests front (dont le scénario C-38) + 106/106 tests serveur verts.

---

## C-37 — Palette d'édition : les outils « sautaient » d'~1 cm au clic (tactile) (réalisé)

**Problème** : sur écran tactile, sélectionner un outil dans la palette (flèche, zone, texte…) déplaçait les boutons d'environ 1 cm. Cause : la règle `@media (pointer: coarse) { button { min-height: 44px; min-width: 44px } }` s'applique à TOUS les boutons — les outils compacts (~30 px) grandissaient au premier rendu tactile… mais surtout, la palette étant en `flexWrap: wrap`, l'agrandissement des boutons au clic provoquait un **reflow** (passage à la ligne des voisins), déplaçant tout le contenu d'environ une ligne ≈ 1 cm — sous le doigt, juste au moment du tap.

**Correctif** : classe `.tool-icon-btn` pour les boutons d'icônes de la palette (Photos, Flèche, Zone, Texte, pastilles de couleur) — **taille tactile fixe dès le rendu** (2.4 rem / 38 px, icônes 20 px) au lieu du 44 px général qui ne s'appliquait qu'après le premier toucher. Plus aucun changement de taille au clic → plus de reflow → plus de déplacement. La règle 44 px reste pour les autres boutons (texte, actions).

**Fichiers** : `web/src/styles.css` (règle `.tool-icon-btn` dans le bloc pointer: coarse), `web/src/pages/editor.tsx` (classe appliquée aux 3 groupes de boutons)

**État** : ✅ livré sur beta — tsc + build + tous tests front + 106/106 tests serveur verts.

---

## C-36 — Lecture guidée : Précédent/Suivant/Terminé accrochés au bas de l'écran (réalisé)

**Problème** : dans la lecture guidée, la rangée Précédent/Suivant/Terminé était le 3ᵉ rang de la grille du `main` — elle ne « collait » au bas que si l'étape remplissait l'écran ; dès que le contenu était long (grande photo, description détaillée), les boutons défilaient hors de vue, hors de la zone pouce.

**Correctif** :
1. La barre de navigation devient **`position: fixed` en bas de l'écran** (pleine largeur, fond opaque `var(--bg)`, bordure + ombre légère, `zIndex` 200, safe areas iPhone respectées gauche/droite/bas).
2. Le `main` passe à `minHeight: 100dvh` (viewport dynamique — barre d'URL mobile incluse) avec un `paddingBottom` réservant la hauteur de la barre : le contenu défile sous la barre sans jamais être masqué.
3. L'article d'étape perd son `overflowY: auto` interne — c'est la page qui défile (comportement naturel du scroll au doigt), la barre reste immobile.

**Test** : `guided-finish.test.ts` étendu — la nav est rendue `position: fixed` avec `bottom: 0`, fond opaque, bouton Précédent présent (en plus du scénario B-A1 Terminé navigue).

**Fichiers** : `web/src/pages/guided-reader.tsx`, `web/src/lib/guided-finish.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front verts.

---

## C-35 — Remontées terrain : page dédiée, lecteur allégé (réalisé)

**Problème** : l'historique des signalements terrain (à traiter + résolus, avec actions « Corriger l'étape » et « Résoudre ») s'affichait en pleine page de lecture — un contenu de gestion qui n'a pas sa place dans la consultation atelier, et qui poussait les étapes vers le bas.

**Correctif** :
1. Nouvelle page dédiée **`/workflow/:id/feedbacks`** (auteur+) : section **« À traiter »** (compteur, actions Corriger l'étape / Résoudre) puis **« Traitées »** (historique des signalements résolus avec résolveur et date, opacité réduite). Cartes individuelles, compteurs en badges, mêmes conventions compactes que le reste (C-34).
2. Le **lecteur n'affiche plus la section** — seul un lien discret **« ⚑ Terrain »** (auteur+) dans le header y renvoie. Le formulaire « Signaler un problème sur cette étape » reste bien sûr en lecture : c'est l'entrée du flux terrain.
3. La page dédiée charge ses données elle-même ; le lecteur ne fait plus la requête `listFeedback` (une requête en moins pour chaque lecteur).

**Test** : `web/src/lib/feedbacks-page.test.ts` — page dédiée rendue : sections « À traiter »/« Traitées » avec compteurs, signalement ouvert avec bouton Résoudre, signalement résolu dans l'historique avec mention du résolveur, lien Corriger l'étape.

**Fichiers** : `web/src/pages/feedbacks.tsx` (nouveau), `web/src/pages/reader.tsx` (section retirée, lien ajouté), `web/src/app.tsx` (route), `web/src/lib/feedbacks-page.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front (dont le nouveau) + 106/106 tests serveur verts.

---

## C-34 — Lecteur : sélecteur « Aller à » aligné sur l'éditeur + tailles rationalisées (réalisé)

**Problème** : dans la page de lecture, le sélecteur « Aller à l'étape… » était un sélecteur **jetable** (`value=""` réinitialisée à chaque rendu) : pas de repère de l'étape courante, re-choisir la même étape ne scrollait pas, libellé différent de l'éditeur. Les titres et champs du lecteur suivaient des tailles disparates (h1 1.05/0.95 rem selon la largeur, h2 par défaut ~1.5 rem, selects 0.9 rem avec padding 0.45 rem — contre 0.85 rem/0.25 rem dans l'éditeur compact).

**Correctif** :
1. Le sélecteur reprend la **logique de l'éditeur** : état contrôlé `activeStep`, option active marquée **▶**, scroll fluide **différé de 80 ms** (le temps du re-rendu), aria-label et title identiques (« Étape affichée — choisir pour y aller »). Re-sélectionner la même étape fonctionne désormais.
2. Tailles rationalisées aux conventions compactes de l'éditeur : h1 du document 1 rem (+ ellipsis), h2 d'étape 1 rem/600 (au lieu du ~1.5 rem par défaut), les deux sélecteurs (étape + version) en 0.85 rem/600 avec padding 0.25 rem, liens Guidé/QR 0.8 rem.

**Test** : `web/src/lib/reader-goto.test.ts` — sélecteur contrôlé prouvé : valeur initiale 0, marqueur ▶ sur l'option active, choix de l'étape 2 → valeur synchronisée et ▶ déplacé (l'ancienne étape ne le porte plus).

**Fichiers** : `web/src/pages/reader.tsx`, `web/src/lib/reader-goto.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front (dont le nouveau) + 106/106 tests serveur verts.

---

## C-33 — Suite de tests rationalisée : 32 s + 55 s → 9 s + 16 s (réalisé)

**Problème** : les tests prenaient ~87 s au total. Mesures : côté serveur, chaque fichier de test traînait ~3,5 s APRÈS ses tests — les connexions keep-alive d'undici (`fetch`) maintenaient l'event loop en vie ; `server.unref()` et `process.on("exit")` ne suffisaient pas (le handler exit arrive après l'attente). Côté front, chaque fichier est un process tsx séparé (~1,1 s de boot + ~1,6 s d'import jsdom) exécuté en séquentiel.

**Correctifs** :
1. Serveur : hook `after()` de `node:test` dans chaque fichier — `server.closeAllConnections()` tue les keep-alive immédiatement à la fin des tests, puis `server.close()`. Fichier : 4,8 s → ~1 s. Suite : **32 s → 9 s** (103 pass, 3 skips webdist inchangés).
2. Front : `web/scripts/run-tests.sh` — exécution parallèle des fichiers (xargs -P 8), **propagation d'échec vérifiée** (un test qui échoue → exit 1). Suite : **55 s → 16 s**. `npm test` dans `web/` pointe dessus ; `test:seq` conserve le séquentiel pour le débogage.

**Fichiers** : `server/test/*.test.ts` (24 fichiers, hook after), `web/scripts/run-tests.sh`, `web/package.json`, `README.md`

**État** : ✅ livré sur beta — 106/106 tests serveur, tous tests front verts, échec propagé prouvé.

---

## C-32 — Vague 6bis : correctifs de l'audit complet (4 workers, réalisé)

Audit complet (sécurité, bugs, code mort, UI/UX — items S-A1..S-A5, B-A1..B-A5, D-A1..D-A4, U-B1..U-B4 détaillés dans la roadmap, vague 6bis) corrigés par 4 workers fusionnés séquentiellement sur beta.

**Sécurité** : révocation immédiate des sessions au changement de rôle (S-A1) ; allowlist `MODOP_ALLOWED_HOSTS` pour `X-Forwarded-Host` (S-A2) ; payloads canvas/annotations bornés à 500 formes (S-A3) ; rate limiting 20/15 min sur les signalements terrain (S-A4) ; git interrogé en asynchrone dans la page déploiement, plus d'event loop bloquée (S-A5).

**Bugs** : « Terminé ✓ » de la lecture guidée navigue vers la lecture classique (B-A1, + test) ; autosave des métadonnées 800 ms après la frappe avec badge « Enregistrement… » (B-A2, RF-16) ; uploads de photos parallèles avec progression et tolérance d'échec (B-A3) ; bandaux succès/erreur distincts dans le lecteur (B-A4) ; compression client renvoie le fichier brut si l'image n'est pas parsable (B-A5).

**Code mort** : `photo-annotator.tsx` (398 lignes jamais rendues) et composant `AnnotatedPhoto` supprimés, avec leurs tests (D-A1/D-A2) ; `GET /api/admin/audit` expose enfin le journal (D-A3, + test admin 200 / auteur 403) ; dépendances de test déplacées en devDependencies (D-A4).

**UI/UX** : lightbox plein écran sur les photos en lecture (U-B1, RF-31) ; stats admin lisibles — titre + référence au lieu de « workflow:12 » (U-B2) ; titres de liste repliés sur 2 lignes (U-B3) ; section « Journal d'audit » dans /stats (U-B4).

**Fichiers** : serveur (`admin.ts`, `origin.ts`, `security.ts`, `deploy.ts`, `photos.ts`, `workflows.ts`, `stats.ts`, `app.ts`), front (`editor.tsx`, `guided-reader.tsx`, `reader.tsx`, `step-canvas-view.tsx`, `stats.tsx`, `list.tsx`, `api.ts`, `annotated-photo.tsx`), tests (`security.test.ts`, `guided-finish.test.ts`).

**État** : ✅ livré sur beta — 106/106 tests serveur, tsc + build + tous tests front verts.

---

## C-31 — Désélection : clic/tap ailleurs que sur l'image (réalisé)

**Problème** : une image (ou forme) sélectionnée dans le canevas d'édition ne pouvait être désélectionnée QUE par un clic souris sur le fond du canevas. Trois cas restaient bloqués : 1) au **tactile/stylo**, un tap sur le fond ne désélectionnait rien (le `return` C-19 court-circuitait tout traitement du fond au doigt) ; 2) **les formes** n'étaient jamais vidées par un clic fond (seules les photos l'étaient) ; 3) un clic **ailleurs dans l'éditeur** (champs, boutons, fond de page — hors canevas) laissait la sélection intacte.

**Correctif** (`web/src/step-canvas.tsx`) :
1. Un tap tactile/pen sur le fond démarre désormais une gesture `selrect` sans capture ni `preventDefault` : si le navigateur reprend le geste en scroll, **`pointercancel` restaure la sélection d'avant le geste** (sauvegardée dans `prevSel`) ; si c'est un vrai tap, la sélection est vidée immédiatement (sauf Maj). Le selrect tactile ne modifie plus la sélection en cours de geste (pas de sélection en direct au doigt).
2. Le clic fond (souris comme tactile) vide **photos ET formes**, immédiatement au pointerdown (le rectangle de sélection ne réajambe la sélection qu'au relâchement s'il a une vraie surface, C-30 inchangé).
3. Un listener `pointerdown` global (capture) vide la sélection quand le clic a lieu **hors du canevas** — les éléments marqués `data-keep-canvas-selection` (bouton « 🗑 Objets (n) » du bandeau d'édition) sont exclus pour rester fonctionnels.

**Tests** : deux scénarios ajoutés à `web/src/lib/step-canvas-adaptive.test.ts` — « TAP TACTILE FOND = DÉSÉLECTION » et « CLIC HORS CANEVAS = DÉSÉLECTION » (sélection préalable prouvée par l'outline avant chaque geste).

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/pages/editor.tsx` (attribut `data-keep-canvas-selection` sur « 🗑 Objets »), `web/src/lib/step-canvas-adaptive.test.ts`

**État** : ✅ livré sur beta — tsc + build + 15/15 tests front verts.

---
## C-01 — Étapes repliées trop hautes (réalisé)

**Problème** : en mode replié, chaque carte d'étape empile la poignée de drag, les flèches ▲▼ et la corbeille 🗑 — la liste déborde verticalement et on voit peu d'étapes à l'écran.

**Correctif** :
- Flèches ▲▼ de réordonnancement retirées (le glisser-déposer de la poignée ⠿ et le sélecteur « … » du bandeau restent les deux moyens de réordonner).
- Corbeille 🗑 retirée de la carte d'étape.
- La suppression d'étape déménage dans la **palette d'outils du bandeau** (« + » → bouton « Supprimer l'étape », en rouge, ciblant l'étape active) — la modale de confirmation (F4) est conservée.

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — build + tsc + 13 tests front verts.

## C-02 — « Requête cross-site refusée » à la mise à jour (réalisé)

**Problème** : après la vague 6, toutes les requêtes mutantes renvoient 403 « Requête cross-site refusée » quand Modop est servi via le **tunnel Cloudflare**. Cause : la config du tunnel force `httpHostHeader: localhost` — cloudflared réécrit le header `Host` en `localhost` tandis que le navigateur envoie `Origin: https://modop-beta.calironi.com`. L'anti-CSRF comparait `Origin` au `Host` réécrit → faux positif systémique.

**Correctif (double)** :
1. `assertSameOrigin` compare désormais l'`Origin` au **`X-Forwarded-Host`** (première valeur) sinon au `Host`, insensible à la casse. Un vrai cross-site derrière le même proxy reste refusé (test runtime).
2. `scripts/hardening-tunnel.sh` n'écrit plus `httpHostHeader: localhost` — le tunnel préserve l'hôte public.

**Si vous avez accès au CT** :
```bash
sed -i '/httpHostHeader/d' /etc/cloudflared/config.yml
systemctl restart cloudflared
```
(ou relancer `bash scripts/hardening-tunnel.sh --tunnel-only`, qui resynchronise la config)

**⚠️ Sans accès au CT (procédure dashboard Cloudflare uniquement)** — la porte de sortie : le code C-02 accepte déjà `X-Forwarded-Host`, que l'**ancienne** config du tunnel envoie (cloudflared y sauvegarde l'hôte original quand `httpHostHeader` réécrit le `Host`). Il suffit donc de faire passer la mise à jour, puis tout rentre dans l'ordre :

1. Dashboard Cloudflare → **Rules → Overview → Create rule → Request Header Transform Rule**
2. Expression : `http.host eq "modop-beta.calironi.com"`
3. Action : **Remove** — nom d'en-tête : `Origin` (l'anti-CSRF déployé laisse passer les requêtes sans Origin)
4. Dans Modop : **Mettre à jour depuis GitHub** → déploie le correctif C-02
5. **Supprimer la règle Cloudflare** — le nouveau code honore X-Forwarded-Host, l'anti-CSRF refonctionne complètement ; la config cloudflared du CT n'a jamais besoin d'être modifiée

**Fichiers** : `server/src/auth/origin.ts`, `scripts/hardening-tunnel.sh`, `server/test/security.test.ts`

**État** : ✅ livré sur beta — 92/92 tests runtime (dont le scénario tunnel), tsc + build verts.

## C-03 — Drag & drop des étapes ne fonctionne pas (réalisé)

**Problème** : après C-01 (retrait des flèches ▲▼), le réordonnancement reposait uniquement sur le drag HTML5 (`draggable`) — qui **ne fonctionne pas au tactile** (limites connues des navigateurs mobiles ; point U1 de l'audit) et s'avérait fragile à la souris.

**Correctif** : la poignée ⠿ passe en **Pointer Events** (même approche que le canevas, commit f766785) :
- `pointerdown` sur la poignée → listeners `pointermove`/`pointerup`/`pointercancel` attachés au `window` (survivent aux re-renders React) ;
- badge flottant « Déplacer "…" » suivant le doigt/curseur pendant le drag ;
- au relâchement, la carte sous le pointeur est identifiée (`elementFromPoint` → `id="edit-step-<n>"`) → `moveStep(from, to)` (même API qu'avant) ;
- annulation propre sur `pointercancel` ; `touch-action: none` localisé sur la poignée (le scroll de la page reste libre ailleurs).

**Test** : `web/src/lib/step-drag.test.ts` — simule pointerdown/move/up en jsdom (étape 1 relâchée sur la carte 2) et prouve le `PUT /steps/reorder` avec l'ordre `[202, 101]`, plus l'absence d'attribut `draggable` sur la poignée.

**Fichiers** : `web/src/pages/editor.tsx`, `web/src/lib/step-drag.test.ts`

**État** : ✅ livré sur beta (`40e273d`) — tsc + build + 14/14 tests front verts.

## C-04 — Boutons dupliqués en bas de l'éditeur (réalisé)

**Problème** : « + Ajouter une étape » et « Publier Vn » apparaissaient deux fois — une fois dans le bandeau sticky (toujours accessible) et une fois en bas de la liste des étapes : redondance et bruit visuel en fin de page.

**Correctif** : la rangée de boutons sous la liste des étapes est retirée. Les deux actions restent disponibles dans le bandeau sticky (« + étape » et « Publier », avec confirmation pour la publication).

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tests front verts (editor-smoke, editor-sticky, header-tools, step-drag, mobile-overflow).

## C-05 — Bouton « Enregistrer les détails » retiré (réalisé)

**Problème** : le bouton « Enregistrer les détails » en tête de l'éditeur entrait en conflit avec le modèle mental « tout se joue à la publication » — deux moments d'enregistrement à gérer.

**Correctif** :
- Bouton retiré (en mode création, le bouton « Créer » reste — il est nécessaire pour obtenir l'identifiant du document).
- **La publication sauvegarde d'abord les métadonnées** (titre, famille, type, description) via `PUT /api/workflows/:id` avant le `POST /publish` — sinon les champs en cours d'édition n'auraient jamais été persistés (le serveur ne les enregistre pas seul).
- Fonction `saveMeta` devenue morte : supprimée.

**Note UX** : les métadonnées modifiées ne sont donc visibles des lecteurs qu'après publication ; le brouillon garde les valeurs en cours d'édition côté client (état React).

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tests front verts.

## C-06 — Header éditeur fusionné avec les détails (réalisé)

**Problème** : la page d'édition commençait par une carte « détails du document » puis, plus bas, un bandeau sticky d'outils — deux blocs visuellement distincts pour un même contexte ; le bouton « Détails » portait une icône ✉, le champ « aller à » était large, « + étape » était un bouton permanent du bandeau et « Publier » se fondait parmi les icônes.

**Correctif** :
- **Fusion** : la carte détails et le bandeau d'outils forment **une seule section sticky** — rangée 1 : titre du document + « Détails » (sans icône) + **« Publier » poussé à droite (`marginLeft: auto`) en couleur d'accent** (fond bleu `primaryBtn`) ; champs de détails dépliables ; rangée outils (étape active, replier, insertion, « … » réduit).
- « Aller à l'étape » réduit (largeur 2.6rem, padding compact).
- « + étape » déplacé dans la **palette d'outils dépliante** (« + » → photos, formes, couleurs, **+ étape**, pictos, suppression).
- Les étapes restent sous la section sticky (défilement normal).

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tests front verts (editor-smoke, editor-sticky, header-tools, step-drag, mobile-overflow).

## C-07 — Header sticky cassé par la fusion C-06 (réalisé)

**Problème** : après la fusion C-06, le header n'était plus persistant au scroll. Cause : la liste des étapes (`<ol>`) s'était retrouvée **à l'intérieur** de la section sticky — un élément `position: sticky` aussi haut que son propre contenu n'a plus d'espace de défilement pour « coller » en haut : il défilait avec la page.

**Correctif** : la section sticky (titre + détails + rangée d'outils) est refermée **avant** la liste des étapes. Celle-ci redevient un fragment séparé (`{!isNew && (<>...</>)}`) sous la section. Le header reste collé pendant le défilement des étapes.

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tests front verts.

## C-08 — « Supprimer les objets » déplacé dans la palette d'outils (réalisé)

**Problème** : le bouton « 🗑 Supprimer (n) » des objets sélectionnés (photos/formes du canevas) apparaissait dans la barre d'aide du canevas, sous l'étape — éloigné des autres actions et perdu dans le contenu.

**Correctif** :
- Le bouton inline du canevas est retiré.
- `StepCanvas` expose son état de sélection (`onSelectionChange`) et sa fonction de suppression (`deleteActionRef`) à la page.
- Le bouton « 🗑 Objets ({n}) » apparaît dans la **palette d'outils** du bandeau (à côté de « Supprimer l'étape »), uniquement quand des objets sont sélectionnés sur l'étape active, ciblant son canevas.
- La suppression reste aussi possible par glisser-déposer sur la corbeille verticale à droite du canevas (inchangée).

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + 14/14 tests front verts.

## C-09 — Numéros d'étapes + thème sombre persistant au rafraîchissement (réalisé)

**Problème 1** : les cartes d'étapes de l'éditeur n'étaient pas numérotées (le lecteur l'était déjà).
**Problème 2** : le mode sombre « sautait » à chaque rafraîchissement. Le code de thème (script inline de `index.html` + localStorage) est correct, mais le serveur ne posait **aucun en-tête de cache sur le HTML** : le navigateur pouvait rejouer un `index.html` périmé depuis son cache HTTP — sans le script inline — d'où le flash clair puis le retour sombre (le saut).

**Correctif** :
1. **Numéros d'étapes** : badge circulaire accentué (1, 2, 3…) entre la poignée de drag et le titre de chaque carte d'étape de l'éditeur.
2. **Cache HTTP corrigé côté serveur** :
   - `index.html` servi avec `Cache-Control: no-cache, no-store, must-revalidate` — toujours frais, le script de thème s'exécute avant le premier rendu ;
   - `/assets/*` (fichiers empreintés par Vite) servis avec `maxAge: 1y, immutable` — cache long sans risque de péremption.

**Fichiers** : `web/src/pages/editor.tsx`, `server/src/app.ts`

**État** : ✅ livré sur beta — 92/92 tests serveur, tsc + build + 14/14 tests front verts.

## C-10 — Page blanche après C-09 (régression corrigée en urgence)

**Problème** : après C-09, toutes les pages étaient blanches. Cause : le middleware que j'avais ajouté appelait `next("static-assets")` — dans Express, **`next()` avec une chaîne la traite comme une ERREUR** et court-circuite tous les middlewares suivants vers le handler 500. Toutes les requêtes `/assets/*` (JS/CSS du front) renvoyaient donc 500 → page blanche.

**Correctif** :
- Middleware fautif supprimé. Le montage `app.use("/assets", express.static(...))` **avant** le static général suffit à attraper les `/assets/*` avec le cache long.
- En corrigeant : découverte que `GET /` était servi par `express.static` (index.html par défaut) **avant** la route SPA qui posait le `no-store` — l'en-tête n'était donc jamais posé sur la racine. Ajout d'un middleware qui pose `Cache-Control: no-cache, no-store, must-revalidate` sur toute navigation sans extension (le HTML), avant le static.
- **Nouveau test runtime** `static-cache.test.ts` : GET / → 200 + no-store ; asset JS → 200 + immutable. La régression page blanche (assets en 500) ne pourra plus repasser.

**Fichiers** : `server/src/app.ts`, `server/test/static-cache.test.ts`

**État** : ✅ livré sur beta — 94/94 tests serveur (dont 2 nouveaux), tsc OK.

<!-- Prochains correctifs de la série :

## C-11 — (titre à définir)
-->

## C-11 — Cycle de vie des signalements : résolution (réalisé)

**Problème** : les signalements terrain s'accumulaient sans moyen de les traiter — aucun statut, aucune clôture.

**Correctif** :
- Table **`feedback`** dédiée (statut `open`/`resolved`, résolveur, date) — les signalements ne sont plus seulement des lignes d'audit.
- **`PUT .../feedback/:id/resolve`** (auteur) : clôture tracée (`feedback_resolved` dans l'audit).
- **Panneau du lecteur** (auteur) : compteur « N à traiter », badge rouge « à traiter » / vert « résolu par X », lien **« Corriger l'étape »** (vers l'éditeur) + bouton **« ✓ Résoudre »** ; les résolus restent visibles en atténué (historique).

**Fichiers** : `server/src/db/schema.ts`, `server/src/routes/workflows.ts`, `web/src/api.ts`, `web/src/pages/reader.tsx`, `server/test/feedback.test.ts`

**État** : ✅ livré sur beta — 100/100 tests serveur (dont cycle complet signaler → lister → résoudre → permissions lecteur/auteur), tsc + build verts.

## C-12 — Bandeau de navigation épuré : menu hamburger (réalisé)

**Problème** : la barre du haut accumulait les boutons (email, rôle, Comptes, Statistiques, Déploiement, thème, Déconnexion) — encombrée, surtout sur mobile.

**Correctif** :
- Le bandeau ne garde que **« Modop »** et le **bouton menu (trois barres)**, à droite.
- Le menu déroulant regroupe : identité (email + rôle), **Modes opératoires** (accueil), **Comptes / Statistiques / Déploiement** (admin seulement), séparateur, bascule de thème, **Déconnexion** (en rouge).
- Fermeture par clic extérieur, touche Échap, ou après navigation ; aria-expanded/haspop pour l'accessibilité.
- Le bandeau est **sticky** ; les headers sticky de l'éditeur et du lecteur s'accrochent désormais **sous** lui (top 2.9rem) au lieu de se superposer.

**Test** : `nav-menu.test.tsx` — bandeau épuré (liens absents menu fermé), ouverture, entrées par rôle, fermeture Échap.

**Fichiers** : `web/src/nav.tsx`, `web/src/pages/editor.tsx`, `web/src/pages/reader.tsx`, `web/src/lib/nav-menu.test.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front + 100/100 serveur.

## C-13 — Cartes de la liste compactées en une ligne (réalisé)

**Problème** : chaque mode opératoire de l'accueil occupait jusqu'à trois lignes (titre/badges, badges famille/type sur une seconde ligne, wrap mobile des actions).

**Correctif** : tout tient sur **une ligne** par carte :
- badges famille/type remontés **inline** à côté de la référence (plus de bloc séparé) ;
- titre à ellipsis (flex 1 1 10rem) : les longs titres ne font plus déborder la ligne ;
- « Modifier »/« Supprimer » remplacés par icônes ✎ / 🗑 (aria-label conservé) ;
- padding de carte réduit (0.45rem × 0.7rem) et typographie resserrée (0.72–0.95rem).
Sur écran étroit, le wrap reste possible mais chaque élément est compact — la carte ne dépasse plus deux lignes au pire.

**Fichiers** : `web/src/pages/list.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-14 — Cartes minimales + suppression dans l'éditeur à double validation (réalisé)

**Problème** : 1) avec les badges, les cartes de la liste faisaient toujours deux lignes sur mobile ; 2) la suppression d'un MO se déclenchait depuis la liste (🗑 à côté du titre) — action destructrice trop accessible.

**Correctif** :
1. **Cartes minimales** : uniquement **titre** (ellipsé), **référence** et **✎** (édition, auteurs) — une seule ligne garantie, même sur mobile. Badges version/famille/type/à revoir retirés des cartes (le filtre « À revoir » et le lecteur restent les sources d'info). Le bouton 🗑 disparaît de la liste.
2. **Suppression déplacée en bas de la page d'édition**, dans une zone dédiée (fond danger), avec **triple barrière** :
   - clic « Supprimer le mode opératoire… » →
   - avertissement détaillé (titre, référence, irréversibilité) + « Continuer… » →
   - **case à cocher obligatoire** (« Je comprends que… ») + bouton « Supprimer définitivement » **désactivé tant que la case n'est pas cochée**. Le serveur a déjà sa propre confirmation serveur-côté (DELETE cascade) — la double validation UI protège de tout clic accidentel.

**Fichiers** : `web/src/pages/list.tsx`, `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-15 — Titres de page réduits + thème persistant injecté côté serveur (réalisé)

**Problème 1** : les titres de page (h1) prenaient trop de place.
**Problème 2** : le thème sombre sautait encore au rafraîchissement malgré C-09 (cache HTTP corrigé) — un maillon restait dépendant du navigateur.

**Correctifs** :
1. **Titres** : règle globale `h1` à 1.05rem dans styles.css ; h1 inline réduits (comptes/déploiement/stats 1.05rem, lecteur 0.95–1.05rem, éditeur 1rem, login 1.3rem).
2. **Thème — nouvelle approche, côté serveur** : le front pose un **cookie `modop-theme`** à chaque bascule ; le serveur **injecte `data-theme` directement dans le `<html>` servi**. Le premier rendu part avec le bon thème, **quoi que fassent les caches HTTP, le CDN Cloudflare ou le service worker** — plus aucun flash possible. Détail technique : `express.static` ne sert plus la racine (`index: false`) pour que la route d'injection prenne toutes les navigations ; le script inline (cookie → localStorage) reste en repli pour la toute première visite. Prouvé par test runtime : cookie `dark` → HTML contient `data-theme="dark"`.

**Fichiers** : `web/src/styles.css`, pages (titres), `server/src/app.ts`, `web/src/theme.ts`, `web/index.html`, `server/test/static-cache.test.ts`

**État** : ✅ livré sur beta — 101/101 tests serveur (dont 1 nouveau : injection thème), tsc + build + tests front.

## C-16 — Pictos regroupés derrière un bouton unique (réalisé)

**Problème** : les 7 pictos d'indication (Attention, Danger, EPI, Risque électrique, Point chaud, Outillage, Information) s'étalaient en permanence dans la palette d'outils — la rangée devenait longue, surtout sur mobile.

**Correctif** :
- Un seul bouton **⚠** dans la palette (compteur si l'étape active a des indications : « ⚠ (2) », fond accentué).
- Le clic ouvre un **sous-menu déroulant** listant les pictos avec leur pastille couleur ; les actifs sont cochés (✓, fond teinté) — re-cliquer bascule (mêmes règles qu'avant).
- Fermeture par clic extérieur ou **Échap** ; le compteur reste visible menu fermé.

**Test** : `header-tools.test.ts` mis à jour (bouton ⚠ présent dans la palette).

**Fichiers** : `web/src/pages/editor.tsx`, `web/src/lib/header-tools.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-17 — Header et bandeau nav solidaire au scroll (réalisé)

**Problème** : le header sticky de l'éditeur (et du lecteur) restait en haut mais **se déplaçait par rapport au bandeau de navigation** en scrollant — le `top: 2.9rem` était une estimation fixe de la hauteur du nav, qui varie selon l'écran.

**Correctif** : le nav **mesure lui-même sa hauteur** et la publie dans la variable CSS `--nav-h` (ResizeObserver + publication au montage) ; les headers sticky des pages s'accrochent à `top: var(--nav-h, 2.9rem)`. Les deux bandeaux restent désormais collés l'un sous l'autre, quel que soit le viewport ou les redimensionnements. Garde pour les environnements sans ResizeObserver (tests jsdom).

**Fichiers** : `web/src/nav.tsx`, `web/src/pages/editor.tsx`, `web/src/pages/reader.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-18 — Barre de filtres repensée : recherche + bouton Filtres (réalisé)

**Problème** : la ligne de filtres de l'accueil empilait recherche + 2 selects + bouton À revoir + Créer — longue, wrap inévitable sur mobile.

**Correctif** :
- **Une ligne** : champ de **recherche pleine largeur** + bouton **« Filtres »** + **« + »** (création, auteurs).
- Le bouton Filtres affiche un **compteur d'actifs** (« Filtres (2) ») et ouvre un **panneau dépliable** regroupant : État, Famille, **Trier par** (modifié récemment / titre / référence / famille / date) et la case « À revoir » — plus un bouton **Effacer** quand des filtres sont actifs.
- Le tri exploite le paramètre `sort` déjà supporté par l'API (whitelist serveur inchangée).

**Test** : `browse-smoke` mis à jour — vérifie la barre épurée, l'ouverture du panneau et la présence état/tri.

**Fichiers** : `web/src/pages/list.tsx`, `web/src/api.ts`, `web/src/lib/browse-smoke.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front + 101/101 serveur.

## C-19 — Scroll fluide en édition : le canevas ne piège plus le doigt (réalisé)

**Problème** : en mode édition, le scroll était haché/impossible sur mobile — chaque canevas d'étape portait `touch-action: none` sur **toute sa surface** : poser le doigt n'importe où (même sur le fond vide) avale le geste. Plusieurs étapes ouvertes = une suite de zones mortes au scroll.

**Correctif — le geste n'est capturé que là où c'est nécessaire** :
- **Fond du canevas** (sans outil actif) : `touch-action: pan-y` — un doigt sur le fond **scrolle la page nativement** (inertie du navigateur conservée) ; le `onPointerDown` tactile retourne immédiatement si aucun objet n'est touché.
- **Objets** (photos, formes, poignée de redimensionnement) : `touch-action: none` conservé — déplacement et redimensionnement au doigt inchangés.
- **Outil actif** (flèche/zone/texte) : canevas en `none` complet — le dessin prime sur le scroll.
- La **sélection au rectangle** devient un geste souris ; au tactile on sélectionne en tapant l'objet (comportement déjà présent).
- `scroll-behavior: smooth` global : navigations d'étapes (sélecteur « … », liens) fluides.

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/styles.css`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-20 — Header éditeur : « + » → « Outils », « … » → « Aller à… » (réalisé)

**Correctif** : libellés explicites dans le bandeau de l'éditeur — le bouton de palette devient **« Outils »** (au lieu de l'icône +), le sélecteur de navigation affiche **« Aller à… »** (au lieu de « … »). L'option « … » du menu n'est plus mystérieuse sur mobile.

**Fichiers** : `web/src/pages/editor.tsx`, `web/src/lib/header-tools.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-21 — Rangée outils sur une ligne + rectangle de sélection 100 % souris (réalisé)

**Problème 1** : le bouton « Aller à… » était large et passait sur une 2e ligne du bandeau. **Problème 2** : au doigt sur la zone d'image, le geste créait un **rectangle de sélection** au lieu de scroller.

**Correctifs** :
1. **Le nom d'étape devient la liste déroulante** : le `<h2>` statique et le bouton « Aller à… » fusionnent en un **unique select** — l'étape active s'affiche dedans (▶), en choisir une autre y va (scroll fluide). La rangée ne contient plus que : sélecteur d'étape · plier/déplier · Outils — en `nowrap` (une ligne garantie).
2. **Rectangle de sélection réservé à la souris** : le `selrect` ne démarre que si `pointerType === "mouse"`. Au doigt sur le fond du canevas, **plus aucun drag n'est amorcé** — le `touch-action: pan-y` fait scroller la page. (C-19 avait déjà ouvert la voie ; le résidu venait du selrect qui démarrait pour tout pointeur.)

**Fichiers** : `web/src/pages/editor.tsx`, `web/src/step-canvas.tsx`, `web/src/lib/editor-sticky.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-22 — Boîte à outils en panneau flottant (réalisé)

**Problème** : à l'ouverture de la palette « Outils », ses boutons s'inséraient dans la rangée du bandeau (flex) et **comprimaient latéralement la première ligne** (sélecteur d'étape rétréci).

**Correctif** : la palette devient un **panneau flottant** (`position: absolute`, bord à bord sous la rangée, ombre + bordure) — elle se **pose par-dessus le contenu** au lieu de repousser la mise en page. La première ligne ne bouge plus d'un pixel, ouverte ou fermée. Fermeture par clic extérieur (en plus du bouton « Outils »).

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-23 — Boîte à outils utilisable sans étape + dernière étape protégée (réalisé)

**Problème** : sans étape, la palette Outils ne s'ouvrait pas — impossible de créer la première étape depuis le bandeau. Par ailleurs supprimer toutes les étapes laissait un MO vide et inéditable.

**Correctif (au plus simple)** :
- La palette s'ouvre **toujours** ; sans étape, elle affiche « Créez d'abord une étape : » + le bouton **« + étape »** (les outils nécessitant une étape cible — photos, formes, pictos, suppression — sont masqués).
- Le bouton « Supprimer l'étape » **disparaît quand il ne reste qu'une étape** : un mode opératoire garde toujours au moins une étape.

**Fichiers** : `web/src/pages/editor.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-24 — « + étape » invisible sans étape : régression C-23 corrigée (réalisé)

**Problème** : malgré C-23, le bouton « + étape » n'apparaissait pas dans la palette d'un MO sans étape — lors du réordonnancement du fragment JSX (C-23), le bouton s'était retrouvé **à l'intérieur** de la garde `steps.length > 0`, donc masqué précisément quand il fallait le montrer.

**Correctif** : le bouton « + étape » (et son filet) est sorti de la garde — il apparaît **toujours** dans la palette, seule la rangée photos/formes/couleurs reste conditionnelle à la présence d'une étape. Test `empty-tools.test.tsx` ajouté : MO sans étape → palette ouvre, message d'accueil, bouton « + étape » présent (le cas ne pourra plus régresser).

**Fichiers** : `web/src/pages/editor.tsx`, `web/src/lib/empty-tools.test.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-25 — Export DOCX professionnel avec canevas annoté (réalisé)

**Problème** : l'export docx empilait les photos brutes sans les annotations (formes du canevas absentes), avec une mise en page et une police par défaut peu soignées.

**Benchmark avant implémentation** (npm-compare, pkgpulse 2025-26) : pas d'outil open source clé en main « annotations export » — la composition canevas est du code métier (coordonnées Modop). Choix validés : **`@napi-rs/canvas`** (Canvas API en bindings Rust, sans dépendances système — recommandé face à node-canvas/Cairo et au palliatif SVG de sharp qui ne dessine pas de formes) et **`docx`** conservé pour le document (docxtemplater = modules images payants, officegen moins maintenu).

**Correctif** :
1. **`render/canvas-composite.ts`** : compose le canevas de chaque étape en **une seule image PNG serveur**, reproduisant exactement le rendu du lecteur (repère 240px, photos positionnées via display_x/y/w, formes par-dessus : flèches à pointe, rectangles, textes, couleurs conservées).
2. **Export DOCX repensé** : page de garde structurée (titre, bandeau de métadonnées Version/Publiée/Par/Famille/Type/Responsable), **changelog de version**, en-tête et pied de page (titre + pagination), titres d'étapes soulignés accent, pictos sur bandeau coloré, canevas composé **pleine largeur net** (800px → 600 affichés), styles de document cohérents (Calibri).

**Test** : cycle complet — upload photo positionnée + formes sur l'étape → publication → export → docx valide (zip PK) + PNG composé aux dimensions attendues.

**Fichiers** : `server/src/render/canvas-composite.ts` (nouveau), `server/src/routes/export.ts`, `server/test/export.test.ts` ; dépendance `@napi-rs/canvas`

**État** : ✅ livré sur beta — 102/102 tests serveur, tsc OK.

## C-26 — Formes sélectionnables par-dessus les images (réalisé)

**Problème** : en édition, une forme posée sur une photo était impossible à sélectionner/déplacer — le clic atteignait toujours la photo.

**Cause** : le hit-test testait `photoHit` d'abord et ne consultait `shapeHit` **que si aucune photo n'était touchée** — inversant l'ordre de rendu (où le SVG des formes est dessiné au-dessus des `<img>`).

**Correctif** : le hit-test suit l'ordre visuel — **formes d'abord, photos ensuite** (`shapeHit` prioritaire). Une forme sur une image se sélectionne et se déplace désormais ; les photos restent atteignables partout où il n'y a pas de forme.

**Fichiers** : `web/src/step-canvas.tsx`

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-27 — Corbeille de drag en carré, en haut à gauche (réalisé)

**Changement** : la zone de suppression pendant un déplacement d'objet n'est plus la bande verticale à droite (qui entrait en conflit avec la poignée de redimensionnement des photos) mais un **carré en haut à gauche du canevas** (14 % de large, 56 px de haut, coin arrondi), affiché uniquement pendant le drag. Relâcher un objet dessus le supprime (« Relâchez ici » au survol).

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/lib/step-canvas-adaptive.test.ts` (clic fond déplacé hors zone)

**État** : ✅ livré sur beta — tsc + build + tous tests front.

## C-29 — Corbeille : suppression seulement si le geste y est conduit (réalisé)

**Problème** : un petit mouvement suffisait à supprimer un objet — notamment une photo posée en haut à gauche, qui démarre son drag **dans** la zone corbeille (C-27).

**Correctif** : la suppression exige les deux conditions au relâchement — le pointeur est dans la corbeille **ET le point de départ du geste n'y était pas**. Le doigt doit avoir conduit l'objet depuis l'extérieur jusqu'à la corbeille ; un frôlement démarré dans la zone ne supprime plus. Le visuel « Relâchez ici » suit la même règle (pas de faux positif pour un objet déjà dans la zone).

**Test** : scénario dédié dans `step-canvas-adaptive.test.ts` — photo posée en haut à gauche, sélection double-clic, frôlement complet dans la zone : la photo reste. (Au passage : le premier montage du test est démonté, ses listeners window polluaient les scénarios suivants.)

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/lib/step-canvas-adaptive.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front + 102/102 serveur.

## C-30 — Désélection impossible + suppressions fantômes corrigées (réalisé)

**Problèmes** : 1) impossible de désélectionner une photo par clic à côté ; 2) des objets **loin de la corbeille** étaient supprimés après un clic avec micro-mouvement.

**Causes (deux bugs réels)** :
1. Le seuil « geste = clic » du selrect était `≥ 0.01` — soit **2,4 px** en vertical : le micro-tremblement naturel d'un clic souris dépassait le seuil et le clic fond était traité en rectangle (sélection conservée) au lieu de vider. Désormais : un clic fond vide **toujours** ; le rectangle ne conserve que s'il a une vraie surface (~40×12 px minimum).
2. **Stale closure** : le `up` lisait l'état `overTrash` figé à la création du listener — il pouvait contenir `true` résiduel d'un geste précédent ayant survolé la corbeille → suppression sans contact. Désormais le survol est suivi dans une **ref** (immunisée contre la péremption de closure), remise à zéro à chaque début de drag ; la suppression exige `overTrashRef && départ hors zone`.

**Tests** : « PAS DE SUPPRESSION LOIN CORBEILLE » (drag + micro-mouvement loin de la zone : la photo reste) ajouté aux scénarios existants (double-clic, clic fond désélection, corbeille geste conduit).

**Fichiers** : `web/src/step-canvas.tsx`, `web/src/lib/step-canvas-adaptive.test.ts`

**État** : ✅ livré sur beta — tsc + build + tous tests front + 102/102 serveur.
