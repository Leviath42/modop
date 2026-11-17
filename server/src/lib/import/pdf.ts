import { ImportError, STEP_RE, type ImportStep, type ParseResult } from "./types.js";

// C-101 (V8 #6, RF-78) : extraction de la couche TEXTE du pdf (pdf.js).
// OCR hors scope v1 : un pdf image (scan) est refusé proprement.
// Découpage : lignes « Étape/Phase/Step » = titres d'étapes, le reste du
// texte alimente le corps de l'étape courante ; sans repère, une seule étape.
// C-109 (V14 #2) : la collecte des lignes (regroupement par y, tri par x) est
// exportée en pdfTextLines() — réutilisée par l'étage IA comme aide-textuelle.

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

// Lignes de texte de tout le document, dans l'ordre de lecture « naïf »
// (une ligne = même y arrondi, cellules triées par x — les colonnes restent
// interfoliées, l'appelant en fait ce qu'il veut).
export async function pdfTextLines(buf: Buffer): Promise<string[]> {
  const { doc, destroy } = await openPdf(buf);
  const lines: string[] = [];
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
        lines.push(arr.sort((a, b) => a.x - b.x).map((c) => c.s).join("").trim());
      }
      page.cleanup();
    }
  } finally {
    await destroy();
  }
  return lines;
}

export async function parsePdf(buf: Buffer): Promise<ParseResult> {
  const lines = await pdfTextLines(buf);
  if (!lines.some((l) => l.trim())) {
    throw new ImportError(
      "PDF sans couche texte (scan ?) : OCR non supporté en v1 — utilisez un PDF textuel ou saisissez les étapes à la main"
    );
  }
  const steps: ImportStep[] = [];
  let cur: ImportStep | null = null;
  let intro = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sm = STEP_RE.exec(line);
    if (sm) {
      cur = { title: (sm[1] || "").trim().slice(0, 200) || "Étape", body: "", images: [] };
      steps.push(cur);
    } else if (cur) {
      cur.body = (cur.body ? cur.body + "\n" : "") + line;
    } else {
      intro = (intro ? intro + "\n" : "") + line;
    }
  }
  if (!steps.length) {
    steps.push({ title: "Document importé", body: intro.slice(0, 50000), images: [] });
    return { steps, warnings: ["aucun repère « Étape/Phase/Step » détecté : tout le texte est dans une seule étape"] };
  }
  const warnings: string[] = [];
  if (intro) {
    steps.unshift({ title: "Préambule", body: intro.slice(0, 50000), images: [] });
    warnings.push("texte placé avant la première étape regroupé en « Préambule »");
  }
  return { steps, warnings };
}
