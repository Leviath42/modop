// C-106 (V13 #4) : export PDF — rendu structure fidele au contenu du lecteur
// (page de garde GED + par etape : titre, texte, pictos, composite photo+formes
// du docx). pdf-lib (zero dependance native, supply-chain propre, audit 0) ;
// pas de rendu pixel-perfect du lecteur (pas de navigateur headless en CT).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { composeStepCanvas } from "../render/canvas-composite.js";
import type { ExportMeta, PayloadSnap } from "./export-payload.js";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const CANVAS_W = 800;

// Helvetica = WinAnsi : les caracteres hors latin-1 ne sont pas encodables
// par pdf-lib (⚠ → "(!)", le reste en "?").
function sanitize(s: string): string {
  return (s ?? "").replace(/⚠/g, "(!)").replace(/[^\x00-\xFF]/g, "?").replace(/\r/g, "");
}

export async function renderPdf(meta: ExportMeta, snap: PayloadSnap, photosDir: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(sanitize(meta.title));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gray = rgb(0.35, 0.38, 0.44);
  const dark = rgb(0.1, 0.11, 0.13);
  const accent = rgb(0.12, 0.31, 0.61);
  const warn = rgb(0.54, 0.43, 0.1);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const draw = (text: string, size: number, f: typeof font, x: number, yy: number, color = dark) =>
    page.drawText(sanitize(text), { x, y: yy, size, font: f, color });

  const wrap = (text: string, size: number, f: typeof font, maxW: number): string[] => {
    const out: string[] = [];
    for (const raw of sanitize(text).split("\n")) {
      const words = raw.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (f.widthOfTextAtSize(t, size) <= maxW) line = t;
        else { if (line) out.push(line); line = w; }
      }
      if (line) out.push(line);
    }
    return out;
  };
  const para = (text: string, size: number, f: typeof font, color = dark, gap = 4) => {
    for (const line of wrap(text, size, f, CONTENT_W)) {
      if (y - (size + gap) < MARGIN) newPage();
      draw(line, size, f, MARGIN, y - size, color);
      y -= size + gap;
    }
    y -= 6;
  };

  // ---- page de garde ----
  para(meta.title, 16, bold, dark, 6);
  para("Réf. " + meta.reference + " — V" + meta.version, 10, font, accent, 3);
  para("Type : " + meta.type + " — Famille : " + (meta.family || "—"), 9, font, gray, 3);
  para("Chemin : " + (meta.category_path || "(racine)"), 9, font, gray, 3);
  para("Responsable : " + (meta.owner_name || "—") + " — Publiée le : " + meta.published_at, 9, font, gray, 3);
  para("À revoir le : " + (meta.review_due || "—") + " — Auteur : " + meta.author, 9, font, gray, 3);
  y -= 4;
  if (meta.changelog) para("Modifications de cette version : " + meta.changelog, 9, font, gray, 3);
  if (meta.description) para(meta.description, 10, font);
  y -= 10;

  // ---- etapes ----
  for (const step of snap.steps) {
    if (y < MARGIN + 70) newPage();
    para("Étape " + (step.position + 1) + " — " + step.title, 13, bold, accent, 5);
    if (step.body) para(step.body, 10, font);
    for (const p of step.pictos ?? []) {
      para("(!) " + (typeof p === "string" ? p : p.label), 10, bold, warn, 3);
    }
    const photos = (step.photos ?? []).map((p) => ({
      filename: p.filename,
      annotations: (p.annotations ?? []) as never[],
      display_x: p.display_x ?? undefined,
      display_y: p.display_y ?? undefined,
      display_w: p.display_w ?? undefined,
      display_size: p.display_size ?? undefined,
    })) as Parameters<typeof composeStepCanvas>[1];
    const shapes = (step.canvas ?? []) as Parameters<typeof composeStepCanvas>[2];
    const composite = await composeStepCanvas(photosDir, photos, shapes, CANVAS_W);
    if (composite) {
      const img = await doc.embedPng(composite);
      const w = Math.min(CONTENT_W, 460);
      const h = (w / img.width) * img.height;
      if (y - (h + 16) < MARGIN) newPage();
      page.drawImage(img, { x: (PAGE_W - w) / 2, y: y - h, width: w, height: h });
      y -= h + 16;
    } else if ((step.photos ?? []).length) {
      for (const ph of step.photos ?? []) {
        const ai = (ph.image_description ?? "").trim();
        para("Photo : " + (ph.alt || ph.filename) + (ai ? " — " + ai : ""), 9, font, gray, 3);
      }
    }
  }

  // ---- pagination ----
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = (i + 1) + " / " + pages.length;
    const tw = font.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: (PAGE_W - tw) / 2, y: MARGIN / 2, size: 8, font, color: gray });
  });
  return Buffer.from(await doc.save());
}
