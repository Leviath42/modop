import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";

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
    auditLog(db, user.email, "publish", `workflow:${wf.id}`, `V${number}`);
    res.json({ number });
  });

  // F2 : consultation d'une version publiée précise, rendue depuis le
  // snapshot immuable (même forme de réponse que GET /api/workflows/:id).
  r.get("/:id/versions/:number", requireAuth("reader"), (req, res) => {
    const wf = db.prepare("SELECT * FROM workflows WHERE id = ?").get(Number(req.params.id)) as
      | { id: number; title: string; reference: string; description: string; category: string; family: string; state: string; current_version: number }
      | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const version = db
      .prepare("SELECT snapshot, number FROM versions WHERE workflow_id = ? AND number = ?")
      .get(wf.id, Number(req.params.number)) as { snapshot: string; number: number } | undefined;
    if (!version) {
      res.status(404).json({ error: "not_found", message: "version introuvable" });
      return;
    }
    const snap = JSON.parse(version.snapshot) as {
      workflow: { title: string; reference: string; description: string; category: string; family?: string };
      steps: { id: number; position: number; title: string; body: string; pictos: unknown[]; canvas?: unknown[]; photos: unknown[] }[];
    };
    res.json({
      id: wf.id,
      title: snap.workflow.title,
      reference: snap.workflow.reference,
      description: snap.workflow.description,
      category: snap.workflow.category,
      family: snap.workflow.family ?? "",
      state: "published",
      current_version: version.number,
      steps: snap.steps.map((s) => ({
        id: s.id,
        workflow_id: wf.id,
        position: s.position,
        title: s.title,
        body: s.body,
        pictos: s.pictos,
        canvas: s.canvas ?? [],
        photos: s.photos ?? [],
      })),
    });
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
