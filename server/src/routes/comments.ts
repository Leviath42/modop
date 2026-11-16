import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import type { SessionUser } from "../auth/sessions.js";

// C-96 (V12 #7) : commentaires de rédaction entre auteurs, par étape —
// visibles et modérables uniquement en mode édition. Jamais embarqués dans
// le snapshot de publication, jamais exposés aux lecteurs, à l'export docx
// ni au MCP : ce sont des notes internes de rédaction.

export function stepCommentRouter(db: Database.Database): Router {
  const r = Router();

  const stepExists = db.prepare("SELECT id FROM steps WHERE id = ?");
  const list = db.prepare(
    "SELECT id, by_email, message, created_at FROM step_comments WHERE step_id = ? ORDER BY id"
  );
  const insert = db.prepare("INSERT INTO step_comments (step_id, by_email, message) VALUES (?, ?, ?)");
  const byId = db.prepare("SELECT id, step_id, by_email FROM step_comments WHERE id = ? AND step_id = ?");
  const del = db.prepare("DELETE FROM step_comments WHERE id = ?");

  // Liste des commentaires d'une étape (author+)
  r.get("/:id/comments", requireAuth("author"), (req, res) => {
    const stepId = Number(req.params.id);
    if (!stepExists.get(stepId)) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const rows = list.all(stepId) as { id: number; by_email: string; message: string; created_at: string }[];
    res.json(rows.map((c) => ({ id: c.id, by: c.by_email, message: c.message, at: c.created_at })));
  });

  // Ajout d'un commentaire (author+)
  r.post("/:id/comments", requireAuth("author"), (req, res) => {
    const stepId = Number(req.params.id);
    if (!stepExists.get(stepId)) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const user = (req as { user?: SessionUser }).user!;
    const message = typeof (req.body as { message?: unknown })?.message === "string"
      ? ((req.body as { message: string }).message).trim()
      : "";
    if (!message) {
      res.status(422).json({ error: "validation", message: "commentaire vide" });
      return;
    }
    if (message.length > 1000) {
      res.status(422).json({ error: "validation", message: "commentaire trop long (1000 caractères maximum)" });
      return;
    }
    const info = insert.run(stepId, user.email, message);
    const at = new Date().toISOString().slice(0, 19).replace("T", " ");
    auditLog(db, user.email, "step_comment", `step:${stepId}`, `comment:${info.lastInsertRowid}`);
    res.status(201).json({ id: Number(info.lastInsertRowid), by: user.email, message, at });
  });

  // Suppression : l'auteur du commentaire, ou un admin.
  r.delete("/:id/comments/:commentId", requireAuth("author"), (req, res) => {
    const stepId = Number(req.params.id);
    const commentId = Number(req.params.commentId);
    const c = byId.get(commentId, stepId) as { id: number; step_id: number; by_email: string } | undefined;
    if (!c) {
      res.status(404).json({ error: "not_found", message: "commentaire introuvable" });
      return;
    }
    const user = (req as { user?: SessionUser }).user!;
    if (c.by_email !== user.email && user.role !== "admin") {
      res.status(403).json({ error: "forbidden", message: "seul l'auteur du commentaire (ou un admin) peut le supprimer" });
      return;
    }
    del.run(commentId);
    auditLog(db, user.email, "step_comment_delete", `step:${stepId}`, `comment:${commentId}`);
    res.json({ ok: true });
  });

  return r;
}
