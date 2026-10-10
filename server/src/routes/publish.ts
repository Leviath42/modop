import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";

interface SnapshotStep {
  id: number;
  position: number;
  title: string;
  body: string;
  pictos: string[];
  photos: { id: number; filename: string; alt: string }[];
}

export function publishRouter(db: Database.Database): Router {
  const r = Router();

  r.post("/:id/publish", requireAuth("author"), (req, res) => {
    const wf = db
      .prepare("SELECT * FROM workflows WHERE id = ?")
      .get(Number(req.params.id)) as { id: number; current_version: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const user = (req as { user?: { email: string } }).user!;
    const steps = db
      .prepare("SELECT * FROM steps WHERE workflow_id = ? ORDER BY position")
      .all(wf.id) as { id: number; position: number; title: string; body: string; pictos: string }[];
    if (steps.length === 0) {
      res.status(422).json({ error: "validation", message: "impossible de publier sans étape" });
      return;
    }
    const snapshot = {
      workflow: db.prepare("SELECT * FROM workflows WHERE id = ?").get(wf.id),
      steps: steps.map((s) => ({
        id: s.id,
        position: s.position,
        title: s.title,
        body: s.body,
        pictos: JSON.parse(s.pictos),
        photos: db.prepare("SELECT id, filename, alt FROM photos WHERE step_id = ?").all(s.id),
      })) as SnapshotStep[],
    };
    const number = wf.current_version + 1;
    const tx = db.transaction(() => {
      db.prepare(
        "INSERT INTO versions (workflow_id, number, snapshot, author_email) VALUES (?, ?, ?, ?)"
      ).run(wf.id, number, JSON.stringify(snapshot), user.email);
      db.prepare(
        "UPDATE workflows SET state = 'published', current_version = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(number, wf.id);
    });
    tx();
    res.json({ number });
  });

  r.get("/:id/versions", requireAuth("reader"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(Number(req.params.id)) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const rows = db
      .prepare(
        "SELECT id, workflow_id, number, author_email, published_at FROM versions WHERE workflow_id = ? ORDER BY number DESC"
      )
      .all(wf.id);
    res.json(rows);
  });

  return r;
}
