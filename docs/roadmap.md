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
- **Zones qui se collaient TOUJOURS en haut** (2e cause) : la conversion clic→position bornait y à [0,1] alors que le canevas fait souvent plus de 240px de référence — tout ce qui était posé sous 240px était écrasé vers le haut. Borne supérieure retirée, le canevas s'agrandit selon les formes aussi.
- **Corbeille déplacée à droite** : la bande de suppression était en bas (conflit avec la poignée de redimensionnement des images) ; c'est désormais une colonne verticale à droite, uniquement pendant un drag d'objets.
- **Mobile** : largeurs bornées dans la nav (email tronqué) et le bandeau éditeur — plus de débordement.
- **Éditeur** : métadonnées repliées par défaut (titre + référence visibles, bouton « ✉ Détails ») ; clic sur le titre d'une étape l'ouvre directement (plus besoin du petit bouton ▸, qui reste et est plus visible).
- **Journal de déploiement** : séquences ANSI, spinners npm et \r filtrés côté serveur.
- **Zones en haut — VRAIE cause (3e signalement)** : l'élément SVG `<rect>` était rendu avec l'attribut **`y1`** (qui n'existe pas pour un rect — c'est un attribut de `<line>`) au lieu de **`y`** : le navigateur ignorait la position verticale et affichait **toute zone à y=0, en haut du canevas**, quelle que soit sa position enregistrée (les étapes précédentes traitaient les coordonnées, pas ce bug de rendu). Corrigé dans l'éditeur ET le lecteur ; test runtime zone-roundtrip (dessin → sauvegarde → re-rendu au même pixel près) ajouté.
- **Icône thème** : emojis remplacés par les icônes SVG Heroicons de meal_plan (soleil/lune au trait, `currentColor`).
- **Mobile (bonnes pratiques appliquées)** : base `html { font-size: 16px }`, tout contrôle de saisie forcé à **16px sur mobile** (empêche le zoom automatique iOS Safari au focus — cause principale du « débordement » ressenti), `viewport-fit=cover` + `env(safe-area-inset-*)` pour l'encoche, `touch-action: manipulation` (fin du délai de 300ms au tap).
- **Tactile (canevas d'édition)** : toute l'interaction passe en **Pointer Events** (pointerdown/move/up + capture) — drag d'objets, sélection au rectangle, redimensionnement et pose de formes fonctionnent désormais au doigt comme à la souris ; poignée de redimensionnement agrandie (28px), pastilles couleur 32px, cibles de tap >= 44px sur écran tactile (`@media pointer: coarse`).
- **Largeur mobile en édition** : rangée d'étape en retour à la ligne (wrap), titres et champs bornés (`minWidth` réduits, `maxWidth: 100%`), aide du canevas sur sa propre ligne.
- **Reconstruction UI mobile-first (éditeur + pages)** : le style des champs impose `width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box` — **aucun champ ne peut plus élargir son conteneur** (la cause structurelle des débordements) ; tous les `minWidth` fixes en px remplacés par des flex-basis fluides (`flex: 1 1 8rem`) qui laissent la place au wrap ; CSS structurel : `img, svg, video { max-width: 100% }`. Test d'invariants mobile-overflow ajouté (aucun minWidth px > 100 dans le rendu, champs pleine largeur).
- **Outils d'insertion dans le bandeau** : les outils (📷 photos, ➶ flèche, ▭ zone, T texte + pastilles couleur) remontent du canevas vers le **bandeau sticky de l'éditeur**, sur une seconde ligne compacte ; ils ciblent l'**étape active** (la dernière ouverte, ou la 1re par défaut — ouverte automatiquement au besoin) ; la palette disparaît de la zone d'édition ; pastilles couleur 18px dans le bandeau ; tous les boutons (bandeau + nav) réduits (padding et police compactés) ; le canevas reçoit outil/couleur par props et rend la main (retour au mode sélection) après chaque pose.
- **Correction (contrat non rempli)** : la rangée d'outils n'était pas réellement insérée dans le bandeau (remplacement raté silencieusement) — désormais vérifiée par un test de rendu : 📷/➶/▭/T + couleurs **et les pictos d'attention/sécurité/EPI…** sont dans le bandeau et ciblent l'étape active ; le bouton photo et les presets ont disparu de la zone d'étape (test : aucun doublon d'« Attention », zéro « Photo(s)… » dans le corps).
- **Header d'édition repensé** : la rangée d'outils est **dans le div sticky** (elle suit le défilement — un bug d'imbrication la laissait défiler avec la page). Contenu : **nom de l'étape active** (sans le mot « Étapes »), **Publier**, **▸/▾** (tout réduire/développer), **+** (palette d'insertion repliable : 📷/➶/▭/T, couleurs, pictos d'attention/sécurité), **+ étape**, sélecteur « … » de navigation ; le nom et la palette ne s'affichent que lorsqu'une étape est active.
- **Header v2 + mode sombre stabilisé** : une seule ligne compacte (nom de l'étape, Publier ✓, réduire/développer ▸/▾, Insertion **+**, + étape, sélecteur) — les deux « + » se distinguent désormais (celui d'insertion est seul avec l'accent bleu quand actif, celui d'étape porte le libellé « étape »). **Icônes SVG Heroicons** (photos, flèche, zone, texte, publier, calques) via un module `icons.tsx` partagé — plus d'emodis. Palette d'insertion en 2e ligne repliable (séparée par un filet), fermée par défaut. **Mode sombre** : SW network-first sur les navigations (un vieux index.html servi depuis le cache faisait sauter le thème après mise à jour), synchro multi-onglets via l'événement storage, getStoredTheme ne diverge jamais du dataset posé par le script inline.

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
| 6b | **Import multiple d'images** — FAIT | Le sélecteur accepte plusieurs fichiers à la fois (attribut `multiple`, upload séquentiel compressé) |
| 6 | **Gestion de statut** | Statut éditorial paramétrable sur le document (ex. brouillon / en relecture / validé / obsolète), distinct de l'état publication actuel ; filtrage et badges |

À décider avant dév : modèle de données (tables types/regroupements, colonnes parent_id, status), permissions par statut, migration des données existantes.

## 🗺️ Vision long terme

- Multi-langue (interface + contenus)
- API publique (intégrations GMAO)
- Comparaison/ restauration fine par étape
- Statistiques d'usage par MO (vues, exports)

## 🧭 Principes (inchangés)

Vagues IA supervisées : contrat figé avant chaque vague, missions bornées, portes (typecheck + build + tests d'exécution réels), fusion séquentielle, validation humaine sur le CT.
