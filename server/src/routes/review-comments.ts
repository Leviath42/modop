import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import type { SessionUser } from "../auth/sessions.js";

// V17 (B1) : commentaires de relecture au niveau du MO — fil de la boucle
// brouillon → relecture → validé. Même discipline que les commentaires
// d'étape (C-96) : jamais embarqués dans le snapshot de publication, jamais
// exposés aux lecteurs, aux exports docx/PDF/md/json, au corpus ni au MCP de
// lecture ; supprimés avec le workflow (CASCADE) et modérables par l'auteur
// du commentaire ou un admin.

export function reviewCommentRouter(db: Database.Database): Router {
  const r = Router();

  const wfExists = db.prepare("SELECT id FROM workflows WHERE id = ?");
  const list = db.prepare(
    "SELECT id, by_email, message, created_at FROM review_comments WHERE workflow_id = ? ORDER BY id"
  );
  const insert = db.prepare("INSERT INTO review_comments (workflow_id, by_email, message) VALUES (?, ?, ?)");
  const byId = db.prepare("SELECT id, workflow_id, by_email FROM review_comments WHERE id = ? AND workflow_id = ?");
  const del = db.prepare("DELETE FROM review_comments WHERE id = ?");

  // Fil de relecture d'un MO (author+)
  r.get("/:id/review-comments", requireAuth("author"), (req, res) => {
    const wfId = Number(req.params.id);
    if (!wfExists.get(wfId)) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const rows = list.all(wfId) as { id: number; by_email: string; message: string; created_at: string }[];
    res.json(rows.map((c) => ({ id: c.id, by: c.by_email, message: c.message, at: c.created_at })));
  });

  // Ajout d'un commentaire de relecture (author+)
  r.post("/:id/review-comments", requireAuth("author"), (req, res) => {
    const wfId = Number(req.params.id);
    if (!wfExists.get(wfId)) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
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
    const info = insert.run(wfId, user.email, message);
    const at = new Date().toISOString().slice(0, 19).replace("T", " ");
    auditLog(db, user.email, "review_comment", `workflow:${wfId}`, `comment:${info.lastInsertRowid}`);
    res.status(201).json({ id: Number(info.lastInsertRowid), by: user.email, message, at });
  });

  // Suppression : l'auteur du commentaire, ou un admin.
  r.delete("/:id/review-comments/:commentId", requireAuth("author"), (req, res) => {
    const wfId = Number(req.params.id);
    const commentId = Number(req.params.commentId);
    const c = byId.get(commentId, wfId) as { id: number; workflow_id: number; by_email: string } | undefined;
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
    auditLog(db, user.email, "review_comment_delete", `workflow:${wfId}`, `comment:${commentId}`);
    res.json({ ok: true });
  });

  return r;
}
