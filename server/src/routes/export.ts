import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType,
} from "docx";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";

interface SnapshotStep {
  position: number;
  title: string;
  body: string;
  pictos: string[];
  photos: { filename: string; alt: string }[];
}

function photosDir(): string {
  return process.env.MODOP_PHOTOS_DIR ?? path.resolve("data/photos");
}

export function exportRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/:id/export", requireAuth("reader"), async (req, res) => {
    const wf = db
      .prepare("SELECT * FROM workflows WHERE id = ?")
      .get(Number(req.params.id)) as
      | { id: number; title: string; reference: string; description: string; category: string; current_version: number }
      | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const requested = req.query.version ? Number(req.query.version) : wf.current_version;
    const version = db
      .prepare("SELECT snapshot, author_email, published_at, number FROM versions WHERE workflow_id = ? AND number = ?")
      .get(wf.id, requested) as
      | { snapshot: string; author_email: string; published_at: string; number: number }
      | undefined;
    if (!version) {
      res.status(404).json({ error: "not_found", message: "version non publiée introuvable" });
      return;
    }
    const snap = JSON.parse(version.snapshot) as {
      workflow: { title: string; reference: string; description: string; category: string };
      steps: SnapshotStep[];
    };

    const children: (Paragraph)[] = [
      new Paragraph({ text: snap.workflow.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun(`Référence : ${snap.workflow.reference}    Version : V${version.number}    Catégorie : ${snap.workflow.category}`),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `Publié par ${version.author_email} le ${version.published_at}`, italics: true, size: 18 })],
      }),
      new Paragraph({ text: "" }),
      ...(snap.workflow.description
        ? [new Paragraph({ children: [new TextRun({ text: snap.workflow.description, bold: true })] }), new Paragraph({ text: "" })]
        : []),
    ];

    for (const step of snap.steps) {
      children.push(
        new Paragraph({ text: `Étape ${step.position + 1} — ${step.title}`, heading: HeadingLevel.HEADING_2 })
      );
      if (step.body) children.push(new Paragraph({ text: step.body }));
      if (step.pictos.length) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Indications : ${step.pictos.join(", ")}`, bold: true })] }));
      }
      for (const photo of step.photos) {
        const file = path.join(photosDir(), photo.filename);
        if (fs.existsSync(file)) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: 400, height: 300 } })],
            })
          );
          if (photo.alt) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: photo.alt, italics: true, size: 18 })] }));
        }
      }
      children.push(new Paragraph({ text: "" }));
    }

    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "export_docx", `workflow:${wf.id}`, `V${version.number}`);
    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader(
      "content-type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "content-disposition",
      `attachment; filename="${snap.workflow.reference}-V${version.number}.docx"`
    );
    res.send(buffer);
  });

  return r;
}
