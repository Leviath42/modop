# Spéc — Preuve de formation & habilitation (Vague 11, proposition à valider)

*Rédigée le 17 nov. 2026 pour arbitrage propriétaire — « à spécifier avant code »
(roadmap V11). Objectif : faire passer modop de la consultation de MO à la
preuve de formation — argument habilitation / ISO 9001, mesure concrète pour le
dossier de création de poste (taux de réussite, temps d'habilitation). Réutilise
l'existant : rôles, snapshot versionné, journal d'audit, stats admin.*

## 1. Modèle de données

- Table `quiz_questions` : `id`, `workflow_id` (FK), `scope` (`mo` | `step`), `step_id` (nullable), `kind` (`single` = choix unique en v1), `prompt` (≤500), `choices` (JSON, 2-5), `answer_index`, `explanation` (optional), `position`.
- Table `quiz_attempts` : `id`, `workflow_id`, `version_number`, `user_email`, `kind` (`pre` | `post`), `score`, `max_score`, `passed` (selon seuil), `duration_s`, `created_at` — **immuable** : aucune route de modification/suppression côté lecteur ; l'admin peut purger (GDPR) avec audit.
- **Versionnement** : les questions vivent dans le **snapshot de publication** (`quiz` porté par `versions.snapshot` comme `pictos`/`canvas`) — Vn immuable = quiz immuable ; une tentative référence toujours `workflow_id + version_number` ; publier une nouvelle version impose de re-valider l'acquis (les scores restent liés à leur version).
- Brouillon : les questions courantes sont éditables (`quiz_questions`), figées au publish (copiées dans le snapshot). Restore d'une version restaure le quiz de cette version dans le brouillon ? **Non** (choix) : restore restaure étapes/photos comme aujourd'hui, le quiz du brouillon n'est pas écrasé — à arbitrer.

## 2. Contrat API (figé dans `shared/api.md` avant implémentation)

- `GET /api/workflows/:id/quiz` (reader+) : questions du snapshot de la version publiée (réponses **exclues**).
- `POST /api/workflows/:id/quiz/attempts` (reader+) : `{ kind, answers: [{ question_id, choice_index }] }` → score, passed, explications. Rate limit par utilisateur/workflow/version (ex. 5 pré + 5 post / 24 h — bornes à figer).
- `GET /api/workflows/:id/quiz/attempts/me` (reader+) : mes tentatives (scores par version).
- `GET /api/admin/quiz/stats?workflow_id=` (admin) : taux de réussite par MO / opérateur / version, temps moyen, échecs.
- `GET /api/admin/quiz/attempts?workflow_id=&user=` (admin, export CSV) : audit habilitation.
- Éditeur (author+) : `POST/PUT/DELETE /api/workflows/:id/quiz/questions` (brouillon), bornes trim/longueur.
- Publication : `warnings` non bloquants si quiz actif sans question ; `quiz_active` = option par MO (`require_pre`/`require_post`, `pass_threshold` paramétrable, défaut 80 %).

## 3. Front

- Lecteur : écran pré-quiz (si `require_pre`) avant la première lecture ; post-quiz à la fin (ou par étape — v1 : global) ; correction immédiate avec explication ; badge « Acquis V2 » sur le MO tant que non revalidé.
- Éditeur : onglet Quiz à côté des étapes (author) : questions par MO/étape, réordonnancement, activation.
- Admin : page stats existante + tableau quiz.

## 4. Phasage (briques autonomes)

1. **Brique 1 — socle + traçabilité** (V11 #1/#3/#5) : tables, snapshot, routes essai, éditeur minimal, immuabilité, audit. Critère : tentative enregistrée jamais modifiable côté lecteur ; publication → scores par version.
2. **Brique 2 — stats & export admin** (V11 #4) : stats + CSV habilitation. Critère : taux par opérateur/version exportable.
3. **Brique 3 — expérience guidée** (V11 #2) : pré/post-quiz dans le lecteur, badges acquis, seuils. Critère : un opérateur neuf passe pré → lit → post → badge.

## 5. Anti-triche minimal (assumé v1)

Ordre des questions et des choix aléatoire, tentatives limitées par jour, score affiché après validation complète. Pas de surveillance (webcam/timeout) — hors périmètre.

## 6. Angles morts à arbitrer avant code

- Restore & quiz (cf. §1) : écraser ou non le brouillon.
- `pre`-quiz **bloquant** ou informatif ? (proposition : informatif en v1).
- Tentatives post illimitées vs plafond (proposition : plafonnées, l'admin voit tout).
- RGPD : durée de rétention des tentatives (proposition : 3 ans).
- MCP : outil `get_quiz_stats` utile ? (proposition : non en v1).
