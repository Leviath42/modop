import JSZip from "jszip";
import { ImportError, STEP_RE, type ParseResult, type ImportStep } from "./types.js";

// C-103 (retour terrain C-101) : lecteur xlsx v2 — toujours maison
// (supply-chain : exceljs écarté — uuid<11 vulnérable + 159 paquets
// deprecated, override npm cassé). Lecture seule via jszip. Nouveautés
// vs C-101 :
// - cellules fusionnées : la valeur de la 1re cellule remplit la plage
//   (un titre fusionné sur une rangée devient un repère d'étape lisible) ;
// - images embarquées : xl/drawings (twoCell/oneCellAnchor), ancrage par
//   ligne -> rattachées à l'étape couvrant cette ligne (comme le docx) ;
// - repères « Étape/Phase/Step » cherchés sur TOUTES les colonnes ;
// - toutes les feuilles importées à la suite (ordre du classeur) ;
// - dates sérielles toujours non converties (v1 assumé).

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const norm = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

const HEADER_TITLES = new Set(["titre", "title", "etape", "etape numero", "step", "libelle", "nom", "phase"]);
const HEADER_BODIES = new Set(["description", "texte", "text", "corps", "consigne", "consignes", "instructions", "details", "remarque"]);

interface SheetRow {
  line: number; // ligne Excel 0-based (pour l'ancrage des images)
  cells: string[];
}
interface AnchoredImage {
  line: number;
  buffer: Buffer;
}

function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: n - 1 };
}

function cellText(cellXml: string, shared: string[]): string {
  const tM = / t="([^"]+)"/.exec(cellXml);
  if (tM && tM[1] === "s") {
    const vM = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
    return vM ? shared[Number(vM[1])] ?? "" : "";
  }
  if (tM && tM[1] === "inlineStr") {
    return [...cellXml.matchAll(/<t[^>]*>[\s\S]*?<\/t>/g)].map((m) => decodeXml(m[1])).join("");
  }
  const vM = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
  return vM ? decodeXml(vM[1]).replace(/^(-?\d+)\.0+$/, "$1") : "";
}

// Lignes de la feuille : valeurs texte/nombres, fusions propagées,
// lignes entièrement vides ignorées.
function sheetRows(sheetXml: string, shared: string[]): SheetRow[] {
  const raw = new Map<number, Record<number, string>>();
  for (const rowM of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rM = / r="(\d+)"/.exec(rowM[1]);
    const r = rM ? Number(rM[1]) - 1 : raw.size;
    if (r < 0) continue;
    const cells: Record<number, string> = {};
    for (const cm of rowM[2].matchAll(/<c\b([^>]*\/|[^>]*>[\s\S]*?<\/c>)/g)) {
      const refM = /r="([A-Z]+\d+)"/.exec(cm[1]);
      if (!refM) continue;
      const pos = parseRef(refM[1]);
      if (!pos) continue;
      const text = cellText(cm[1], shared);
      if (text.trim() !== "") cells[pos.c] = text;
    }
    raw.set(r, cells);
  }
  // Fusions : la valeur de la cellule en haut à gauche remplit la plage.
  for (const mg of sheetXml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
    const a = parseRef(mg[1]);
    const b = parseRef(mg[2]);
    if (!a || !b) continue;
    const src = raw.get(a.r)?.[a.c] ?? "";
    if (!src) continue;
    for (let rr = a.r; rr <= b.r; rr++) {
      const row = raw.get(rr) ?? {};
      raw.set(rr, row);
      for (let cc = a.c; cc <= b.c; cc++) if (!row[cc]) row[cc] = src;
    }
  }
  const rows: SheetRow[] = [];
  for (const r of [...raw.keys()].sort((x, y) => x - y)) {
    const cells = raw.get(r) as Record<number, string>;
    const width = Math.max(-1, ...Object.keys(cells).map(Number));
    const arr: string[] = [];
    for (let i = 0; i <= width; i++) arr.push(cells[i] ?? "");
    if (arr.some((c) => c.trim() !== "")) rows.push({ line: r, cells: arr });
  }
  return rows;
}

