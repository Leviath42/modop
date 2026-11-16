# Spéc — Arborescence, indexation IA & API publique (proposition, 16 nov. 2026)

Objectif : rendre chaque MO nativement **indexable, exportable en multi-format et consultable par une IA**, et poser l'architecture d'une **API publique utile** (GMAO, intégrateurs, Néliora). Cette spéc précède la Vague 13 de la roadmap.

## 1. Arborescence documentaire (socle)

- Arbre paramétrable **Famille > Sous-famille > Type** (table `categories` : `parent_id`, `slug`, `ordre`) — reprend la Vague 8 #3.
- **Socle livré (C-94, 16 nov. 2026)** : table `categories` (1 à X niveaux, `name` renommable, `slug` immuable), `workflows.category_id` / `parent_id`, filtre par sous-arbre, page admin `/categories`. Chemins livrés (C-98, 16 nov. 2026) : `category_path` sur GET workflow, liste workflows et catégories, dans les exports md/json — calcul à la volée (jamais stockés, donc jamais désynchronisés).
- Chaque MO rattaché à un nœud feuille ; la **référence `MO-xxx` reste l'identifiant documentaire unique**.
- `path` matérialisé par MO (ex. `mecanique/montage/pose-fusibles`) : URLs API stables, filtres arborescents, navigation facettée.

## 2. Contenu structuré — le prérequis de l'indexation

- **L'étape = l'unité d'indexation naturelle (chunk)** : id stable, position, titre, corps, pictos. Pas de découpage arbitraire.
- **Ancrage profond vérifiable** : `MO-017/etapes/3` — toute réponse d'un RAG cite une étape consultable en un clic (lien direct lecteur).
- Texte riche limité à un sous-ensemble Markdown (gras, listes) : reste exportable en Markdown natif sans conversion hasardeuse (prérequis : item « texte riche » du backlog).
- **Texte de remplacement IA des images (livré C-98, 16 nov. 2026)** : le champ `alt` existant devient « description accessible », complété par un champ optionnel `ai_description` (déclaratif, saisi par l'auteur — pas de vision automatique en v1). Servi dans tous les exports et par l'API/MCP. **Warning non bloquant à la publication si absent** : l'IA n'aura pas de description de l'image.

## 3. Exports multi-formats

Endpoint unifié : `GET /api/workflows/:id/export?format=docx|md|json|pdf&version=n` (le docx existe déjà).

| Format | Public | Contenu |
|---|---|---|
| `docx` | usine / clients | existant (composite fidèle lecteur) |
| `md` | LLM, Obsidian, GitHub, RAG | 1 fichier par MO (titres, étapes, listes, alts images, métadonnées YAML front matter) |
| `json` | API, GMAO, intégrateurs | **JSON canonique** : snapshot exact de la version + métadonnées GED + arborescence + alts — aucune perte (contrairement au docx) |
| `pdf` | usine / affichage | rendu du format lecteur (depuis le composite existant) |

Le Markdown et le JSON sont **les deux formats « adaptés API/IA »** : l'un pour les modèles de langage, l'autre pour les machines. **md et json livrés (C-98, 16 nov. 2026)** sur `GET /api/workflows/:id/export` — front matter YAML, ancres `MO-xxx/etapes/n`, descriptions IA ; json = snapshot exact + bloc `meta`. Reste : pdf.

## 4. Consultation par IA

- **Déjà livré (C-90/C-91)** : serveur MCP `/mcp` — 24 outils, instructions serveur.
- Ajouts proposés :
  - outil MCP `get_workflow_markdown` (retour Markdown direct — économie de tokens et de traduction JSON→texte pour l'agent),
  - outil MCP `export_corpus` (voir §5),
  - recherche plein texte déjà couverte par `list_workflows` (search).

## 5. Export corpus (alimentation RAG / diffusion)

- `GET /api/admin/corpus?since=<iso>` (ou CLI `modop-corpus`) : zip contenant Markdown + JSON de tous les MO publiés modifiés depuis `since`,
- + **manifest** : ids, références, chemins arborescents, versions, dates de publication, checksums — permet un **ré-embedding incrémental** sans tout recalculer,
- aucune base vectorielle dans modop v1 : le corpus alimente un moteur externe (pgvector/Qdrant côté homelab, indexation Obsidian côté publication).

## 6. API publique (activée seulement à une prod réelle stable)

- **Tokens API à périmètre** (read-only par défaut, éventuellement par famille) — même pattern que le compte service `svc-mcp` (Bearer temps constant, rôle dédié, audit).
- Endpoints : liste (paginée) + détail + export, `ETag / If-None-Match`, version figée via `?version=n`.
- Rate limit par token ; aucune donnée non publiée.
- Positionnement : **la MCP est la vitrine IA, la REST publique la vitrine GMAO/intégrateurs** — même API interne, deux canaux d'auth.

## 7. Chunking & embedding — mode d'emploi

1 chunk = 1 étape, avec métadonnées : référence, titre MO, chemin arborescent, version, ancre profonde, texte de remplacement des photos de l'étape. L'ancre garantit qu'une réponse RAG est vérifiable par un humain dans le lecteur.

## 8. Phasage (Vague 13 de la roadmap)

1. Arborescence (V13 #1) ✅ C-94 + C-98 → 2. Markdown + JSON (V13 #2/#3) ✅ C-98 → 3. alt/ai_description (V13 #5) ✅ C-98 → 4. corpus + manifest (V13 #7) → 5. outils MCP lecture IA (V13 #6) → 6. PDF (V13 #4) → 7. tokens API publics (V13 #8, seulement à prod réelle).

Chaque brique est autonome et livrable indépendamment ; l'ordre garantit que l'indexation a toujours un format stable sous elle.
