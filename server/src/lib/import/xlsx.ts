import JSZip from "jszip";
import { ImportError, type ParseResult, type ImportStep } from "./types.js";

// C-101 (V8 #6, RF-78) : lecteur xlsx MINIMAL en lecture seule (jszip + XML).
// Choix supply-chain : exceljs traîne uuid<11 (GHSA-w5hq-g745-h8pq, non
// corrigé côté éditeur) et une meute de paquets deprecated ; l'override npm
// casse la résolution (testé ce jour). Un lecteur ciblé = zéro dépendance
// supplémentaire au-delà de jszip. Périmètre : première feuille, cellules
// texte/nombres (valeur calculée des formules), inlineStr/sharedStrings ;
// les dates sérielles ne sont pas converties en v1.

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

function colIndex(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
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
  const sheetTag = /<sheet\b[^>]*>/.exec(wbXml);
  const ridM = sheetTag ? /r:id="([^"]+)"/.exec(sheetTag[0]) : null;
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (!ridM || !relsXml) throw new ImportError("classeur xlsx illisible (feuilles introuvables)");
  const relM = new RegExp('Id="' + ridM[1] + '"[^>]*Target="([^"]+)"').exec(relsXml);
  if (!relM) throw new ImportError("classeur xlsx illisible (première feuille introuvable)");
  const sheetPath = "xl/" + relM[1].replace(/^\//, "").replace(/^xl\//, "");
  const sheetXml = await read(sheetPath);
  if (!sheetXml) throw new ImportError("classeur xlsx illisible (feuille absente)");

  const rows: string[][] = [];
  for (const rowM of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<number, string> = {};
    for (const cm of rowM[1].matchAll(/<c\b([^>]*\/|[^>]*>[\s\S]*?<\/c>)/g)) {
      const cellXml = cm[1];
      const refM = /r="([A-Z]+\d+)"/.exec(cellXml);
      if (!refM) continue;
      const tM = /t="([^"]+)"/.exec(cellXml);
      let text = "";
      if (tM && tM[1] === "s") {
        const vM = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
        if (vM) text = shared[Number(vM[1])] ?? "";
      } else if (tM && tM[1] === "inlineStr") {
        text = [...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");
      } else {
        const vM = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
        if (vM) text = decodeXml(vM[1]).replace(/^(-?\d+)\.0+$/, "$1");
      }
      const idx = colIndex(refM[1]);
      if (idx >= 0 && text.trim() !== "") cells[idx] = text;
    }
    const width = Math.max(-1, ...Object.keys(cells).map(Number));
    const row: string[] = [];
    for (let i = 0; i <= width; i++) row.push(cells[i] ?? "");
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  if (!rows.length) throw new ImportError("feuille vide : aucune ligne exploitable");

  // Mapping : en-tête reconnu (titre/étape + description/texte) sinon
  // colonne A = titre, colonnes suivantes = description.
  const first = rows[0].map(norm);
  const ti = first.findIndex((h) => HEADER_TITLES.has(h));
  const bi = first.findIndex((h) => HEADER_BODIES.has(h));
  let dataRows = rows;
  let titleIdx = 0;
  let bodyIdx = -1;
  if (ti >= 0) {
    dataRows = rows.slice(1);
    titleIdx = ti;
    bodyIdx = bi >= 0 ? bi : -1;
  } else {
    warnings.push("aucun en-tête reconnu : colonne A = titres d'étapes, colonnes suivantes = description");
  }
  const steps: ImportStep[] = [];
  for (const row of dataRows) {
    const title = (row[titleIdx] ?? "").trim();
    if (!title) continue;
    const body = bodyIdx >= 0 ? (row[bodyIdx] ?? "") : row.slice(1).filter(Boolean).join(" ; ");
    steps.push({ title: title.slice(0, 200), body: body.trim().slice(0, 50000), images: [] });
  }
  if (!steps.length) throw new ImportError("aucune ligne exploitable (colonne des titres vide)");
  return { steps, warnings };
}