// Images embarquées : feuille -> drawing -> rels -> xl/media, ancrage =
// ligne de <xdr:from> (0-based). Formats filtrés par la route (sniffImage).
async function sheetImages(
  read: (p: string) => Promise<string | null>,
  sheetPath: string,
  sheetXml: string,
  zip: JSZip
): Promise<AnchoredImage[]> {
  const out: AnchoredImage[] = [];
  const drawRid = /<drawing r:id="([^"]+)"\/?>/.exec(sheetXml);
  if (!drawRid) return out;
  const relsXml = await read(sheetPath.replace(/([^/]+)$/, "_rels/$1.rels"));
  if (!relsXml) return out;
  const dm = new RegExp('Id="' + drawRid[1] + '"[^>]*Target="([^"]+)"').exec(relsXml);
  if (!dm) return out;
  const drawPath = "xl/drawings/" + dm[1].replace(/^.*\//, "");
  const drawXml = await read(drawPath);
  if (!drawXml) return out;
  const drawRelsXml = await read(drawPath.replace(/([^/]+)$/, "_rels/$1.rels"));
  const media: Record<string, string> = {};
  if (drawRelsXml) {
    for (const m of drawRelsXml.matchAll(/<Relationship\b[^>]*>/g)) {
      if (!/Type="[^"]*\/image"/.test(m[0])) continue;
      const id = /Id="([^"]+)"/.exec(m[0]);
      const tgt = /Target="([^"]+)"/.exec(m[0]);
      if (id && tgt) media[id[1]] = "xl/media/" + tgt[1].replace(/^.*\//, "");
    }
  }
  for (const a of drawXml.matchAll(
    /<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>|<xdr:oneCellAnchor\b[\s\S]*?<\/xdr:oneCellAnchor>/g
  )) {
    const anchor = a[0];
    const rowM = /<xdr:row>(\d+)<\/xdr:row>/.exec(anchor);
    const blipM = /r:embed="([^"]+)"/.exec(anchor);
    if (!rowM || !blipM) continue;
    const mediaPath = media[blipM[1]];
    if (!mediaPath) continue;
    const f = zip.file(mediaPath);
    if (!f) continue;
    out.push({ line: Number(rowM[1]), buffer: await f.async("nodebuffer") });
  }
  return out;
}

interface BuiltStep {
  title: string;
  body: string;
  images: { buffer: Buffer; alt: string }[];
  startLine: number;
}

function rowText(cells: string[]): string {
  const uniq = [...new Set(cells.map((c) => c.trim()).filter((t) => t !== ""))];
  return uniq.join(" ; ");
}

