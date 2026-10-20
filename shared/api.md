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
