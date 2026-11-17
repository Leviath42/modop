import { ImportError, STEP_RE, type ImportStep, type ParseResult } from "./types.js";
import { extractPdfImages } from "./pdf-images.js";

// C-101 (V8 #6, RF-78) : extraction de la couche TEXTE du pdf (pdf.js).
// OCR hors scope v1 : un pdf image (scan) est refusé proprement.
// Découpage : lignes « Étape/Phase/Step » = titres d'étapes, le reste du
// texte alimente le corps de l'étape courante ; sans repère, une seule étape.
// C-109 (V14 #2) : la collecte des lignes (regroupement par y, tri par x) est
// exportée en pdfTextLines() — réutilisée par l'étage IA comme aide-textuelle.
// C-112 (V14 #3) : les lignes gardent leur position (page, y) pour rattacher
// les IMAGES EMBARQUÉES du PDF à l'étape la plus proche (extraction
// déterministe pdf-images.ts) — supprime la retouche photo manuelle (REX
// MO 28 : photos perdues à l'import).

const NL = String.fromCharCode(10);

interface PdfTextItem {
  str?: string;
  transform?: number[];
}
interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  cleanup(): void;
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfjsLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}
type PdfjsModule = {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): PdfjsLoadingTask;
};

async function openPdf(buf: Buffer): Promise<{ doc: PdfDocument; destroy: () => Promise<void> }> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false });
  const doc = await task.promise;
  return { doc, destroy: () => task.destroy() };
}

export interface PdfTextRow {
  pageIndex: number; // 0-based
  y: number; // centre de la ligne, coordonnées PDF
  text: string;
}

// Lignes de texte de tout le document AVEC leur position, dans l'ordre de
// lecture « naïf » (une ligne = même y arrondi, cellules triées par x — les
// colonnes restent interfoliées, l'appelant en fait ce qu'il veut).
export async function pdfTextRows(buf: Buffer): Promise<PdfTextRow[]> {
  const { doc, destroy } = await openPdf(buf);
  const rows: PdfTextRow[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      // Regroupement par ligne : même y (arrondi) = même ligne, tri par x.
      // Plus robuste que hasEOL (souvent absent des Tj simples).
      const rowsMap = new Map<number, { x: number; s: string }[]>();
      for (const it of tc.items) {
        if (!it.str || !it.transform) continue;
        const y = Math.round(it.transform[5]);
        const arr = rowsMap.get(y) ?? [];
        arr.push({ x: it.transform[4], s: it.str });
        rowsMap.set(y, arr);
      }
      const ys = [...rowsMap.keys()].sort((a, b) => b - a);
      for (const y of ys) {
        const arr = rowsMap.get(y) ?? [];
        rows.push({ pageIndex: p - 1, y, text: arr.sort((a, b) => a.x - b.x).map((c) => c.s).join("").trim() });
      }
      page.cleanup();
    }
  } finally {
    await destroy();
  }
  return rows;
}

// C-109 : sortie historique (texte seul) — l'aide-textuelle de l'étage IA.
export async function pdfTextLines(buf: Buffer): Promise<string[]> {
  return (await pdfTextRows(buf)).map((r) => r.text);
}

interface RowPos {
  pageIndex: number;
  y: number;
}

// C-112 : rattachement de chaque image extraite à l'étape la plus proche dans
// le FLUX DE LECTURE (écart de page fortement pénalisé, puis distance
// verticale) — exact pour les étapes d'une même page, robuste pour un
// document dont les étapes s'étalent sur plusieurs pages.
async function attachImages(buf: Buffer, steps: ImportStep[], segs: RowPos[][]): Promise<string[]> {
  let extracted;
  try {
    extracted = await extractPdfImages(buf);
  } catch {
    return ["images du PDF non extraites (PDF endommagé ?) — l'import du texte continue"];
  }
  const warnings: string[] = [];
  if (extracted.ignored > 0) {
    warnings.push(extracted.ignored + " élément(s) graphique(s) ignoré(s) (image pleine page de scan, picto ou logo)");
  }
  if (!extracted.images.length) return warnings;
  for (const img of extracted.images) {
    let best = 0;
    let bestD = Infinity;
    segs.forEach((ss, i) => {
      for (const s of ss) {
        const d = Math.abs(s.pageIndex - img.pageIndex) * 5000 + Math.abs(s.y - img.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    });
    steps[best].images.push({
      buffer: img.buffer,
      alt: "Photo importée du PDF — vérifier le placement",
    });
  }
  warnings.push(
    extracted.images.length + " photo(s) extraite(s) du PDF, rattachée(s) à l'étape la plus proche par leur position — vérifiez leur placement avant publication"
  );
  return warnings;
}

export async function parsePdf(buf: Buffer): Promise<ParseResult> {
  const rows = await pdfTextRows(buf);
  if (!rows.some((r) => r.text.trim())) {
    throw new ImportError(
      "PDF sans couche texte (scan ?) : OCR non supporté en v1 — utilisez un PDF textuel, l'import assisté par IA (case « IA »), ou saisissez les étapes à la main"
    );
  }
  const steps: ImportStep[] = [];
  const segs: RowPos[][] = [];
  let cur: ImportStep | null = null;
  let curSegs: RowPos[] = [];
  let intro = "";
  const introSegs: RowPos[] = [];
  for (const r of rows) {
    const line = r.text.trim();
    if (!line) continue;
    const sm = STEP_RE.exec(line);
    if (sm) {
      cur = { title: (sm[1] || "").trim().slice(0, 200) || "Étape", body: "", images: [] };
      curSegs = [{ pageIndex: r.pageIndex, y: r.y }];
      steps.push(cur);
      segs.push(curSegs);
    } else if (cur) {
      cur.body = (cur.body ? cur.body + NL : "") + line;
      curSegs.push({ pageIndex: r.pageIndex, y: r.y });
    } else {
      intro = (intro ? intro + NL : "") + line;
      introSegs.push({ pageIndex: r.pageIndex, y: r.y });
    }
  }
  if (!steps.length) {
    const step: ImportStep = { title: "Document importé", body: intro.slice(0, 50000), images: [] };
    const imgWarnings = await attachImages(buf, [step], [introSegs]);
    return {
      steps: [step],
      warnings: ["aucun repère « Étape/Phase/Step » détecté : tout le texte est dans une seule étape", ...imgWarnings],
    };
  }
  const warnings: string[] = [];
  if (intro) {
    steps.unshift({ title: "Préambule", body: intro.slice(0, 50000), images: [] });
    segs.unshift(introSegs);
    warnings.push("texte placé avant la première étape regroupé en « Préambule »");
  }
  const imgWarnings = await attachImages(buf, steps, segs);
  return { steps, warnings: [...warnings, ...imgWarnings] };
}
