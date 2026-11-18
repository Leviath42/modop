import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";

const STATUTS = ["draft", "in_review", "validated", "obsolete"] as const;

export function statusRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/:id/status", requireAuth("reader"), (req, res) => {
    const row = db
      .prepare("SELECT editorial_status AS status, editorial_status_at AS updated_at FROM workflows WHERE id = ?")
      .get(Number(req.params.id)) as { status: string; updated_at: string | null } | undefined;
    if (!row) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    res.json(row);
  });

  r.put("/:id/status", requireAuth("author"), (req, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!(STATUTS as readonly string[]).includes(status)) {
      res.status(422).json({ error: "invalid_status", message: "statut éditorial invalide (draft, in_review, validated, obsolete)" });
      return;
    }
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(Number(req.params.id)) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const actor = (req as { user?: { email: string } }).user!;
    db.prepare("UPDATE workflows SET editorial_status = ?, editorial_status_at = datetime('now') WHERE id = ?").run(status, wf.id);
    auditLog(db, actor.email, "status_change", `workflow:${wf.id}`, status);
    const row = db
      .prepare("SELECT editorial_status AS status, editorial_status_at AS updated_at FROM workflows WHERE id = ?")
      .get(wf.id) as { status: string; updated_at: string | null };
    res.json(row);
  });

  return r;
}
