# Routes API — CONTRAT FIGÉ (vague 0)

Toutes les routes renvoient du JSON. Erreur standard : `{ "error": "<code>", "message": "<détail>" }`.
Auth par cookie de session (httpOnly). Codes : 401 non connecté, 403 rôle insuffisant, 404 introuvable, 422 validation.

## Auth (W1)
- `POST /api/auth/login` { email, password } → session
- `POST /api/auth/logout`
- `GET  /api/auth/me` → User
- `POST /api/auth/change-password` { oldPassword, newPassword } (authentifié)

## Workflows (W2, W4, W5)
- `GET  /api/workflows?search=&category=&state=` → Workflow[]
- `GET  /api/workflows/:id` → Workflow + steps[] + photos[]
- `POST /api/workflows` { title, reference, description?, category?, family?, review_due?, owner_email? } → Workflow (author+ ; C-87 : date de revue et responsable persistés à la création)
- `PUT  /api/workflows/:id` { title?, description?, category? } (author+)
- `DELETE /api/workflows/:id` (author+)
- `POST /api/workflows/:id/publish` → { number } (author+, W4)
- `GET  /api/workflows/:id/versions` → WorkflowVersion[] (W4)

## Étapes (W2)
- `POST /api/workflows/:id/steps` { title, body? } → Step (author+)
- `PUT  /api/steps/:id` { title?, body?, pictos? } (author+)
- `DELETE /api/steps/:id` (author+)
- `POST /api/workflows/:id/steps/reorder` { orderedIds: number[] } (author+)

## Photos (W3)
- `POST /api/steps/:id/photos` multipart (file, alt?) → Photo (author+)
- `GET  /photos/:filename` → fichier binaire (public)
- `DELETE /api/photos/:id` (author+)

## Export (W6)
- `GET /api/workflows/:id/export?version=<n>` → binaire .docx (author+, version publiée)

## Navigation web (squelette figé)
- `/login`, `/` (liste), `/workflow/new`, `/workflow/:id/edit`, `/workflow/:id/read`, `/admin/users`

## Contrat v3 (vague 5) — routes ajoutées
- `POST /api/workflows/:id/duplicate` → Workflow copié en brouillon (author+)
- `GET  /api/workflows?sort=title|updated_at|reference|family` → tri (défaut updated_at DESC)
- `GET  /api/workflows?search=` → étendu au texte des étapes (LIKE sur steps.title/body)
- `POST /api/workflows/:id/versions/:number/restore` → recrée les étapes depuis le snapshot (author+)
- `GET  /api/stats` → { workflows, published, users, exports, logins, topExported[], topPublishers[], recentActivity[] } (admin) — NOTE: ne pas monter deux routers Express sur le même préfixe de path (le premier absorbe tout)
- `POST /api/photos/:id/annotations` { annotations: Shape[] } → persiste l'overlay (author+)
- Colonne `photos.annotations` (JSON, défaut '[]') : shapes {type: arrow|rect|text, ...}

# Contrat v4 (vague 6 — correctifs audit) — FIGÉ avant lancement des workers

## Photos (W3)
- `GET /photos/:filename` **(authentifié reader+)** — `requireAuth("reader")` ajouté ; les clients fetchent avec credentials (cookie httpOnly) — les `<img>` restent fonctionnelles (same-origin envoie le cookie automatiquement)
- Upload : validation du contenu réel (magic numbers JPEG/PNG/WebP) en plus du mimetype déclaratif — 422 si non conforme

## Versions (W6)
- `GET /api/workflows/:id/versions/:number` (reader+) → `{ workflow, steps[] }` rendus depuis le snapshot (même forme que `GET /api/workflows/:id`)

## Snapshot (W5) — format v2
Le JSON des colonnes `versions.snapshot` inclut désormais, par étape : `canvas` (shapes[]) et, par photo : `display_size`, `display_align`, `display_x`, `display_y`, `display_w`. La restauration et la duplication recopient ces champs. Les snapshots v1 (sans ces champs) restent lisibles — valeurs par défaut appliquées.

## Sécurité globale (W2, W4)
- Toute requête mutante (POST/PUT/DELETE) doit passer le middleware `assertSameOrigin` : header `Origin` (ou `Sec-Fetch-Site`) vérifié contre l'hôte de la requête — 403 sinon. Pas de token CSRF supplémentaire (sameSite=lax + Origin suffisent).
- Erreurs 500 : `message` générique côté client ("Erreur interne") ; le détail reste dans les logs serveur.

## Ordre des middlewares (S10)
`express.json()` AVANT le rate-limiter de login (la clé IP+email nécessite req.body).

# Contrat v5 (vagues v1.4 — branche delta) — FIGÉ avant lancement des workers

