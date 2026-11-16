// Route MCP /mcp (C-90) : StreamableHTTP stateless — un transport
// neuf par requête POST (sessionIdGenerator: undefined), pas d'état
// entre requêtes. GET/DELETE → 405 : pas de canal SSE dédié.
// Auth : Bearer MODOP_MCP_TOKEN en comparaison à temps constant.
import crypto from "node:crypto";
import express from "express";
import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpEnabled, MODOP_MCP_TOKEN } from "./config.js";
import { ensureServiceAccount } from "./bootstrap.js";
import { ModopClient } from "./modop-client.js";
import { registerModopTools } from "./tools.js";

// Instructions servies à l'initialize (C-91) : la carte du domaine pour un
// agent qui découvre Modop sans en avoir fait la mise en place.
const MCP_INSTRUCTIONS = `Vous pilotez Modop, une GED de modes opératoires industriels. Vous agissez avec le compte de service svc-mcp (rôle author : tout sauf admin).

Concepts :
- Un mode opératoire (workflow) = title + reference unique (insensible à la casse) + métadonnées GED : catégorie, famille, date de prochaine revue (AAAA-MM-JJ), responsable (owner_email : choisir parmi les comptes actifs, voir list_users).
- Cycle de vie : brouillon → publish_workflow fige une version immuable (V1, V2…) avec un changelog ; les lecteurs ne voient que la dernière version publiée ; restore_version ramène une version publiée en brouillon de travail.
- Un workflow contient des étapes ordonnées (create_step les ajoute en fin ; reorder_steps réordonne tout) ; chaque étape peut porter des photos (upload_photo : base64 JPEG/PNG/WebP, 15 Mo max) et des annotations vectorielles (annotate_photo).
- Les opérateurs signalent des problèmes via des retours terrain (send_feedback) ; un author les traite puis les clôt (resolve_feedback).

Conventions : identifiants = entiers ; dates = AAAA-MM-JJ ; les erreurs indiquent le statut HTTP et le message serveur exact — corrigez-vous avec.

Non couvert : rognage, mise en page et remplacement de photo (spécifiques à l'éditeur web).

Recette pour créer un MO complet : create_workflow → create_step (× N) → upload_photo (optionnel) → publish_workflow avec changelog.`;

// Client loopback unique pour tous les appels d'outils : une seule session
// HTTP (re-login sur 401 dans ModopClient). Un client neuf par requête
// ferait un login API à chaque appel MCP et percuterait le rate limiter
// de /api/auth/login (10/fenêtre).
const modopClient = new ModopClient();

export function mcpRouter(db: Database.Database): express.Router {
  const r = express.Router();

  if (mcpEnabled()) {
    ensureServiceAccount(db);
  }

  const checkToken = (req: express.Request, res: express.Response): boolean => {
    const expected = MODOP_MCP_TOKEN();
    const header = req.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      res.status(401).json({ error: "unauthorized", message: "token MCP invalide ou absent" });
      return false;
    }
    return true;
  };

  r.use((req, res, next) => {
    if (!mcpEnabled()) {
      res.status(501).json({ error: "disabled", message: "serveur MCP désactivé (MODOP_MCP_TOKEN absent)" });
      return;
    }
    if (!checkToken(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed", message: "POST uniquement (stateless)" });
      return;
    }
    next();
  });

  r.use(async (req, res) => {
    // Serveur + transport neufs à chaque requête : zéro état partagé.
    const server = new McpServer(
      { name: "modop", version: process.env.npm_package_version ?? "1.0.0" },
      { instructions: MCP_INSTRUCTIONS },
    );
    registerModopTools(server, modopClient);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void server.close();
    });
    await server.connect(transport);
    // express.json() a déjà parsé le corps : on le repasse au transport.
    await transport.handleRequest(req, res, req.body);
  });

  return r;
}
