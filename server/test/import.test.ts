import { after, test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import bcrypt from "bcryptjs";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/schema.js";
import { createApp } from "../src/app.js";
import { parseDocx } from "../src/lib/import/docx.js";
import { parsePdf } from "../src/lib/import/pdf.js";
import { parseXlsx } from "../src/lib/import/xlsx.js";

// C-101 (V8 #6, RF-78) — import de documents existants : parseurs docx/pdf/
// xlsx + route POST /api/import/document (brouillon, jamais publié d'office).
// Les documents de test sont GÉNÉRÉS ici (jszip pour docx/xlsx, pdf minimal
// écrit à la main) — pas de fixture binaire dans le repo.
process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-imp-"));

const NL = String.fromCharCode(10);
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

interface DocxBlock {
  heading?: string;
  text?: string;
  image?: boolean;
}

export async function makeDocx(blocks: DocxBlock[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId101" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`
  );
  zip.file("word/media/image1.png", PNG_1PX);
  const body = blocks
    .map((b) => {
      if (b.heading) {
        return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${b.heading}</w:t></w:r></w:p>`;
      }
      if (b.image) {
        return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="image1.png"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId101"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9525" cy="9525"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
      }
      return `<w:p><w:r><w:t>${b.text ?? ""}</w:t></w:r></w:p>`;
    })
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

export function makePdf(lines: string[]): Buffer {
  const content = lines.map((l, i) => (i === 0 ? "72 720 Td (" + l + ") Tj" : "0 -20 Td (" + l + ") Tj")).join(" ");
  const stream = "BT /F1 12 Tf " + content + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length " + Buffer.byteLength(stream, "latin1") + " >>" + NL + "stream" + NL + stream + NL + "endstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4" + NL;
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(out.length);
    out += i + 1 + " 0 obj" + NL + objs[i] + NL + "endobj" + NL;
  }
  const xref = out.length;
  out += "xref" + NL + "0 " + (objs.length + 1) + NL + "0000000000 65535 f " + NL;
  for (const off of offsets) out += String(off).padStart(10, "0") + " 00000 n " + NL;
  out += "trailer" + NL + "<< /Size " + (objs.length + 1) + " /Root 1 0 R >>" + NL + "startxref" + NL + xref + NL + "%%EOF" + NL;
  return Buffer.from(out, "latin1");
}

export async function makeXlsx(rows: string[][]): Promise<Buffer> {
  const shared: string[] = [];
  const si = (s: string): number => {
    shared.push(s);
    return shared.length - 1;
  };
  const sheetRows = rows
    .map(
      (row, ri) =>
        `<row r="${ri + 1}">` +
        row.map((cell, ci) => `<c r="${String.fromCharCode(65 + ci)}${ri + 1}" t="s"><v>${si(cell)}</v></c>`).join("") +
        `</row>`
    )
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  );
  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

// ---- E2E : app réelle, dossier photos temporaire ----
const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?)"
).run(
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author",
  "lecteur@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader"
);
const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function login(email: string, pass: string): Promise<string> {
  const res = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const auteur = await login("auteur@modop.local", "auteurpass1");
const lecteur = await login("lecteur@modop.local", "lecteurpass1");

async function upload(cookie: string, name: string, buf: Buffer): Promise<{ status: number; json?: Record<string, unknown> }> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(buf)]), name);
  const res = await fetch(base + "/api/import/document", {
    method: "POST",
    headers: { cookie },
    body: fd,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

after(() => {
  server.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

test("C-101 : parseurs — docx titres+image, pdf regex étapes, xlsx header+fallback", async () => {
  const docx = await parseDocx(
    await makeDocx([
      { text: "Titre du document" },
      { heading: "Préparation du poste" },
      { text: "Vérifier l'équipement." },
      { heading: "Montage" },
      { text: "Fixer les vis." },
      { image: true },
    ])
  );
  assert.equal(docx.steps.length, 3); // Préambule + 2 titres
  assert.equal(docx.steps[0].title, "Préambule");
  assert.equal(docx.steps[0].body, "Titre du document");
  assert.equal(docx.steps[1].title, "Préparation du poste");
  assert.equal(docx.steps[1].body, "Vérifier l'équipement.");
  assert.equal(docx.steps[2].title, "Montage");
  assert.equal(docx.steps[2].body, "Fixer les vis.");
  assert.equal(docx.steps[2].images.length, 1);

  const pdf = await parsePdf(
    makePdf(["Étape 1 - Préparation du poste", "Vérifier l'équipement.", "Étape 2 - Montage", "Fixer les vis."])
  );
  assert.equal(pdf.steps.length, 2);
  assert.equal(pdf.steps[0].title, "Préparation du poste");
  assert.equal(pdf.steps[0].body, "Vérifier l'équipement.");
  assert.equal(pdf.steps[1].title, "Montage");

  const xlsx = await parseXlsx(
    await makeXlsx([
      ["titre", "description"],
      ["Préparation", "Vérifier l'équipement."],
      ["Montage", "Fixer les vis."],
    ])
  );
  assert.equal(xlsx.steps.length, 2);
  assert.equal(xlsx.steps[0].title, "Préparation");
  assert.equal(xlsx.steps[0].body, "Vérifier l'équipement.");
  assert.equal(xlsx.warnings.length, 0);

  const xlsx2 = await parseXlsx(await makeXlsx([["Préparation", "Vérifier."], ["Montage", "Fixer."]]));
  assert.equal(xlsx2.steps.length, 2);
  assert.equal(xlsx2.steps[0].title, "Préparation");
  assert.equal(xlsx2.steps[0].body, "Vérifier.");
  assert.equal(xlsx2.warnings.length, 1); // pas d'en-tête reconnu
});

test("C-101 : import docx (author) crée un BROUILLON, étapes + photo sur disque", async () => {
  const buf = await makeDocx([
    { heading: "Préparation du poste" },
    { text: "Vérifier l'équipement." },
    { heading: "Montage" },
    { text: "Fixer les vis." },
    { image: true },
  ]);
  const { status, json } = await upload(auteur, "Mode opératoire de test.docx", buf);
  assert.equal(status, 201);
  assert.equal(json.workflow.state, "draft");
  assert.match(json.workflow.reference, /^IMP-/);
  assert.equal(json.workflow.title, "Mode opératoire de test");
  assert.equal(json.steps_created, 2);
  assert.equal(json.photos_created, 1);
  const files = fs.readdirSync(process.env.MODOP_PHOTOS_DIR!);
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith(".png"));
  const wf = await (await fetch(base + "/api/workflows/" + json.workflow.id, { headers: { cookie: auteur } })).json();
  assert.equal(wf.steps.length, 2);
  assert.equal(wf.steps[1].title, "Montage");
  assert.equal(wf.steps[1].photos.length, 1);
});

test("C-101 : import xlsx crée le brouillon depuis les lignes", async () => {
  const buf = await makeXlsx([
    ["titre", "description"],
    ["Préparation", "Vérifier l'équipement."],
    ["Montage", "Fixer les vis."],
  ]);
  const { status, json } = await upload(auteur, "procédure maintenance.xlsx", buf);
  assert.equal(status, 201);
  assert.equal(json.steps_created, 2);
  assert.equal(json.photos_created, 0);
});

test("C-101 : garde-fous — 403 lecteur, 422 formats refusés, 422 pdf sans texte", async () => {
  const xlsx = await makeXlsx([["titre"], ["Étape unique"]]);
  assert.equal((await upload(lecteur, "a.xlsx", xlsx)).status, 403);
  assert.equal((await upload(auteur, "notes.txt", Buffer.from("hello"))).status, 422);
  assert.equal((await upload(auteur, "fake.docx", Buffer.from("pas un zip"))).status, 422);
  const scan = await upload(auteur, "scan.pdf", makePdf([]));
  assert.equal(scan.status, 422);
  assert.match(String(scan.json?.message), /OCR/);
});
