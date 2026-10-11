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
- `POST /api/workflows` { title, reference, description?, category? } → Workflow (author+)
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