// Construit les étapes d'UNE feuille (indépendante : lignes Excel locales).
function buildSheetSteps(rows: SheetRow[], images: AnchoredImage[], out: ImportStep[], warnings: string[]): void {
  if (!rows.length) return;
  const header = rows[0].cells.map(norm);
  const ti = header.findIndex((h) => HEADER_TITLES.has(h));
  const steps: BuiltStep[] = [];
  if (ti >= 0) {
    // Mode tableau : en-tête reconnu, une ligne = une étape.
    const bi = header.findIndex((h) => HEADER_BODIES.has(h));
    for (const row of rows.slice(1)) {
      let title = (row.cells[ti] ?? "").trim();
      if (!title) continue;
      const sm = STEP_RE.exec(title);
      if (sm && sm[1].trim()) title = sm[1].trim(); // « Étape 1 : Préparation » -> « Préparation »
      const body = bi >= 0 ? (row.cells[bi] ?? "") : rowText(row.cells.filter((c, i) => i !== ti));
      steps.push({ title: title.slice(0, 200), body: body.trim().slice(0, 50000), images: [], startLine: row.line });
    }
  } else {
    // Mode blocs : repère « Étape/Phase/Step » sur TOUTES les colonnes.
    let hasMarker = false;
    let cur: BuiltStep | null = null;
    let pre: BuiltStep | null = null;
    for (const row of rows) {
      let mc = -1;
      let mt = "";
      for (let i = 0; i < row.cells.length; i++) {
        const sm = STEP_RE.exec((row.cells[i] ?? "").trim());
        if (sm) { mc = i; mt = (sm[1] || "").trim(); break; }
      }
      if (mc >= 0) {
        hasMarker = true;
        const rest = rowText(row.cells.filter((c, i) => i !== mc));
        cur = { title: (mt || row.cells[mc].trim()).slice(0, 200), body: rest, images: [], startLine: row.line };
        steps.push(cur);
      } else {
        const text = rowText(row.cells);
        if (!text) continue;
        if (!cur && !pre) pre = { title: "Préambule", body: "", images: [], startLine: row.line };
        const target = cur ?? (pre as BuiltStep);
        target.body = (target.body ? target.body + "\n" : "") + text;
      }
    }
    if (!hasMarker) {
      // Fallback C-101 : colonne A = titres, colonnes suivantes = description.
      warnings.push("feuille sans en-tête ni repère « Étape/Phase/Step » : colonne A = titres, colonnes suivantes = description");
      steps.length = 0;
      for (const row of rows) {
        const title = (row.cells[0] ?? "").trim();
        if (!title) continue;
        steps.push({ title: title.slice(0, 200), body: rowText(row.cells.slice(1)).slice(0, 50000), images: [], startLine: row.line });
      }
    } else if (pre) {
      steps.unshift(pre);
    }
  }
  // Images : rattacher à l'étape couvrant leur ligne d'ancrage.
  if (steps.length) {
    for (const img of images) {
      let target: BuiltStep | undefined;
      for (const s of steps) {
        if (s.startLine <= img.line) target = s;
        else break;
      }
      (target ?? steps[0]).images.push({ buffer: img.buffer, alt: "" });
    }
  }
  for (const s of steps) out.push({ title: s.title, body: s.body, images: s.images });
}

export async function parseXlsx(buf: Buffer): Promise<ParseResult> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(buf);
  const read = async (p: string): Promise<string | null> => {
    const f = zip.file(p);
    return f ? await f.async("string") : null;
  };

  const shared: string[] = [];
  const sharedXml = await read("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const si of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join(""));
    }
  }

  const wbXml = await read("xl/workbook.xml");
  if (!wbXml) throw new ImportError("classeur xlsx illisible (workbook.xml absent)");
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (!relsXml) throw new ImportError("classeur xlsx illisible (feuilles introuvables)");
  const rels: Record<string, string> = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    if (!/Type="[^"]*\/worksheet"/.test(m[0])) continue;
    const id = /Id="([^"]+)"/.exec(m[0]);
    const tgt = /Target="([^"]+)"/.exec(m[0]);
    if (id && tgt) rels[id[1]] = "xl/" + tgt[1].replace(/^\//, "").replace(/^xl\//, "");
  }
  const sheets: { name: string; path: string }[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = / name="([^"]*)"/.exec(m[0]);
    const rid = /r:id="([^"]+)"/.exec(m[0]);
    if (name && rid && rels[rid[1]]) sheets.push({ name: decodeXml(name[1]), path: rels[rid[1]] });
  }
  if (!sheets.length) throw new ImportError("classeur xlsx illisible (feuilles introuvables)");
  if (sheets.length > 1) {
    warnings.push(sheets.length + " feuilles importées à la suite : " + sheets.map((s) => s.name).join(", "));
  }

  const steps: ImportStep[] = [];
  for (const sheet of sheets) {
    const sheetXml = await read(sheet.path);
    if (!sheetXml) continue;
    const rows = sheetRows(sheetXml, shared);
    if (!rows.length) continue;
    const images = await sheetImages(read, sheet.path, sheetXml, zip);
    buildSheetSteps(rows, images, steps, warnings);
  }
  if (!steps.length) throw new ImportError("classeur sans contenu exploitable (aucune étape identifiable)");
  return { steps, warnings };
}
