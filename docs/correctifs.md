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

<!-- Prochains correctifs de la série :

## C-08 — (titre à définir)
-->
