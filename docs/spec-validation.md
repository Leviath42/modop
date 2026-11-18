# Spécification — Cycle éditorial : validation & relecture (Vague 17)

*Lançée le 18 nov. 2026 (décision propriétaire). Ferme le cycle documentaire : le dernier gros bloc fonctionnel V7 #1 + le reste UI de V8 #2 (API statut éditorial livrée en V16).*

## But

Un rédacteur prépare un MO, demande une relecture, un relecteur commente, valide, puis la publication (verrouillable) passe. Sans casser l'usage solo : **rien n'est bloquant par défaut**.

## Choix de conception (actés)

- **Pas de rôle « relecteur » dédié** : les rôles existants suffisent (relecteur = author ≠ rédacteur, souvent admin). Le workflow vit dans le statut éditorial V16 (draft / in_review / validated / obsolete), pas dans un nouvel état machine.
- **Pas de notification sortante** (email/push) : le fil de relecture et le badge liste suffisent ; modop n'a pas de canal d'alerte.
- **Verrou de publication paramétrable, désactivé par défaut** : homelab = un seul rédacteur, l'imposer serait une dette d'usage.
- **Commentaires de relecture au niveau du MO** (pas par étape) : le menu plus fin existe déjà (step_comments C-96) ; un verdict porte sur le document entier.
- **Jamais publiés, jamais exportés** : hors snapshot, lecteur, docx/PDF/md/json, corpus et MCP de lecture.

## Briques et contrat

### B1 — Commentaires de relecture (serveur)
- Table `review_comments` : `id`, `workflow_id` (FK CASCADE), `author_email`, `body`, `created_at`.
- Bornes : `body` trim, non vide, ≤ 1000 caractères (même discipline que step_comments).
- Routes (toutes `author+`) :
  - `GET /api/workflows/:id/review-comments` → liste chronologique `[{id, author_email, body, created_at}]` ;
  - `POST /api/workflows/:id/review-comments` `{body}` → 201 + commentaire ;
  - `DELETE /api/workflows/:id/review-comments/:cid` → 204, **par son auteur ou un admin uniquement** ;
  - workflow inexistant → 404.
- Audit : `review_comment_add` / `review_comment_delete`.

### B2 — Verrou de publication (serveur)
- Setting `review_policy` (table `settings`, JSON) : `{ "require_validated": false }` par défaut.
- `GET /api/settings/review-policy` (`author+` : le front de publication doit connaître l'état) ; `PUT /api/settings/review-policy` (`admin+`) → 422 si payload invalide.
- Publication : si `require_validated` **et** `editorial_status != validated` → `422 { error: "validation_required" }` avec message actionnable. Sinon comportement inchangé (warnings photo existants).
- Passer la publication n'altère pas le statut éditorial (un MO peut repasser en relecture pour la V suivante).

### B3 — Outil MCP `set_editorial_status` (serveur)
- 27e outil : `set_editorial_status(workflow_id, status)` → appel loopback `PUT /api/workflows/:id/status` (rôle author du compte service). Mêmes bornes (`draft|in_review|validated|obsolete`), même audit. Cohérent avec le pipeline IA de C-90.

### B4 — UI éditeur (front)
- Barre sticky : **sélecteur « Statut éditorial »** (4 valeurs, PUT `/status`, author+ ; dégradation propre si 403).
- Bouton **« Demander une relecture »** : passe `in_review` puis ouvre le panneau de commentaires.
- **Panneau « Relecture »** repliable : fil des commentaires (chrono, auteur, date), champ d'ajout, suppression si autorisé, état vide explicite.
- Publication : `422 validation_required` → **encart d'erreur dédié** sur la modale (message : faire passer le MO en « Validé »), pas de toast générique.
- Liste : rien à faire (badge + filtre statut livrés en V16).

## Non-buts (assumés)
- Écrans de relecture dédiés (boîte de réception du relecteur) : le filtre liste `?editorial_status=in_review` suffit.
- Modèle relecteur/approbateur persistant ou signature électronique : hors périmètre.
- Verrou activé d'office, dates de relecture, statistiques de cycle : non mesuré utile pour l'instant.

## Tests d'acceptation
- Runtime serveur : GET/POST/DELETE commentaires (bornes, 404, rôles, cascade purge), verrou publication off/on (422 + passage après `validated`), MCP `set_editorial_status` (ok + statut invalide), statut jamais dans snapshot/exports.
- Front existant : aucun régression (typecheck + tests + lint).
- Nombre : suite serveur 191+ puis pages modifiées à T0 avant/après (anti-édition schema V16).
