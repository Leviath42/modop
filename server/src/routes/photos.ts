import crypto from "node:crypto";
import { Router } from "express";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";

// Sniff du contenu réel (magic numbers) : le mimetype déclaratif de la
// requête ne prouve rien. Retourne le type réel si le binaire est une
// image autorisée, null sinon.
export function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSig.every((byte, i) => buf[i] === byte)) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

// Purge des fichiers orphelins : tout binaire présent dans data/photos sans
// ligne correspondante en base (crash entre écriture disque et INSERT,
// suppression de ligne ratée) est supprimé. Appelée au démarrage.
export function purgeOrphanPhotos(db: Database.Database, dir: string): number {
  let removed = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  const known = new Set(
    (db.prepare("SELECT filename FROM photos").all() as { filename: string }[]).map((x) => x.filename)
  );
  for (const name of entries) {
    if (known.has(name)) continue;
    const file = path.join(dir, name);
    try {
      if (fs.statSync(file).isFile()) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch {
      /* fichier déjà parti */
    }
  }
  return removed;
}

function photosDir(): string {
  const dir = path.resolve(process.env.MODOP_PHOTOS_DIR ?? "data/photos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

export function photoRouter(db: Database.Database): Router {
  const r = Router();

  r.post("/:stepId/photos", requireAuth("author"), upload.single("file"), (req, res) => {
    if (!req.file) {
      res.status(422).json({ error: "validation", message: "fichier requis" });
      return;
    }
    if (!ALLOWED.has(req.file.mimetype)) {
      res.status(422).json({ error: "validation", message: "type de fichier non autorisé (jpeg, png, webp)" });
      return;
    }
    const realType = sniffImage(req.file.buffer);
    if (!realType || realType !== req.file.mimetype) {
      res.status(422).json({ error: "validation", message: "contenu du fichier non conforme (jpeg, png, webp)" });
      return;
    }
    const step = db
      .prepare("SELECT id FROM steps WHERE id = ?")
      .get(Number(req.params.stepId)) as { id: number } | undefined;
    if (!step) {
      res.status(404).json({ error: "not_found", message: "étape introuvable" });
      return;
    }
    const ext = req.file.mimetype === "image/png" ? ".png" : req.file.mimetype === "image/webp" ? ".webp" : ".jpg";
    const dir = photosDir();
    const filename = crypto.randomBytes(16).toString("hex") + ext;
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    const info = db
      .prepare("INSERT INTO photos (step_id, filename, alt) VALUES (?, ?, ?)")
      .run(step.id, filename, (req.body?.alt as string) ?? "");
    const photo = db.prepare("SELECT * FROM photos WHERE id = ?").get(info.lastInsertRowid);
    db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = (SELECT workflow_id FROM steps WHERE id = ?)").run(step.id);
    res.status(201).json(photo);
  });

  return r;
}

export function deletePhotoRouter(db: Database.Database): Router {
  const r = Router();

  r.delete("/:id", requireAuth("author"), (req, res) => {
    const photo = db.prepare("SELECT * FROM photos WHERE id = ?").get(Number(req.params.id)) as
      | { id: number; filename: string }
      | undefined;
    if (!photo) {
      res.status(404).json({ error: "not_found", message: "photo introuvable" });
      return;
    }
    db.prepare("DELETE FROM photos WHERE id = ?").run(photo.id);
    const file = path.join(photosDir(), photo.filename);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ ok: true });
  });

  return r;
}

export function staticPhotos(): express.RequestHandler {
  const mime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  return (req, res) => {
    const filename = path.basename(String(req.params.filename));
    const file = path.join(photosDir(), filename);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: "not_found", message: "photo introuvable" });
      return;
    }
    res.setHeader("content-type", mime[path.extname(filename)] ?? "application/octet-stream");
    res.sendFile(file);
  };
}

export function photoLayoutRouter(db: Database.Database): Router {
  const r = Router();

  r.put("/:id/layout", requireAuth("author"), (req, res) => {
    const photo = db
      .prepare("SELECT id FROM photos WHERE id = ?")
      .get(Number(req.params.id)) as { id: number } | undefined;
    if (!photo) {
      res.status(404).json({ error: "not_found", message: "photo introuvable" });
      return;
    }
    const { display_size, display_align, display_x, display_y, display_w } = req.body ?? {};
    const SIZES = ["small", "medium", "large", "full"];
    const ALIGNS = ["left", "center", "right"];
    const num01 = (v: unknown): boolean =>
      v === undefined || v === null || (typeof v === "number" && v >= 0 && v <= 1);
    if (
      (display_size !== undefined && !SIZES.includes(display_size)) ||
      (display_align !== undefined && !ALIGNS.includes(display_align)) ||
      !num01(display_x) || !num01(display_y) || !num01(display_w)
    ) {
      res.status(422).json({ error: "validation", message: "position/taille : nombres entre 0 et 1 (ou null)" });
      return;
    }
    db.prepare(
      `UPDATE photos SET
         display_size = COALESCE(?, display_size),
         display_align = COALESCE(?, display_align),
         display_x = ?,
         display_y = ?,
         display_w = ?
       WHERE id = ?`
    ).run(
      display_size ?? null,
      display_align ?? null,
      display_x === undefined ? null : display_x,
      display_y === undefined ? null : display_y,
      display_w === undefined ? null : display_w,
      photo.id
    );
    res.json({ ok: true });
  });

  return r;
}

export function annotationsRouter(db: Database.Database): Router {
  const r = Router();

  r.put("/:id/annotations", requireAuth("author"), (req, res) => {
    const photo = db
      .prepare("SELECT id FROM photos WHERE id = ?")
      .get(Number(req.params.id)) as { id: number } | undefined;
    if (!photo) {
      res.status(404).json({ error: "not_found", message: "photo introuvable" });
      return;
    }
    const { annotations } = req.body ?? {};
    if (!Array.isArray(annotations)) {
      res.status(422).json({ error: "validation", message: "annotations doit être un tableau" });
      return;
    }
    if (annotations.length > 500) {
      res.status(422).json({ error: "validation", message: "trop d'annotations (500 maximum)" });
      return;
    }
    db.prepare("UPDATE photos SET annotations = ? WHERE id = ?").run(
      JSON.stringify(annotations),
      photo.id
    );
    res.json({ ok: true, count: annotations.length });
  });

  return r;
}
