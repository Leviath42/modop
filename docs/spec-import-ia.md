# Import assisté par IA — Spécification (Vague 14)

> Chantier « Import v2 ». Cadrage figé le 17 nov. 2026 (V14 #1/#2).
> Contexte : REX import FP 0262 A — l'import natif texte (C-101) produit 1 étape
> en vrac sur les fiches multi-colonnes (MO 28) ; le pipeline externe JSON+IA
> produit une structure exploitable mais avec dérive d'ordre (MO 25).

## 1. Objectif

Rendre l'import de documents existants **polyvalent** (layouts variés, fiches
industrielles multi-colonnes, PDF textuels **et scannés**) en ajoutant un
**étage IA** à l'import déterministe existant, avec un moteur IA **paramétrable**
(point d'entrée unique, n'importe quel endpoint compatible OpenAI).

## 2. Architecture — deux étages

```
document (.docx/.xlsx/.pdf)
  └─ étage 1 déterministe (C-101/C-103, inchangé) : parseurs structurels
       docx titres+images · xlsx repères/fusions/images · pdf « Étape/Phase »
  └─ étage 2 IA (nouveau, option PDF, C-109) :
       pages PDF rendues en images (pdf.js + @napi-rs/canvas, déjà présents)
       + couche texte brute en aide
       → moteur IA vision → JSON structuré **validé** → brouillon
```

L'étage 2 ne remplace pas l'étage 1 : il se demande explicitement (case
« Assister par IA » dans la modale d'import) et ne couvre que les PDF en v14
(docx/xlsx déterministes suffisants à ce jour — backlog #4).
Les images embarquées sont extraites et rattachées dans les deux modes : natif (C-112) et IA (C-113, positions des étapes par les repères numérotés de la couche texte).

## 3. Moteur IA paramétrable (C-108 + C-110)

Aucune dépendance (fetch natif — même logique supply-chain que l'import xlsx
maison). Endpoint **compatible OpenAI** `POST {base}/chat/completions` :
couvre Mistral AI, OpenAI, Ollama, vLLM, LM Studio, etc.

Depuis C-110, la configuration vit **en base** (table `settings`, clé
`ai_engine`) et s'édite dans la page **Paramètres** (admin) :

| Champ | Rôle |
|---|---|
| Activé | toggle — `false` VERROUILLE l'import IA sans retirer la configuration |
| Endpoint (base URL) | racine API (ex. `https://api.mistral.ai/v1`) |
| Modèle | vision requise pour les PDF |
| Clé API | stockée côté serveur, **jamais renvoyée** (seul `key_set` est exposé) ; champ vide = inchangée, case « effacer » = retirée |
| Timeout | 5 à 600 s (défaut 90 s) |

L'environnement `MODOP_AI_*` (BASE_URL, MODEL, API_KEY, TIMEOUT_MS) reste le
**repli** tant qu'aucune config n'est enregistrée — la base prime.

API : `GET /api/ai` (author+, état sans secret) ; `PUT /api/ai/config`
(admin, validation, audit `ai_config`) ; `POST /api/ai/test`
(ping réel « réponds OK », latence, audit `ai_test`, rate-limit 6/10 min).
UI : carte « Moteur IA » de la page Paramètres — formulaire éditable (C-110).

## 4. Import PDF assisti (C-109)

`POST /api/import/document` avec champ form `ai=1` (author+) :

1. **Garde-fous d'entrée** : PDF uniquement (422 sinon) ; moteur configuré
   (422 sinon, message actionnable) ; rate-limit 5/10 min/IP ; 20 Mo.
2. **Rendu** : ≤ 10 pages, échelle 1,5, JPEG q=0,75 (fond blanc), via pdf.js
   legacy + @napi-rs/canvas. La couche texte est extraite aussi (si présente)
   et jointe en aide — un PDF **scanné** devient importable (l'OCR est fait
   par le modèle vision, lève le refus 422 de C-101).
3. **Prompt strict** : recopier **verbatim** (fautes incluses), ne jamais
   inventer, s'appuyer sur les **numéros d'étapes visibles dans le document**,
   incertitudes → `a_completer`, pictos parmi les indications métiers
   paramétrables (C-97) si le document le justifie.
4. **Validation** (anti-dérive, le cœur du REX MO 25) : JSON borné ;
   **tri final PAR NUMÉRO DE LA SOURCE**, jamais l'ordre du modèle ; pictos
   filtrés sur la liste paramétrée ; doublons/absence de numéros → ordre
   d'arrivée + warning « ordre à vérifier ».
5. **Création** : brouillon uniquement (RF-78, jamais de publication), même
   transaction que l'étage 1 ; description « Import assisté par IA … À
   RELIRE » ; les `a_completer` deviennent des **commentaires d'auteurs**
   (C-96) « À COMPLÉTER (import IA) : … » sur l'étape concernée ; audit
   `import_ai` (modèle + nb d'étapes).
6. **Angles morts assumés v14** : pas d'extraction des images embarquées du
   PDF (photos à ajouter depuis l'éditeur — backlog #3) ; coût/latence d'un
   appel vision par import ; le front attend la réponse (pas de job async).

## 5. Garde-fous transverses

- Aucune clé en base, dans les logs ou les réponses API.
- Erreurs moteur : 502/504 typés, message court sans corps brut du moteur.
- Toute la chaîne testée en runtime avec un **faux moteur OpenAI en loopback**
  (tests serveur) — pas de dépendance externe en CI.

## 6. Backlog (v14+)

| # | Item | Notes |
|---|---|---|
| 3 | Extraction déterministe des **images embarquées** du PDF + association position ↔ étape | ✅ livré (C-112, 17 nov. 2026) — étage 1bis sans IA : matrice pdf.js, JPEG, filtres scan/picto, rattachement à l'étape la plus proche |
| 4 | Mode IA pour **docx/xlsx** | réutiliser la couche images/repères existante |
| 5 | Extraction positionnelle pdf.js (blocs par colonnes) pour renforcer l'étage 1 sans IA | le tri par numéro reste le garde-fou |
| 6 | Job asynchrone + notification | si les imports dépassent ~60 s en pratique |
| 7 | Associer les images extraites (C-112) au mode IA (C-109) | ✅ livré (C-113, 17 nov. 2026) — positions des étapes par repères numérotés de la couche texte |
