import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { rateLimiter } from "../auth/security.js";
import { aiChat, aiStatus, AiError } from "../lib/ai/client.js";

// C-108 (V14 #1) — état du moteur IA et test de connexion.
// GET /api/ai (author+) : statut SANS secret (seul key_set booléen est
// exposé) — les auteurs voient si l'import IA est disponible.
// POST /api/ai/test (admin) : ping réel du moteur (« réponds OK »), latence, audit.

export function aiRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/", requireAuth("author"), (_req, res) => {
    res.json(aiStatus());
  });

  const testLimit = rateLimiter("ai-test", 10 * 60_000, 6);
  r.post("/test", requireAuth("admin"), testLimit, async (req, res) => {
    const t0 = Date.now();
    try {
      const reply = (await aiChat({ system: "Réponds exactement OK, rien d'autre.", user: "ping" })).trim();
      const ok = /^ok\b/i.test(reply);
      auditLog(
        db,
        (req as { user?: { email: string } }).user?.email ?? "?",
        "ai_test",
        "ai",
        aiStatus().model + " " + (Date.now() - t0) + " ms" + (ok ? " ok" : " ko")
      );
      res.json({ ok, latency_ms: Date.now() - t0, reply: reply.slice(0, 100) });
    } catch (e) {
      const status = e instanceof AiError ? e.status : 502;
      res.status(status).json({ error: "ai", message: e instanceof Error ? e.message : "erreur moteur IA" });
    }
  });

  return r;
}
