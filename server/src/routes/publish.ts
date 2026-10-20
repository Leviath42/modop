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
  canvas: unknown[];
  photos: { id: number; filename: string; alt: string; display_size?: string; display_align?: string; display_x?: number | null; display_y?: number | null; display_w?: number | null }[];
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
      .all(wf.id) as { id: number; position: number; title: string; body: string; pictos: string; canvas: string }[];
    if (steps.length === 0) {
      res.status(422).json({ error: "validation", message: "impossible de publier sans étape" });
      return;
    }
    // C-73 : pas de publication avec une date de revue DÉPASSÉE — le document
    // naîtrait immédiatement « à revoir ». L'auteur doit la mettre à jour.
    const overdue = db
      .prepare("SELECT review_due FROM workflows WHERE id = ?")
      .get(wf.id) as { review_due: string | null } | undefined;
    if (overdue?.review_due && overdue.review_due < new Date().toISOString().slice(0, 10)) {
      res.status(422).json({ error: "validation", message: "date de revue dépassée — mettez-la à jour avant de publier" });
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
        canvas: JSON.parse(s.canvas ?? "[]"),
        photos: db.prepare("SELECT id, filename, alt, display_size, display_align, display_x, display_y, display_w FROM photos WHERE step_id = ?").all(s.id),
      })) as SnapshotStep[],
    };
    const changelog = typeof (req.body as { changelog?: unknown })?.changelog === "string"
      ? ((req.body as { changelog: string }).changelog).slice(0, 2000)
      : "";
    const number = wf.current_version + 1;
    const tx = db.transaction(() => {
      db.prepare(
        "INSERT INTO versions (workflow_id, number, snapshot, changelog, author_email) VALUES (?, ?, ?, ?, ?)"
      ).run(wf.id, number, JSON.stringify(snapshot), changelog, user.email);
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
      workflow: { title: string; reference: string; description: string; category: string; family?: string; review_due?: string | null; owner_email?: string };
      steps: { id: number; position: number; title: string; body: string; pictos: unknown[]; canvas?: unknown[]; photos: unknown[] }[];
    };
    // C-84 : date de revue et responsable PORTÉS PAR LE SNAPSHOT — la vue
    // publiée affiche les valeurs figées à la publication (et non celles,
    // éventuellement déjà mises à jour, du brouillon courant).
    const ownerEmail = snap.workflow.owner_email ?? "";
    const owner = ownerEmail
      ? (db.prepare("SELECT first_name, last_name FROM users WHERE email = ?").get(ownerEmail) as
        | { first_name: string; last_name: string }
        | undefined)
      : undefined;
    const ownerName = owner ? [owner.first_name, owner.last_name].filter(Boolean).join(" ") || ownerEmail : "";
    res.json({
      id: wf.id,
      title: snap.workflow.title,
      reference: snap.workflow.reference,
      description: snap.workflow.description,
      category: snap.workflow.category,
      family: snap.workflow.family ?? "",
      state: "published",
      current_version: version.number,
      review_due: snap.workflow.review_due ?? null,
      owner_email: ownerEmail,
      owner_name: ownerName,
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
        "SELECT id, workflow_id, number, changelog, author_email, published_at FROM versions WHERE workflow_id = ? ORDER BY number DESC"
      )
      .all(wf.id);
    res.json(rows);
  });

  return r;
}
