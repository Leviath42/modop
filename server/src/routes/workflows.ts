import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";

export interface StepRow {
  id: number;
  workflow_id: number;
  position: number;
  title: string;
  body: string;
  pictos: string;
}

// Contrat de l’API : pictos est un tableau (comme GET /api/workflows/:id),
// jamais la chaîne JSON brute de la colonne steps.pictos.
function pictosArray(row: unknown): Omit<StepRow, "pictos"> & { pictos: string[] } {
  const step = row as StepRow;
  return { ...step, pictos: JSON.parse(step.pictos) };
}

export function workflowRouter(db: Database.Database): Router {
  const r = Router();

  r.post("/", requireAuth("author"), (req, res) => {
    const { title, reference, description, category, family } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || typeof reference !== "string" || !reference.trim()) {
      res.status(422).json({ error: "validation", message: "title et reference requis" });
      return;
    }
    const exists = db.prepare("SELECT 1 FROM workflows WHERE reference = ?").get(reference.trim());
    if (exists) {
      res.status(422).json({ error: "validation", message: "référence déjà utilisée" });
      return;
    }
    const info = db
      .prepare("INSERT INTO workflows (title, reference, description, category, family) VALUES (?, ?, ?, ?, ?)")
      .run(title.trim(), reference.trim(), description ?? "", category ?? "", family ?? "");
    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "create_workflow", `workflow:${info.lastInsertRowid}`, reference.trim());
    const wf = db.prepare("SELECT * FROM workflows WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(wf);
  });

  r.get("/:id", requireAuth("reader"), (req, res) => {
    const wf = db.prepare("SELECT * FROM workflows WHERE id = ?")
      .get(req.params.id) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const steps = db
      .prepare("SELECT * FROM steps WHERE workflow_id = ? ORDER BY position")
      .all(wf.id) as StepRow[];
    const photosByStep = new Map<number, unknown[]>();
    for (const s of steps) {
      photosByStep.set(
        s.id,
        (db.prepare("SELECT * FROM photos WHERE step_id = ?").all(s.id) as { id: number; filename: string; alt: string; annotations: string }[]).map((ph) => ({
          ...ph,
          annotations: JSON.parse(ph.annotations ?? "[]"),
        }))
      );
    }
    res.json({
      ...wf,
      steps: steps.map((s) => ({ ...s, pictos: JSON.parse(s.pictos), photos: photosByStep.get(s.id) })),
    });
  });

  r.put("/:id", requireAuth("author"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(req.params.id) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const { title, description, category, family } = req.body ?? {};
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      res.status(422).json({ error: "validation", message: "title invalide" });
      return;
    }
    db.prepare(
      `UPDATE workflows SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         category = COALESCE(?, category),
         family = COALESCE(?, family),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(title?.trim() ?? null, description ?? null, category ?? null, family ?? null, wf.id);
    res.json(db.prepare("SELECT * FROM workflows WHERE id = ?").get(wf.id));
  });

  r.delete("/:id", requireAuth("author"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(req.params.id) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    db.prepare("DELETE FROM workflows WHERE id = ?").run(wf.id);
    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "delete_workflow", `workflow:${wf.id}`);
    res.json({ ok: true });
  });

  r.post("/:id/steps", requireAuth("author"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(req.params.id) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const { title, body } = req.body ?? {};
    if (typeof title !== "string" || !title.trim()) {
      res.status(422).json({ error: "validation", message: "title requis" });
      return;
    }
    const max = db
      .prepare("SELECT COALESCE(MAX(position), -1) p FROM steps WHERE workflow_id = ?")
      .get(wf.id) as { p: number };
    const info = db
      .prepare("INSERT INTO steps (workflow_id, position, title, body) VALUES (?, ?, ?, ?)")
      .run(wf.id, max.p + 1, title.trim(), body ?? "");
    db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = ?").run(wf.id);
    res.status(201).json(pictosArray(db.prepare("SELECT * FROM steps WHERE id = ?").get(info.lastInsertRowid)));
  });

  r.put("/:id/steps/reorder", requireAuth("author"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(req.params.id) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds) || !orderedIds.every((x) => Number.isInteger(x))) {
      res.status(422).json({ error: "validation", message: "orderedIds requis (entiers)" });
      return;
    }
    const current = new Set(
      (db.prepare("SELECT id FROM steps WHERE workflow_id = ?").all(wf.id) as { id: number }[]).map((s) => s.id)
    );
    if (orderedIds.length !== current.size || !orderedIds.every((id: number) => current.has(id))) {
      res.status(422).json({ error: "validation", message: "orderedIds doit contenir exactement toutes les étapes" });
      return;
    }
    const OFFSET = 100000;
    const tx = db.transaction((ids: number[]) => {
      ids.forEach((id, i) => {
        db.prepare("UPDATE steps SET position = ? WHERE id = ? AND workflow_id = ?").run(OFFSET + i, id, wf.id);
      });
      ids.forEach((id, i) => {
        db.prepare("UPDATE steps SET position = ? WHERE id = ? AND workflow_id = ?").run(i, id, wf.id);
      });
    });
    tx(orderedIds as number[]);
    db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = ?").run(wf.id);
    res.json({ ok: true });
  });

  return r;
}

export function stepRouter(db: Database.Database): Router {
  const r = Router();

  r.put("/:id", requireAuth("author"), (req, res) => {
    const step = db.prepare("SELECT id FROM steps WHERE id = ?")
      .get(req.params.id) as { id: number } | undefined;
    if (!step) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const { title, body, pictos } = req.body ?? {};
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      res.status(422).json({ error: "validation", message: "title invalide" });
      return;
    }
    if (pictos !== undefined && !Array.isArray(pictos)) {
      res.status(422).json({ error: "validation", message: "pictos doit être un tableau" });
      return;
    }
    db.prepare(
      `UPDATE steps SET
         title = COALESCE(?, title),
         body = COALESCE(?, body),
         pictos = COALESCE(?, pictos)
       WHERE id = ?`
    ).run(
      title?.trim() ?? null,
      body ?? null,
      pictos !== undefined ? JSON.stringify(pictos) : null,
      step.id
    );
    res.json(pictosArray(db.prepare("SELECT * FROM steps WHERE id = ?").get(step.id)));
  });

  r.delete("/:id", requireAuth("author"), (req, res) => {
    const step = db.prepare("SELECT id, workflow_id FROM steps WHERE id = ?")
      .get(req.params.id) as { id: number; workflow_id: number } | undefined;
    if (!step) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM steps WHERE id = ?").run(step.id);
      const rest = db
        .prepare("SELECT id FROM steps WHERE workflow_id = ? ORDER BY position")
        .all(step.workflow_id) as { id: number }[];
      rest.forEach((s, i) => db.prepare("UPDATE steps SET position = ? WHERE id = ?").run(i, s.id));
      db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = ?").run(step.workflow_id);
    });
    tx();
    res.json({ ok: true });
  });

  return r;
}
