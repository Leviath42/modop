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

<!-- Prochains correctifs de la série :

## C-04 — (titre à définir)
-->
