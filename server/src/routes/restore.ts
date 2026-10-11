import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";

interface SnapshotPhoto {
  filename: string;
  alt: string;
  annotations?: unknown[];
}

interface SnapshotStep {
  id: number;
  position: number;
  title: string;
  body: string;
  pictos: unknown[];
  photos: SnapshotPhoto[];
}

export function restoreRouter(db: Database.Database): Router {
  const r = Router();

  r.post("/:id/versions/:number/restore", requireAuth("author"), (req, res) => {
    const wf = db
      .prepare("SELECT id, current_version FROM workflows WHERE id = ?")
      .get(Number(req.params.id)) as { id: number; current_version: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const version = db
      .prepare("SELECT snapshot FROM versions WHERE workflow_id = ? AND number = ?")
      .get(wf.id, Number(req.params.number)) as { snapshot: string } | undefined;
    if (!version) {
      res.status(404).json({ error: "not_found", message: "version introuvable" });
      return;
    }
    const snap = JSON.parse(version.snapshot) as {
      steps: SnapshotStep[];
    };
    const actor = (req as { user?: { email: string } }).user!;
    const tx = db.transaction(() => {
      // Remplacement complet des étapes par celles du snapshot.
      // Les photos référencent les fichiers existants (partagés avec le
      // snapshot lui-même : jamais supprimés tant qu'une version existe).
      db.prepare("DELETE FROM photos WHERE step_id IN (SELECT id FROM steps WHERE workflow_id = ?)").run(wf.id);
      db.prepare("DELETE FROM steps WHERE workflow_id = ?").run(wf.id);
      for (const step of snap.steps) {
        const info = db
          .prepare("INSERT INTO steps (workflow_id, position, title, body, pictos) VALUES (?, ?, ?, ?, ?)")
          .run(wf.id, step.position, step.title, step.body, JSON.stringify(step.pictos ?? []));
        for (const ph of step.photos ?? []) {
          db.prepare("INSERT INTO photos (step_id, filename, alt, annotations) VALUES (?, ?, ?, ?)").run(
            info.lastInsertRowid,
            ph.filename,
            ph.alt,
            JSON.stringify(ph.annotations ?? [])
          );
        }
      }
      db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = ?").run(wf.id);
    });
    tx();
    auditLog(db, actor.email, "restore_version", `workflow:${wf.id}`, `V${req.params.number}`);
    res.json({ ok: true, steps: snap.steps.length, restoredFrom: Number(req.params.number) });
  });

  return r;
}
