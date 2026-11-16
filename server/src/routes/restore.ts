import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import fs from "node:fs";
import path from "node:path";

interface SnapshotPhoto {
  filename: string;
  alt: string;
  annotations?: unknown[];
  display_size?: string;
  display_align?: string;
  display_x?: number | null;
  display_y?: number | null;
  display_w?: number | null;
}

interface SnapshotStep {
  id: number;
  position: number;
  title: string;
  body: string;
  pictos: unknown[];
  photos: SnapshotPhoto[];
  canvas?: unknown[];
}

// Dossier des photos — même règle que photos.ts (env MODOP_PHOTOS_DIR).
function photosDir(): string {
  return path.resolve(process.env.MODOP_PHOTOS_DIR ?? "data/photos");
}

// Remplacement complet des étapes du brouillon par celles d'un snapshot
// (partagé par restore et reset-draft). Retourne null si la version
// n'existe pas. Les photos référencent les fichiers existants (partagés avec
// le snapshot lui-même : jamais supprimés tant qu'une version existe).
function applySnapshot(db: Database.Database, wfId: number, number: number): { steps: number } | null {
  const version = db
    .prepare("SELECT snapshot FROM versions WHERE workflow_id = ? AND number = ?")
    .get(wfId, number) as { snapshot: string } | undefined;
  if (!version) return null;
  const snap = JSON.parse(version.snapshot) as { steps: SnapshotStep[] };
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM photos WHERE step_id IN (SELECT id FROM steps WHERE workflow_id = ?)").run(wfId);
    db.prepare("DELETE FROM steps WHERE workflow_id = ?").run(wfId);
    for (const step of snap.steps) {
      const info = db
        .prepare("INSERT INTO steps (workflow_id, position, title, body, pictos, canvas) VALUES (?, ?, ?, ?, ?, ?)")
        .run(wfId, step.position, step.title, step.body, JSON.stringify(step.pictos ?? []), JSON.stringify(step.canvas ?? []));
      for (const ph of step.photos ?? []) {
        db.prepare("INSERT INTO photos (step_id, filename, alt, annotations, display_size, display_align, display_x, display_y, display_w) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          info.lastInsertRowid,
          ph.filename,
          ph.alt,
          JSON.stringify(ph.annotations ?? []),
          ph.display_size ?? "medium",
          ph.display_align ?? "center",
          ph.display_x ?? null,
          ph.display_y ?? null,
          ph.display_w ?? null
        );
      }
    }
    db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = ?").run(wfId);
  });
  tx();
  return { steps: snap.steps.length };
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
    const applied = applySnapshot(db, wf.id, Number(req.params.number));
    if (!applied) {
      res.status(404).json({ error: "not_found", message: "version introuvable" });
      return;
    }
    const actor = (req as { user?: { email: string } }).user!;
    auditLog(db, actor.email, "restore_version", `workflow:${wf.id}`, `V${req.params.number}`);
    res.json({ ok: true, steps: applied.steps, restoredFrom: Number(req.params.number) });
  });

  // C-97 (V12 #9) : abandonner un brouillon « introuvable » — une seule porte
  // de sortie serveur, indépendante de l'état du brouillon :
  // - MO publié au moins une fois : le brouillon redevient la dernière
  //   version publiée (équivalent du restore, sans exiger que l'éditeur
  //   charge les étapes) ;
  // - brouillon jamais publié (V0) : purge complète — étapes, photos (lignes
  //   et fichiers non référencés ailleurs ; un V0 n'est couvert par aucun
  //   snapshot) et commentaires d'auteurs (cascade). Le MO reste, à neuf.
  r.post("/:id/reset-draft", requireAuth("author"), (req, res) => {
    const wf = db
      .prepare("SELECT id, current_version FROM workflows WHERE id = ?")
      .get(Number(req.params.id)) as { id: number; current_version: number } | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const actor = (req as { user?: { email: string } }).user!;
    if (wf.current_version > 0) {
      const applied = applySnapshot(db, wf.id, wf.current_version);
      if (!applied) {
        res.status(404).json({ error: "not_found", message: "version publiée introuvable" });
        return;
      }
      auditLog(db, actor.email, "reset_draft", `workflow:${wf.id}`, `V${wf.current_version}`);
      res.json({ ok: true, mode: "restored", restoredFrom: wf.current_version });
      return;
    }
    const filenames = db
      .prepare("SELECT p.filename AS filename FROM photos p JOIN steps s ON s.id = p.step_id WHERE s.workflow_id = ?")
      .all(wf.id) as { filename: string }[];
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM photos WHERE step_id IN (SELECT id FROM steps WHERE workflow_id = ?)").run(wf.id);
      db.prepare("DELETE FROM steps WHERE workflow_id = ?").run(wf.id);
      db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = ?").run(wf.id);
    });
    tx();
    for (const { filename } of filenames) {
      const still = db.prepare("SELECT COUNT(*) AS n FROM photos WHERE filename = ?").get(filename) as { n: number };
      if (still.n === 0) {
        try {
          fs.rmSync(path.join(photosDir(), filename), { force: true });
        } catch {
          /* fichier déjà absent — purge des lignes reste acquise */
        }
      }
    }
    auditLog(db, actor.email, "reset_draft", `workflow:${wf.id}`, "v0 (brouillon jamais publié)");
    res.json({ ok: true, mode: "emptied" });
  });

  return r;
}
