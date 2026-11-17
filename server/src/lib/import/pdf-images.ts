import { createCanvas } from "@napi-rs/canvas";

// C-112 (V14 #3) — extraction DÉTERMINISTE des images embarquées d'un PDF
// (étage 1). Parcours de l'operator list pdf.js (getOperatorList) avec suivi
// de la matrice courante (save/restore/transform) : chaque paintImageXObject
// est une image affichée dans le carré unité transformé — on en déduit la
// boîte AFFICHÉE (position + taille en points) sans rien deviner.
// Filtres anti-bruit : ImageMask ignorés (pictos bitmap), images pleine page
// (scan de fond, > 60 % de la surface) et vignettes (< 1 % ou < 24 pt)
// ignorées. Chaque image décodée est ré-encodée en JPEG (@napi-rs/canvas,
// déjà dépendance) prête pour la route import ; le Y du centre (espace PDF,
// origine en bas à gauche) sert à l'association position ↔ étape.

const MAX_IMAGES = 30;
const FULL_PAGE_MAX = 0.6; // > 60 % de la page = scan de fond
const MIN_PAGE_RATIO = 0.01; // < 1 % = picto / logo
const MIN_SIZE_PT = 24;
const JPEG_QUALITY = 0.85;

export interface PdfEmbeddedImage {
  pageIndex: number; // 0-based
  y: number; // centre vertical, coordonnées PDF
  buffer: Buffer; // JPEG
}

export interface ExtractImagesResult {
  images: PdfEmbeddedImage[];
  ignored: number; // pleine page, pictos, illisibles
}

// --- maths 2D (matrices affines PDF : [a b c d e f]) ------------------------

interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
const ID: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
// Produit M·N (convention colonne : T(x) = M(N(x))).
function mul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.b * n.c,
    b: m.a * n.b + m.b * n.d,
    c: m.c * n.a + m.d * n.c,
    d: m.c * n.b + m.d * n.d,
    e: m.e * n.a + m.f * n.c + n.e,
    f: m.e * n.b + m.f * n.d + n.f,
  };
}

// --- pdf.js (typage minimal, comme pdf.ts) ----------------------------------

interface ImgData {
  width?: number;
  height?: number;
  kind?: number;
  data?: Uint8ClampedArray | Uint8Array;
}
interface PdfjsPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: unknown[][] }>;
  objs: { get(id: unknown, cb: (d: unknown) => void): null };
  commonObjs?: { get(id: unknown, cb: (d: unknown) => void): null };
  cleanup(): void;
}
interface PdfjsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
}
interface PdfjsModule {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): { promise: Promise<PdfjsDocument>; destroy(): Promise<void> };
  OPS: Record<string, number>;
}

// --- pixels → JPEG -----------------------------------------------------------

// pdf.js ImageKind : 1 = GRAYSCALE_1BPP (bits packés, 1 = encre), 2 =
// RGB_24BPP, 3 = RGBA_32BPP.
async function toJpeg(img: ImgData): Promise<Buffer | null> {
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  const data = img.data;
  if (!w || !h || !data || w > 10000 || h > 10000) return null;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(w, h);
  const out = imageData.data;
  const kind = img.kind ?? 0;
  if (kind === 3) {
    out.set(data.subarray(0, Math.min(data.length, w * h * 4)));
  } else if (kind === 2) {
    const n = Math.min(data.length, w * h * 3);
    for (let i = 0, o = 0; i + 2 < n; i += 3, o += 4) {
      out[o] = data[i];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i + 2];
      out[o + 3] = 255;
    }
  } else if (kind === 1) {
    const rowBytes = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const byte = data[y * rowBytes + (x >> 3)] ?? 0;
        const bit = (byte >> (7 - (x & 7))) & 1;
        const v = bit ? 0 : 255; // bit à 1 = encre (noir)
        const o = (y * w + x) * 4;
        out[o] = v;
        out[o + 1] = v;
        out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
  } else {
    return null;
  }
  ctx.putImageData(imageData, 0, 0);
  return (await canvas.encode("jpeg", JPEG_QUALITY)) as Buffer;
}

async function getPageImage(page: PdfjsPage, id: unknown): Promise<ImgData | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (d: unknown) => {
      if (!done) {
        done = true;
        resolve(d && typeof d === "object" ? (d as ImgData) : null);
      }
    };
    const timer = setTimeout(() => finish(null), 5000); // image jamais résolue
    const wrap = (d: unknown) => {
      clearTimeout(timer);
      finish(d);
    };
    try {
      page.objs.get(id, wrap);
    } catch {
      try {
        page.commonObjs?.get(id, wrap);
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    }
  });
}

// --- extraction --------------------------------------------------------------

export async function extractPdfImages(buf: Buffer): Promise<ExtractImagesResult> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false });
  const doc = await task.promise;
  const images: PdfEmbeddedImage[] = [];
  let ignored = 0;
  const { OPS } = pdfjs;
  try {
    for (let p = 1; p <= doc.numPages && images.length < MAX_IMAGES; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const pageArea = viewport.width * viewport.height;
      const ops = await page.getOperatorList();
      const fns = ops.fnArray;
      const stack: Mat[] = [];
      let ctm = ID;
      for (let i = 0; i < fns.length; i++) {
        const fn = fns[i];
        const args = ops.argsArray[i] ?? [];
        if (fn === OPS.save) {
          stack.push(ctm);
        } else if (fn === OPS.restore) {
          ctm = stack.pop() ?? ID;
        } else if (fn === OPS.transform) {
          const [a, b, c, d, e, f] = args as number[];
          if ([a, b, c, d, e, f].every((n) => typeof n === "number")) ctm = mul({ a, b, c, d, e, f }, ctm); // C-114 : cm pré-multiplie la CTM (CTM2 = m x CTM), pas l inverse
        } else if (fn === OPS.paintImageXObject) {
          // preuve test C-112 : l'image remplit le carré unité (0,0)-(1,1) du repère courant.
          const corners: [number, number][] = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ];
          const pts = corners.map(([x, y]) => ({
            x: ctm.a * x + ctm.c * y + ctm.e,
            y: ctm.b * x + ctm.d * y + ctm.f,
          }));
          const xs = pts.map((q) => q.x);
          const ys = pts.map((q) => q.y);
          const x0 = Math.min(...xs);
          const x1 = Math.max(...xs);
          const y0 = Math.min(...ys);
          const y1 = Math.max(...ys);
          const w = x1 - x0;
          const h = y1 - y0;
          if (w < MIN_SIZE_PT || h < MIN_SIZE_PT || w * h < pageArea * MIN_PAGE_RATIO || w * h > pageArea * FULL_PAGE_MAX) {
            ignored++;
            continue;
          }
          const img = await getPageImage(page, args[0]);
          const jpeg = img ? await toJpeg(img) : null;
          if (!jpeg) {
            ignored++;
            continue;
          }
          images.push({ pageIndex: p - 1, y: (y0 + y1) / 2, buffer: jpeg });
          if (images.length >= MAX_IMAGES) break;
        }
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  images.sort((a, b) => a.pageIndex - b.pageIndex || b.y - a.y); // ordre de lecture
  return { images, ignored };
}
