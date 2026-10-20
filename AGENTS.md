# AGENTS.md — Contexte de travail pour agents IA

**Modop** : application web de modes opératoires industriels (PWA, auto-hébergée sur LXC Proxmox). Monorepo trois tiers : `server/` (API Express + better-sqlite3, sert aussi le front buildé), `web/` (React + Vite), `shared/` (contrat API figé : `api.md`, `types.md`).

## Stack

| Couche | Technologie |
|---|---|
| Serveur | Node + Express 4 + TypeScript, better-sqlite3 (migrations idempotentes dans `server/src/db/schema.ts`) |
| Front | React + Vite + **Tailwind v4** (PWA), composants type shadcn (`web/src/components/ui/`), canevas d'annotations maison (`web/src/step-canvas.tsx`) ; design tokens + palette dans `web/src/styles.css` (`docs/palette-couleurs.md`) |
| Export DOCX | `docx` + composition canevas `@napi-rs/canvas` (`server/src/render/canvas-composite.ts`) |
| Auth | bcrypt maison + OIDC optionnel + TOTP admin (`MODOP_TOTP_SECRET`, transitoire) ; rôles `reader` / `author` / `admin` |
| Tests | `node:test` runtime côté serveur ; scripts jsdom autonomes côté front (`web/scripts/run-tests.sh`) |

## Commandes

| Commande | Rôle |
|---|---|
| `npm ci` (racine — monorepo workspaces) | installation unique server + web |
| `npm run dev -w server` | API sur :3000 |
| `npm run dev -w web` | front Vite |
| `npm test -w server` | tests runtime (~9 s) |
| `npm test -w web` | tests front (~16 s, parallélisés) |
| `npm run build -w server` | typecheck + build (porte qualité) |
| `npm run lint` | ESLint server + web (porte qualité, aussi en CI) |

## Arborescence utile

```
server/src/routes/   workflows (CRUD+étapes) · publish (versions Vn immuables) · export (docx)
                     duplicate · restore · list · photos (+ rognage :id/file) · settings (paramètres)
                     auth (login/oidc/totp) · admin (comptes) · stats · deploy (maj/rollback depuis l'UI)
server/src/auth/     middleware · sessions · security (rate-limit, headers) · oidc · totp · audit · origin (CSRF)
server/src/db/       schema.ts (migrations idempotentes, table settings) · seed.ts
server/src/render/   canvas-composite.ts (rendu serveur des canevas annotés, épaisseur honorée)
web/src/pages/       list · editor · reader · guided-reader · qr · feedbacks · admin · stats · deploy · settings · login
web/src/             step-canvas.tsx (canevas + rognage) · api.ts · auth-context.tsx · theme.ts
web/src/editor/      tools/ (registre de commandes) · bottom-bar.tsx (barre basse fixe)
web/src/components/  ui/ (Button, Card, Input, Badge, Modal… type shadcn, faits maison)
web/src/lib/         tests front autonomes (jsdom, un fichier = un scénario, exit non-zéro = échec)
```

## Conventions (obligatoires)

- Branche de travail : **`beta`** (pousser dessus est autorisé). `main` = validation humaine uniquement.
- Commits en français : `feat:` `fix:` `docs:` `chore:`.
- **Correctifs numérotés C-xx** : toute modification non triviale = une entrée dans `docs/correctifs.md` (problème → correctif → tests → fichiers) + docs associées mises à jour dans le même commit.
- Portes qualité avant tout commit : build (tsc) + tests des deux côtés. Tout ce qui écrit en base est testé **en runtime** (tsc ne détecte pas, par ex., les transactions async refusées par better-sqlite3).
- Le formatage des fichiers existants peut être « compacté » (des blocs entiers sur une seule ligne) : **lire le texte réel avant tout remplacement** et vérifier chaque pattern.
- Env de durcissement : `MODOP_SESSION_TTL_HOURS`, `MODOP_ALLOWED_HOSTS`, `MODOP_SECURE_COOKIES`, `MODOP_DEPLOY=off`, `MODOP_DEPLOY_BRANCH` (déploiement : défaut `beta`), `MODOP_OIDC_*`, `MODOP_TOTP_SECRET` (⚠ transitoire : l'UI de login n'a pas de champ TOTP — voir roadmap vague 10). Détails : `docs/durcissement-securite.md`.

## Routage documentaire — ne lire QUE ce qui est utile à la tâche

| Zone de travail | Lire |
|---|---|
| État du projet / restant | `docs/roadmap.md` (vagues 7-10) |
| Spécification RF/RNF | `docs/cahier-des-charges.md` § 1.3 bis (liste RF) |
| Pourquoi d'un comportement existant | `grep -n "<mot-clé>" docs/correctifs.md` — **ne pas lire ce journal en entier** |
| Sécurité / config prod | `docs/durcissement-securite.md` |
| Déploiement Proxmox | `docs/guide-test-proxmox.md`, `scripts/proxmox-install.sh`, `update.sh` |
| Utilisateur final | `docs/guide-utilisateur.md` |
| Processus de développement | `docs/processus-vagues.md` |

## Travaux en cours (voir roadmap)

**Cycle de retour terrain (C-70 → C-80) livré** : refonte UI complète (Tailwind v4, palette, barre basse d'outils, Lucide), rognage d'image en place avec retour arrière, paramètres applicatifs (page `/settings`), lecture = dernier publié. **Correctifs C-81 → C-87 (GED/lecture)** : export docx dans l'entête du lecteur, composite docx fidèle au lecteur, alerte « à revoir » avec raison + lien, date de revue/responsable portés par les versions publiées (snapshot), recherche de responsable pour les auteurs (`GET /api/users`), délai de revue par défaut paramétrable (`default_review_days`, 30 j), champs date/responsable persistés dès la création (`POST /api/workflows` les accepte). **Backlog prioritaire** (roadmap) : undo/redo global, **templates de documents** (mode de réaction, tableau, enregistrements, FIT, fiches d'aspect), vidéo liée au MO, texte riche. La vague 10 (sécurité, issue #9) reste **en standby** (rappel tant qu'elle dort : l'UI de login n'a pas de champ `totp` — ne pas activer `MODOP_TOTP_SECRET` en production). Vague 9 terminée code + ops (Uptime Kuma déployé, supervisé depuis Home Assistant). Environ de test terrain : **Android/Chrome**. Constats connus : test serveur « S2 photos auth » flaky intermittent sous charge (~1 run/4).