## Workflows — champs GED (W-GED)
- `workflows` porte deux nouvelles colonnes (migration idempotente) :
  - `review_due` TEXT (date ISO `YYYY-MM-DD`, nullable) — prochaine revue obligatoire (RF-74)
  - `owner_email` TEXT NOT NULL DEFAULT '' — responsable éditorial (RF-75)
- `PUT /api/workflows/:id` accepte en plus `{ review_due?: string|null, owner_email?: string }` (author+)
- `GET /api/workflows?review=overdue` — filtre documents dont `review_due < date('now')` (reader+, RF-74)
- `POST /api/workflows/:id/publish` accepte un `changelog` optionnel dans le body ; stocké dans le snapshot `versions.changelog` + colonne `versions.changelog TEXT NOT NULL DEFAULT ''` (RF-65)

## Statistiques (W-STATS)
- `GET /api/stats` expose en plus `views` (total) et ne change pas ailleurs — l'audit log `view_workflow` alimente les compteurs (RF-77)

## Retour terrain (W-FEEDBACK)
- `POST /api/workflows/:id/feedback` { step_id: number, message: string } (reader+) — signalement d'un problème sur une étape (RF-73) : entrée `audit_log (action='feedback', target='workflow:<id>', detail='step:<step_id> <message>')` + réponse `{ ok: true }`
- `GET /api/workflows/:id/feedback` (author+) → liste des signalements du document

