import { Router } from "express";
import path from "node:path";
import type Database from "better-sqlite3";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType,
  Header, Footer, Table, TableRow, TableCell, WidthType, BorderStyle, PageNumber,
  ShadingType,
} from "docx";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { composeStepCanvas } from "../render/canvas-composite.js";

interface SnapshotPicto { kind: string; label: string; color: string }
interface SnapshotPhoto {
  filename: string;
  alt: string;
  display_x?: number | null;
  display_y?: number | null;
  display_w?: number | null;
  display_size?: string;
}
interface SnapshotStep {
  position: number;
  title: string;
  body: string;
  pictos: (SnapshotPicto | string)[];
  canvas?: CompositeShape[];
  photos: SnapshotPhoto[];
}
type CompositeShape = Parameters<typeof composeStepCanvas>[2][number];

function photosDir(): string {
  return process.env.MODOP_PHOTOS_DIR ?? path.resolve("data/photos");
}

// Taille utile d'une page A4 avec marges par défaut docx (~600 px d'image
// pour ~16 cm de large utile). Le canevas est composé à 800 px puis affiché
// pleine largeur — net à l'impression.
const CANVAS_W = 800;

export function exportRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/:id/export", requireAuth("reader"), async (req, res) => {
    const wf = db
      .prepare("SELECT * FROM workflows WHERE id = ?")
      .get(Number(req.params.id)) as
      | { id: number; title: string; reference: string; description: string; category: string; family: string; owner_email: string; review_due: string | null; current_version: number }
      | undefined;
    if (!wf) {
      res.status(404).json({ error: "not_found", message: "mode opératoire introuvable" });
      return;
    }
    const requested = req.query.version ? Number(req.query.version) : wf.current_version;
    const version = db
      .prepare("SELECT snapshot, changelog, author_email, published_at, number FROM versions WHERE workflow_id = ? AND number = ?")
      .get(wf.id, requested) as
      | { snapshot: string; changelog: string; author_email: string; published_at: string; number: number }
      | undefined;
    if (!version) {
      res.status(404).json({ error: "not_found", message: "version non publiée introuvable" });
      return;
    }
    const snap = JSON.parse(version.snapshot) as {
      workflow: { title: string; reference: string; description: string; category: string; family?: string; review_due?: string | null; owner_email?: string };
      steps: SnapshotStep[];
    };
    // C-84 : date de revue et responsables PORTÉS PAR LE SNAPSHOT — l'export
    // d'une version ancienne montre les valeurs figées à sa publication,
    // pas celles du brouillon courant (qui « sautaient » d'une version à
    // l'autre). Le responsable s'affiche en « Prénom Nom » quand le compte
    // existe encore.
    const ownerEmail = snap.workflow.owner_email ?? "";
    const ownerRow = ownerEmail
      ? (db.prepare("SELECT first_name, last_name FROM users WHERE email = ?").get(ownerEmail) as
        | { first_name: string; last_name: string }
        | undefined)
      : undefined;
    const ownerLabel = ownerRow
      ? [ownerRow.first_name, ownerRow.last_name].filter(Boolean).join(" ") || ownerEmail
      : ownerEmail;
    const reviewDue = snap.workflow.review_due ?? null;

    // ---------- styles ----------
    const ACCENT = "1F4E9C";
    const thin = { style: BorderStyle.SINGLE, size: 2, color: "C9CCD3" };
    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

    // ---------- page de garde ----------
    const children: (Paragraph | Table)[] = [
      new Paragraph({
        spacing: { before: 240 },
        children: [new TextRun({ text: snap.workflow.title, bold: true, size: 44, color: "1A1C20", font: "Calibri" })],
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: `Mode opératoire — ${snap.workflow.reference}`, size: 24, color: "5B6470", font: "Calibri" })],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: thin, bottom: thin, left: noBorder, right: noBorder,
          insideHorizontal: noBorder, insideVertical: noBorder,
        },
        rows: [
          new TableRow({
            children: [
              metaCell("Version", `V${version.number}`, ACCENT),
              metaCell("Publiée le", version.published_at, ACCENT),
              metaCell("Par", version.author_email, ACCENT),
            ],
          }),
          new TableRow({
            children: [
              metaCell("Famille", snap.workflow.family ?? "—", ACCENT),
              metaCell("Type", snap.workflow.category || "—", ACCENT),
              metaCell("Responsable", ownerLabel || "—", ACCENT),
            ],
          }),
          new TableRow({
            children: [
              metaCell("À revoir le", reviewDue ?? "—", ACCENT),
              metaCell("", "", ACCENT),
              metaCell("", "", ACCENT),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "" }),
    ];
    if (version.changelog) {
      children.push(new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: "Modifications de cette version", bold: true, size: 22, color: ACCENT, font: "Calibri" })],
      }));
      children.push(new Paragraph({ children: [new TextRun({ text: version.changelog, size: 21, color: "3A4150", font: "Calibri" })] }));
    }
    if (snap.workflow.description) {
      children.push(new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: snap.workflow.description, size: 22, color: "3A4150", font: "Calibri" })],
      }));
    }
    children.push(new Paragraph({ text: "" }));

    // ---------- étapes ----------
    for (const step of snap.steps) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 260, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT } },
        children: [
          new TextRun({ text: `Étape ${step.position + 1} — ${step.title}`, bold: true, color: ACCENT, size: 26, font: "Calibri" }),
        ],
      }));
      if (step.body) {
        children.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: step.body, size: 22, color: "1A1C20", font: "Calibri" })],
        }));
      }
      if (step.pictos.length) {
        children.push(new Paragraph({
          spacing: { after: 100 },
          shading: { type: ShadingType.CLEAR, fill: "FDF3D7" },
          children: step.pictos.map((p, i) => {
            const label = typeof p === "string" ? p : p.label;
            const color = typeof p === "string" ? "8A6D1A" : (p.color ?? "#f5a623").replace("#", "").toUpperCase();
            return new TextRun({
              text: (i === 0 ? "⚠ " : "⚠ ") + label + (i < step.pictos.length - 1 ? "    " : ""),
              bold: true, size: 21, color, font: "Calibri",
            });
          }),
        }));
      }
      // canevas composé (photos positionnées + formes) — le rendu du lecteur
      const composite = await composeStepCanvas(
        photosDir(),
        (step.photos ?? []).map((p) => ({
          filename: p.filename,
          display_x: p.display_x,
          display_y: p.display_y,
          display_w: p.display_w,
          display_size: p.display_size,
        })),
        (step.canvas ?? []) as CompositeShape[],
        CANVAS_W
      );
      if (composite) {
        const cw = composite.readUInt32BE(16);
        const ch = composite.readUInt32BE(20);
        const dispW = 600;
        const dispH = Math.round((dispW / cw) * ch);
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new ImageRun({ type: "png", data: composite, transformation: { width: dispW, height: dispH } })],
        }));
      }
      children.push(new Paragraph({ text: "" }));
    }

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: "Calibri", size: 22, color: "1A1C20" } },
          heading2: { run: { font: "Calibri", size: 26, bold: true, color: ACCENT } },
        },
      },
      sections: [{
        properties: {},
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: `${snap.workflow.title} — ${snap.workflow.reference}`, size: 16, color: "8A919E", font: "Calibri" })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: `Modop — V${version.number} — page `, size: 16, color: "8A919E", font: "Calibri" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A919E", font: "Calibri" }),
              ],
            })],
          }),
        },
        children,
      }],
    });

    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "export_docx", `workflow:${wf.id}`, `V${version.number}`);
    const buffer = await Packer.toBuffer(doc);
    res.setHeader("content-type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("content-disposition", `attachment; filename="${snap.workflow.reference}-V${version.number}.docx"`);
    res.send(buffer);
  });

  return r;
}

function metaCell(label: string, value: string, accent: string): TableCell {
  return new TableCell({
    borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: accent }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    children: [
      new Paragraph({ children: [new TextRun({ text: label.toUpperCase(), size: 14, color: "8A919E", font: "Calibri" })] }),
      new Paragraph({ children: [new TextRun({ text: value, bold: true, size: 20, color: "1A1C20", font: "Calibri" })] }),
    ],
  });
}
