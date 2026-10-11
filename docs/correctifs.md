# Modop — Journal des correctifs UI/UX (série post-audit)

Série de petits correctifs UI/UX appliqués un par un sur beta.
Chaque entrée : problème constaté → correctif → fichiers touchés → état.

*Les correctifs listés ici sont retirés de la roadmap (vague 6 livrée) : ce journal trace la série en cours.*

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