## Front (W-QR, W-GUIDED, W-TEMPLATE) — aucun changement d'API
- RF-71 : vignette QR imprimable (page dédiée `/workflow/:id/qr`, canvas client, pas de serveur)
- RF-72 : mode lecture guidée (paramètre d'URL `?guided=1`, composant front pur)
- RF-70 : aides contextuelles d'autoring dans l'éditeur (front pur)

## Ordre des workers
W-GED (migration + API) → W-FEEDBACK → W-STATS → W-QR / W-GUIDED / W-TEMPLATE (front, parallèles entre eux).
Fusion séquentielle delta ← une branche à la fois, portes : tsc + 96 tests runtime attendus + build web.

## Contrat v5.1 — résolution des signalements (complément vague v1.4)
- Table `feedback` dédiée : `id, workflow_id, step_id, by_email, message, status ('open'|'resolved'), resolved_by, resolved_at, created_at` (migration idempotente, anciens signalements de l'audit log ne sont pas migrés)
- `GET /api/workflows/:id/feedback` (author+) → `{ id, step_id, by, message, status, resolved_by, resolved_at, at }[]` — ouverts d'abord
- `PUT /api/workflows/:id/feedback/:feedbackId/resolve` (author+) → `{ ok: true }` ; trace `feedback_resolved` dans l'audit

## Contrat C-88 — unicité du numéro + familles en recherche
- `POST /api/workflows` : la référence est unique **insensible à la casse** (`mo-001` ≡ `MO-001`, espaces trimés) — 422 `référence déjà utilisée` ; la duplication (`-COPIE`, `-COPIE-2`…) suit la même règle
- `GET /api/workflows?reference=<réf>` (reader+) → filtre **exact** `COLLATE NOCASE` — 0 ou 1 workflow ; sert à la vérification d'unicité en direct du formulaire de création
- Famille : pas de changement de contrat (texte libre) — le front propose une liste de recherche des familles existantes

# Contrat C-94 — arborescence paramétrable & documents parents (16 nov. 2026)

## Catégories (arbre 1..X niveaux, X borné à 20)

- Table `categories` : `id, parent_id (NULL = racine, REFERENCES categories ON DELETE RESTRICT), name (titre libre), slug (IMMUABLE — chemins stables), position, created_at` — unicité `(COALESCE(parent_id,0), slug)`.
- `GET /api/categories` (reader+) → `{ id, parent_id, name, slug, position }[]` **à plat**, tri `position, name` — le front reconstruit l'arbre depuis `parent_id`.
- `POST /api/categories` { name, parent_id? } (admin) → 201 — 422 si parent inconnu, slug déjà pris au même niveau ou profondeur > 20.
- `PUT /api/categories/:id` { name?, parent_id?, position? } (admin) — `parent_id: null` = passer en racine ; 422 si déplacement sous soi-même ou un de ses descendants ; le slug ne change JAMAIS au renommage.
- `DELETE /api/categories/:id` (admin) — 422 si sous-catégories ou documents rattachés (détacher d'abord) ; sinon 200 `{ ok: true }`.

## Workflows — rattachement arborescent & document parent

- Colonnes `workflows.category_id` (FK → categories, ON DELETE SET NULL) et `workflows.parent_id` (FK → workflows, ON DELETE SET NULL : supprimer le parent détache les enfants, sans cascade).
- `POST /api/workflows` et `PUT /api/workflows/:id` acceptent `category_id?: number|null` et `parent_id?: number|null` (author+) — champ absent = inchangé (PUT), `null` = détaché ; 422 si cible inconnue, auto-parentage ou liaison circulaire (remontée de la chaîne des parents, 50 sauts max).
- `GET /api/workflows` expose les deux colonnes ; filtres `?parent=<id>` (enfants directs) et `?category_id=<id>` (rattachés exacts).
- Le snapshot de publication porte `category_id`/`parent_id` (le snapshot inclut `SELECT *`) ; `GET /api/workflows/:id/versions/:number` les renvoie (`null` pour les snapshots antérieurs à C-94).
- La duplication (`POST /api/workflows/:id/duplicate`) copie les deux rattachements.

## Contrat C-96 — commentaires d'auteurs par étape (édition only)

- Table `step_comments` : `id, step_id` (FK → steps, ON DELETE CASCADE), `by_email` TEXT, `message` TEXT, `created_at` — notes de rédaction entre auteurs, jamais publiées.
- `GET /api/steps/:id/comments` (author+) → `{ id, by, message, at }[]` (ordre chronologique)
- `POST /api/steps/:id/comments` { message } (author+) → 201 — 422 si message vide après trim ou > 1000 caractères
- `DELETE /api/steps/:id/comments/:commentId` — par l'auteur du commentaire ou un admin (403 sinon)
- **Jamais dans le snapshot de publication** (publish ne les lit pas), ni exposés au lecteur, à l'export docx ou au MCP. Supprimés en cascade avec l'étape (`DELETE /api/steps/:id`).


## Contrat C-98 — chemins arborescents, exports md/json, ai_description (V13 #1-3/#5)

- `GET /api/workflows/:id` → ajoute `category_path` (slugs depuis la racine, ex. `mecanique/montage`) ; les photos portent `ai_description` (défaut ``)
- `GET /api/workflows` (liste) → chaque ligne porte `category_path` ; `GET /api/categories` → chaque catégorie porte `path` complet — **calculés à la volée, jamais stockés** (slugs immuables C-94)
- `GET /api/workflows/:id/export?format=docx|md|json&version=n` (reader+ ; docx = défaut) :
  - `md` → `text/markdown; charset=utf-8` : front matter YAML (référence, titre, version, chemin, famille, type, description, responsable, dates) + `# titre` + `## Étape n — titre` + `> Ancre : MO-xxx/etapes/n` par étape + corps + pictos (⚠ libellés) + images `![alt](/photos/filename)` + `*Description IA : …*`
  - `json` → snapshot EXACT de la version publiée (zéro perte) + bloc `meta` (GED + `category_path` + `anchors: [{ position, title, anchor }]`)
  - 404 si version introuvable ; audits `export_md` / `export_json`
- `photos.ai_description TEXT NOT NULL DEFAULT ''` (migration automatique) ; upload multipart `POST /api/steps/:stepId/photos` accepte `ai_description` (≤ 1000)
- `PUT /api/photos/:id/meta` (author+) : `{ alt?, ai_description? }` (bornes 200/1000, trim) → photo mise à jour ; 422 si aucun champ, 404 si photo inconnue ; audit `photo_meta`
- `POST /api/workflows/:id/publish` → réponse étendue `{ number, warnings: string[] }` — photos sans `ai_description` (non bloquant)
- MCP : `upload_photo` accepte `ai_description` ; nouvel outil `set_photo_description` (`photo_id`, `alt?`, `ai_description?`)

## Contrat C-97 — indications métiers paramétrables + reset de brouillon

- Settings `indications` (JSON) : liste `[{ kind, label, color }]` — seed = les 7 indications historiques (`attention`, `danger`, `epi`, `electrique`, `point-chaud`, `outil`, `info`)
- `GET /api/settings/indications` (reader+) → liste active — sert le flyout « Indications » de l'éditeur
- `PUT /api/settings/indications` (admin) → remplace la liste — 422 si 0 ou > 30 items, kind `/^[a-z0-9-]{1,40}$/` dupliqué, label vide/> 40 (trim), couleur hors `#rrggbb` ; label trimé + couleur normalisée minuscule ; audit `update_indications`
- `PUT /api/steps/:id` : les pictos en **kinds** ("epi") sont désormais **résolus en objets auto-porteurs** `{ kind, label, color }` via la liste active (kind inconnu → `{ kind, label: kind, color: "#5b7285" }`) ; les objets complets passés par l'éditeur restent inchangés. Les pictos/canvas corrompus en base ne font plus échouer `GET /api/workflows/:id` (listes vides, plus de 500)
- `POST /api/workflows/:id/reset-draft` (author+) → `{ ok: true, mode: "restored", restoredFrom: n }` si publié (brouillon = dernière version publiée) ou `{ ok: true, mode: "emptied" }` si jamais publié (purge : étapes, photos — lignes + fichiers non référencés —, commentaires d'auteurs en cascade) ; 404 si MO inconnu ; audit `reset_draft`
