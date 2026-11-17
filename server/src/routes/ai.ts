import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { rateLimiter } from "../auth/security.js";
import { aiTestConnection, aiStatus, AiError, DEFAULT_AI_TIMEOUT_MS } from "../lib/ai/client.js";

// C-108 (V14 #1) — état du moteur IA et test de connexion.
// GET /api/ai (author+) : statut SANS secret (seul key_set booléen est
// exposé) — les auteurs voient si l'import IA est disponible.
// POST /api/ai/test (admin) : ping réel du moteur (« réponds OK »), latence, audit.
//
// C-110 (V14 #3) — PUT /api/ai/config (admin) : configuration éditable depuis
// la page Paramètres. Toggle « enabled » qui VERROUILLE l'option sans retirer
// la config (demande explicite). La base (settings « ai_engine ») est la
// référence ; l'env MODOP_AI_* reste le repli tant que rien n'est en base.
// Convention clé : absente du payload → inchangée, "" → effacée, valeur →
// remplacée. La clé n'est JAMAIS renvoyée (key_set booléen), JAMAIS loguée
// (l'audit ne trace que sa présence).

const SETTINGS_KEY = "ai_engine";

export function aiRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/", requireAuth("author"), (_req, res) => {
    res.json(aiStatus(db));
  });

  r.put("/config", requireAuth("admin"), (req, res) => {
    const p = (req.body ?? {}) as Record<string, unknown>;
    const enabled = p.enabled === true;
    const baseUrl = typeof p.base_url === "string" ? p.base_url.trim().replace(/\/+$/, "").slice(0, 500) : "";
    const model = typeof p.model === "string" ? p.model.trim().slice(0, 200) : "";
    const timeout = typeof p.timeout_ms === "number" && Number.isFinite(p.timeout_ms) ? Math.round(p.timeout_ms) : DEFAULT_AI_TIMEOUT_MS;

    if (baseUrl) {
      try {
        const u = new URL(baseUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("proto");
      } catch {
        res.status(422).json({ error: "validation", message: "base_url invalide (URL http/https attendue)" });
        return;
      }
    }
    if (timeout < 5000 || timeout > 600000) {
      res.status(422).json({ error: "validation", message: "timeout_ms doit être entre 5000 et 600000" });
      return;
    }
    if (p.api_key !== undefined && typeof p.api_key !== "string") {
      res.status(422).json({ error: "validation", message: "api_key invalide" });
      return;
    }
    if (!enabled && !baseUrl && !model) {
      // Autorisé : formulaire vidé + toggle off = remise à zéro volontaire.
    }

    // Convention clé : absente → conservée, "" → effacée, valeur → remplacée.
    const prev = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value: string } | undefined;
    let prevKey = "";
    if (prev) {
      try {
        const s = JSON.parse(prev.value) as { api_key?: unknown };
        if (typeof s.api_key === "string") prevKey = s.api_key.slice(0, 500);
      } catch {
        // config corrompue : on repart de zéro
      }
    }
    const nextKey = p.api_key === undefined ? prevKey : (p.api_key as string).trim().slice(0, 500);

    const value = JSON.stringify({ enabled, base_url: baseUrl, model, api_key: nextKey, timeout_ms: timeout });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
      SETTINGS_KEY,
      value
    );

    const actor = (req as { user?: { email: string } }).user?.email ?? "?";
    auditLog(
      db,
      actor,
      "ai_config",
      "ai",
      (enabled ? "activé" : "désactivé") +
        " · " + (baseUrl || "(vide)") +
        " · " + (model || "(vide)") +
        " · timeout " + timeout + " ms" +
        " · clé " + (nextKey ? "présente" : "absente")
    );
    res.json(aiStatus(db));
  });

  const testLimit = rateLimiter("ai-test", 10 * 60_000, 6);
  r.post("/test", requireAuth("admin"), testLimit, async (req, res) => {
    const t0 = Date.now();
    try {
      const out = await aiTestConnection(db);
      const ok = out.ok;
      auditLog(
        db,
        (req as { user?: { email: string } }).user?.email ?? "?",
        "ai_test",
        "ai",
        aiStatus(db).model + " " + (Date.now() - t0) + " ms" + (ok ? " ok" : " ko")
      );
      res.json(out);
    } catch (e) {
      const status = e instanceof AiError ? e.status : 502;
      res.status(status).json({ error: "ai", message: e instanceof Error ? e.message : "erreur moteur IA" });
    }
  });

  return r;
}
