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
