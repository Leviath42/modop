# Connecteur MCP — serveur natif Modop (C-90)

Modop embarque un **serveur MCP** (Model Context Protocol) qui permet à un agent IA (Claude Desktop, Vibe, autre client MCP) de lire et piloter les modes opératoires avec les mêmes droits et garde-fous qu'un utilisateur humain.

**Point d'entrée** : `POST /mcp` — transport **Streamable HTTP stateless** (un transport neuf par requête, pas de session MCP ni de canal SSE dédié : `GET`/`DELETE` → 405). Aucun état entre requêtes, déployé comme le reste de l'app par `update.sh`.

## Architecture

```
Client MCP (agent IA)                  Modop (même process Express)
   │ Bearer MODOP_MCP_TOKEN                    │
   ├──────────── POST /mcp ───────────────►  mcp/route.ts (auth + transport)
   │                                          │ registerModopTools()
   │                                          │ ModopClient (singleton, session HTTP)
   │                                          ▼
   │                                  API REST interne (127.0.0.1:PORT)
   │                                          ▼
   │                                  Validations métier identiques :
   │                                  C-88, magic numbers photos, rate
   │                                  limits, audit, rôles
```

- **Zéro duplication de logique métier** : les outils MCP appellent l'API REST en **loopback HTTP** (`http://127.0.0.1:PORT`, posé par `setMcpBaseUrl()` après `listen()`). Toute validation ajoutée à l'API s'applique de facto au MCP.
- **Client singleton** : une seule session HTTP (login + cookie `modop_session`, re-login unique sur 401) — un client neuf par requête ferait un login à chaque appel et percuterait le rate-limiter login (10/15 min par IP+email).

## Authentification

- **Côté MCP** : header `Authorization: Bearer <MODOP_MCP_TOKEN>`, comparaison à **temps constant**. Sans token → 501 (serveur désactivé) ; token invalide → 401.
- **Côté API** : les outils agissent comme le **compte de service `svc-mcp`**, créé/synchronisé au démarrage depuis l'env (pattern `seed.ts` — l'env est la source de vérité ; seul le hash bcrypt du mot de passe vit en base). Rôle par défaut : `author` (moindre privilège — pas d'admin : `get_stats` renvoie 403, pas de gestion des comptes).
- Tout est tracé dans le journal d'audit existant (acteur `svc-mcp@…`).

### Variables d'environnement

| Variable | Effet | Absente |
|---|---|---|
| `MODOP_MCP_TOKEN` | Active le serveur ; secret Bearer attendu (≥ 32 octets aléatoires conseillés) | serveur **désactivé** (501) |
| `MODOP_MCP_EMAIL` | Email du compte de service | serveur désactivé |
| `MODOP_MCP_PASSWORD` | Mot de passe du compte de service (rotation = changer l'env + restart) | serveur désactivé |
| `MODOP_MCP_ROLE` | Rôle du compte (`author` par défaut) | `author` |

Générer les secrets : `openssl rand -base64 32`. **Jamais dans le repo** — uniquement dans le `.env` du CT.

À l'initialize, le serveur renvoie des **instructions** (carte du domaine : concepts, conventions, recette de création d'un MO complet, périmètre non couvert) — un agent qui découvre Modop les reçoit automatiquement.

## Outils exposés (27)

**Session** : `whoami`

**Modes opératoires** : `list_workflows` (recherche texte, catégorie, famille, état, revues en retard, référence exacte nocase, tri) · `get_workflow` · `create_workflow` · `update_workflow` · `delete_workflow` · `duplicate_workflow`

**Publication / versions** : `publish_workflow` · `list_versions` · `get_version` · `restore_version` · `set_editorial_status` (V17 : statut éditorial draft / in_review / validated / obsolete — boucle de validation)

**Étapes** : `create_step` · `update_step` · `delete_step` · `reorder_steps`

**Photos** : `upload_photo` (base64 → multipart ; JPEG/PNG/WebP, magic numbers vérifiés par l'API) · `delete_photo` · `annotate_photo` (formes du canevas, 500 max)

**Export** : `export_docx` (binaire base64, signature ZIP `PK` vérifiée avant renvoi) · `get_workflow_markdown` (markdown brut, économie de tokens — C-105) · `export_corpus` (zip md+json + manifest sha256, ré-embedding incrémental — C-105)

**Retours terrain** : `send_feedback` · `list_feedbacks` · `resolve_feedback`

**Comptes** : `list_users` (actifs — pour renseigner `owner_email`) · `get_stats` (admin uniquement — 403 pour `author`, erreur explicite)

**Non couverts** (spécifiques à l'éditeur, pas pertinents pour un agent) : rognage photo (`PUT /photos/:id/file`), mise en page (`layout`), remplacement de binaire.

Les réponses d'erreur de l'API sont converties en **erreurs d'outils MCP** avec le message serveur (ex. `modop : création du mode opératoire a échoué (HTTP 422) — title et reference requis`).

## Utilisation

### Test direct (curl)

```bash
curl -X POST https://modop-beta.calironi.com/mcp \\
  -H "Authorization: Bearer $MODOP_MCP_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

### Client MCP (ex. Claude Desktop / tout client Streamable HTTP)

```json
{
  "mcpServers": {
    "modop": {
      "type": "http",
      "url": "https://modop-beta.calironi.com/mcp",
      "headers": { "Authorization": "Bearer <MODOP_MCP_TOKEN>" }
    }
  }
}
```

Le tunnel Cloudflare existant (`modop-beta.calironi.com`) route `/mcp` comme le reste — aucune configuration supplémentaire côté ingress.

## Sécurité — angles morts assumés

- Le token MCP est **totale** : quiconque le possède peut lire et écrire tous les MO non publiés aussi. Rotation simple (env + restart).
- Pas de limitation de périmètre par MO (un futur `scope` par token est possible, non implémenté — aucune demande à ce jour).
- `assertSameOrigin` : les requêtes MCP n'ont pas d'`Origin` — accepté (règle préexistante pour curl/tests), la protection CSRF n'est pas le modèle de menace du Bearer.
- Rate limit feedback (20/15 min) partagé avec les humains derrière le tunnel — un agent bavaud verra des 429, c'est voulu.

## Fichiers

| Fichier | Rôle |
|---|---|
| `server/src/mcp/config.ts` | Accès env + base URL loopback |
| `server/src/mcp/bootstrap.ts` | Upsert du compte `svc-mcp` au démarrage |
| `server/src/mcp/modop-client.ts` | Client loopback (login, re-login 401, multipart, binaire) |
| `server/src/mcp/tools.ts` | 27 outils (zod, erreurs explicites) |
| `server/src/mcp/route.ts` | Router Express `/mcp` (Bearer constant-time, stateless) |
| `server/test/mcp.test.ts` | E2E : client SDK réel, cycle complet |
