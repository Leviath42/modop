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
  canvas: string;
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
        (db.prepare("SELECT * FROM photos WHERE step_id = ?").all(s.id) as { id: number; filename: string; alt: string; annotations: string; display_size: string; display_align: string; display_x: number | null; display_y: number | null; display_w: number | null }[]).map((ph) => ({
          ...ph,
          annotations: JSON.parse(ph.annotations ?? "[]"),
          display_size: ph.display_size ?? "medium",
          display_align: ph.display_align ?? "center",
          display_x: ph.display_x,
          display_y: ph.display_y,
          display_w: ph.display_w,
        }))
      );
    }
    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "view_workflow", `workflow:${wf.id}`);
    res.json({
      ...wf,
      steps: steps.map((s) => ({
        ...s,
        pictos: JSON.parse(s.pictos),
        canvas: JSON.parse(s.canvas ?? "[]"),
        photos: photosByStep.get(s.id),
      })),
    });
  });

  r.put("/:id", requireAuth("author"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(req.params.id) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const { title, description, category, family, review_due, owner_email } = req.body ?? {};
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      res.status(422).json({ error: "validation", message: "title invalide" });
      return;
    }
    const dateOk = (v: unknown): boolean =>
      v === undefined || v === null || v === "" || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
    if (!dateOk(review_due)) {
      res.status(422).json({ error: "validation", message: "review_due : date YYYY-MM-DD, vide ou null" });
      return;
    }
    db.prepare(
      `UPDATE workflows SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         category = COALESCE(?, category),
         family = COALESCE(?, family),
         review_due = ?,
         owner_email = COALESCE(?, owner_email),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      title?.trim() ?? null,
      description ?? null,
      category ?? null,
      family ?? null,
      review_due === "" ? null : (typeof review_due === "string" ? review_due : null),
      typeof owner_email === "string" ? owner_email.trim() : null,
      wf.id
    );
    res.json(db.prepare("SELECT * FROM workflows WHERE id = ?").get(wf.id));
  });


  // Canevas de l'etape : formes en coordonnees etape (0-1), persistees en JSON.
  r.put("/:id/canvas", requireAuth("author"), (req, res) => {
    const step = db.prepare("SELECT id FROM steps WHERE id = ?").get(Number(req.params.id)) as
      | { id: number }
      | undefined;
    if (!step) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const { shapes } = req.body ?? {};
    if (!Array.isArray(shapes)) {
      res.status(422).json({ error: "validation", message: "shapes doit être un tableau" });
      return;
    }
    if (shapes.length > 500) {
      res.status(422).json({ error: "validation", message: "trop de formes (500 maximum)" });
      return;
    }
    db.prepare("UPDATE steps SET canvas = ? WHERE id = ?").run(JSON.stringify(shapes), step.id);
    res.json({ ok: true, count: shapes.length });
  });

  // C-46 : suppression d'un MO — ADMIN uniquement (l'auteur peut tout
  // éditer, mais la destruction irréversible est une opération de gestion).
  r.delete("/:id", requireAuth("admin"), (req, res) => {
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

  // RF-73 — retour terrain : signalement d'un problème sur une étape.
  r.post("/:id/feedback", requireAuth("reader"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(Number(req.params.id)) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const { step_id, message } = req.body ?? {};
    if (typeof step_id !== "number" || typeof message !== "string" || !message.trim()) {
      res.status(422).json({ error: "validation", message: "step_id (nombre) et message requis" });
      return;
    }
    const step = db.prepare("SELECT id FROM steps WHERE id = ? AND workflow_id = ?").get(step_id, wf.id);
    if (!step) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const actor = (req as { user?: { email: string } }).user!;
    const info = db
      .prepare("INSERT INTO feedback (workflow_id, step_id, by_email, message) VALUES (?, ?, ?, ?)")
      .run(wf.id, step_id, actor.email, message.trim().slice(0, 500));
    auditLog(db, actor.email, "feedback", `workflow:${wf.id}`, `step:${step_id} ${message.trim().slice(0, 500)}`);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  r.get("/:id/feedback", requireAuth("author"), (req, res) => {
    const wf = db.prepare("SELECT id FROM workflows WHERE id = ?").get(Number(req.params.id)) as { id: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const rows = db
      .prepare(
        `SELECT id, step_id, by_email, message, status, resolved_by, resolved_at, created_at
         FROM feedback WHERE workflow_id = ?
         ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, id DESC LIMIT 200`
      )
      .all(wf.id) as {
        id: number; step_id: number; by_email: string; message: string;
        status: string; resolved_by: string; resolved_at: string | null; created_at: string;
      }[];
    res.json(rows.map((r0) => ({
      id: r0.id,
      step_id: r0.step_id,
      by: r0.by_email,
      message: r0.message,
      status: r0.status,
      resolved_by: r0.resolved_by || null,
      resolved_at: r0.resolved_at,
      at: r0.created_at,
    })));
  });

  // Résoudre un signalement (author+) : après correction du contenu, l'auteur
  // clôt la fiche — elle reste visible (historique) avec qui l'a résolue.
  r.put("/:id/feedback/:feedbackId/resolve", requireAuth("author"), (req, res) => {
    const fb = db
      .prepare("SELECT id, workflow_id FROM feedback WHERE id = ? AND workflow_id = ?")
      .get(Number(req.params.feedbackId), Number(req.params.id)) as { id: number; workflow_id: number } | undefined;
    if (!fb) {
      res.status(404).json({ error: "not_found", message: "signalement introuvable" });
      return;
    }
    const actor = (req as { user?: { email: string } }).user!;
    db.prepare(
      "UPDATE feedback SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now') WHERE id = ?"
    ).run(actor.email, fb.id);
    auditLog(db, actor.email, "feedback_resolved", `workflow:${fb.workflow_id}`, `feedback:${fb.id}`);
    res.json({ ok: true });
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


  // Canevas de l'etape : formes en coordonnees etape (0-1), persistees en JSON.
  r.put("/:id/canvas", requireAuth("author"), (req, res) => {
    const step = db.prepare("SELECT id FROM steps WHERE id = ?").get(Number(req.params.id)) as
      | { id: number }
      | undefined;
    if (!step) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const { shapes } = req.body ?? {};
    if (!Array.isArray(shapes)) {
      res.status(422).json({ error: "validation", message: "shapes doit être un tableau" });
      return;
    }
    if (shapes.length > 500) {
      res.status(422).json({ error: "validation", message: "trop de formes (500 maximum)" });
      return;
    }
    db.prepare("UPDATE steps SET canvas = ? WHERE id = ?").run(JSON.stringify(shapes), step.id);
    res.json({ ok: true, count: shapes.length });
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
