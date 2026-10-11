import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";

function photosDir(): string {
  const dir = process.env.MODOP_PHOTOS_DIR ?? path.resolve("data/photos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

interface StepRow {
  id: number;
  position: number;
  title: string;
  body: string;
  pictos: string;
}

interface PhotoRow {
  filename: string;
  alt: string;
  annotations: string;
}

export function duplicateRouter(db: Database.Database): Router {
  const r = Router();

  r.post("/:id/duplicate", requireAuth("author"), (req, res) => {
    const wf = db
      .prepare("SELECT * FROM workflows WHERE id = ?")
      .get(Number(req.params.id)) as
      | { id: number; title: string; reference: string; description: string; category: string; family: string }
      | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    let ref = `${wf.reference}-COPIE`;
    let n = 2;
    while (db.prepare("SELECT 1 FROM workflows WHERE reference = ?").get(ref)) {
      ref = `${wf.reference}-COPIE-${n++}`;
    }
    const actor = (req as { user?: { email: string } }).user!;
    const dir = photosDir();
    const tx = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO workflows (title, reference, description, category, family) VALUES (?, ?, ?, ?, ?)"
        )
        .run(`${wf.title} (copie)`, ref, wf.description, wf.category, wf.family);
      const newId = Number(info.lastInsertRowid);
      const steps = db
        .prepare("SELECT * FROM steps WHERE workflow_id = ? ORDER BY position")
        .all(wf.id) as StepRow[];
      for (const step of steps) {
        const stepInfo = db
          .prepare("INSERT INTO steps (workflow_id, position, title, body, pictos) VALUES (?, ?, ?, ?, ?)")
          .run(newId, step.position, step.title, step.body, step.pictos);
        const photos = db
          .prepare("SELECT * FROM photos WHERE step_id = ?")
          .all(step.id) as PhotoRow[];
        for (const ph of photos) {
          // Copie du binaire : l'original et la copie doivent avoir des
          // cycles de vie indépendants (suppression de l'un sans casser l'autre).
          let filename = ph.filename;
          const src = path.join(dir, ph.filename);
          if (fs.existsSync(src)) {
            filename = `${crypto.randomBytes(16).toString("hex")}${path.extname(ph.filename)}`;
            fs.copyFileSync(src, path.join(dir, filename));
          }
          db.prepare("INSERT INTO photos (step_id, filename, alt, annotations) VALUES (?, ?, ?, ?)").run(
            stepInfo.lastInsertRowid, filename, ph.alt, ph.annotations ?? "[]"
          );
        }
      }
      return newId;
    });
    const newId = tx();
    auditLog(db, actor.email, "duplicate_workflow", `workflow:${wf.id}`, `-> workflow:${newId}`);
    res.status(201).json(db.prepare("SELECT * FROM workflows WHERE id = ?").get(newId));
  });

  return r;
}
