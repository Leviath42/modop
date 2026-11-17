import { after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { openDb } from "../src/db/schema.js";
import { createApp } from "../src/app.js";
import { resetRateLimits } from "../src/auth/security.js";
const NL = String.fromCharCode(10);

// PDF minimal écrit à la main (même recette que import.test.ts — les tests
// du projet sont autonomes, pas de fixture binaire dans le repo).
function makePdf(lines: string[]): Buffer {
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


// C-113 (V14 #7) : PDF 1 page avec textes ET images positionnés — même
// recette que import-images.test.ts (pas de fixture binaire), XObject
// FlateDecode RGB partagé /Im1 dessiné à plusieurs positions.
function makePdfAiImg(texts: { text: string; x: number; y: number }[], imgs: { x: number; y: number; w: number; h: number }[]): Buffer {
  let stream = "";
  for (const t of texts) {
    stream += "BT /F1 12 Tf " + t.x + " " + t.y + " Td (" + t.text + ") Tj ET" + NL;
  }
  for (const im of imgs) {
    stream += "q " + im.w + " 0 0 " + im.h + " " + im.x + " " + im.y + " cm /Im1 Do Q" + NL;
  }
  const raw = Buffer.alloc(16 * 16 * 3, 200);
  const data = zlib.deflateSync(raw);
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>",
    "<< /Length " + Buffer.byteLength(stream, "latin1") + " >>" + NL + "stream" + NL + stream + "endstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length " + data.length + " >>" + NL + "stream" + NL + data.toString("latin1") + "endstream",
  ];
  let out = "%PDF-1.4" + NL;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += i + 1 + " 0 obj" + NL + o + NL + "endobj" + NL;
  });
  const xref = out.length;
  out += "xref" + NL + "0 " + (objs.length + 1) + NL + "0000000000 65535 f " + NL;
  for (const off of offsets) out += String(off).padStart(10, "0") + " 00000 n " + NL;
  out += "trailer" + NL + "<< /Size " + (objs.length + 1) + " /Root 1 0 R >>" + NL + "startxref" + NL + xref + NL + "%%EOF" + NL;
  return Buffer.from(out, "latin1");
}
// C-109 (V14 #2) — import PDF assisti par IA : mode ai=1 sur
// /api/import/document, contre un FAUX moteur OpenAI en loopback. Garde-fous
// testés : moteur non configuré => 422 ; PDF uniquement ; TRI PAR NUMÉRO DE
// LA SOURCE (le mock renvoie les étapes désordonnées 3,1,2) ; pictos filtrés
// sur les indications actives ; a_completer => commentaires d'auteurs sur la
// bonne étape ; référence IA déjà prise => IMP- + warning ; PDF scanné
// accepté (lève le refus OCR C-101) ; réponse illisible => 502 propre.
process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-ia-"));

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run(
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author"
);
const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const auteur = (
  await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "auteur@modop.local", password: "auteurpass1" }),
  })
).headers.get("set-cookie")?.split(";")[0] ?? "";

const mockState: { reply?: string; status?: number } = {};
const mock = http.createServer((rq, rs) => {
  let body = "";
  rq.on("data", (c) => (body += c));
  rq.on("end", () => {
    if (mockState.status) {
      rs.writeHead(mockState.status, { "content-type": "application/json" });
      rs.end("{}");
      return;
    }
    rs.writeHead(200, { "content-type": "application/json" });
    rs.end(JSON.stringify({ choices: [{ message: { content: mockState.reply ?? "{}" } }] }));
  });
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const mockBase = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;

async function uploadAi(name: string, buf: Buffer, ai: boolean): Promise<{ status: number; json?: Record<string, unknown> }> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(buf)]), name);
  if (ai) fd.append("ai", "1");
  const res = await fetch(base + "/api/import/document", {
    method: "POST",
    headers: { cookie: auteur },
    body: fd,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const PROPOSAL = JSON.stringify({
  title: "Collage squelette C6",
  reference: "FP262 A",
  description: "Assemblage de deux embases par une tige.",
  steps: [
    { number: 3, title: "Troisième", body: "Corps trois", pictos: ["outil", "picto-inconnu"] },
    { number: 1, title: "Première", body: "Corps un", pictos: [] },
    { number: 2, title: "Deuxième", body: "Corps deux", pictos: ["info"] },
  ],
  a_completer: [
    { step: 2, question: "Critère de parallélisme à préciser" },
    { step: null, question: "Catégorie et responsable à renseigner" },
  ],
});

after(() => {
  server.close();
  mock.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

test("C-109 : mode IA sans moteur configuré => 422 actionnable", async () => {
  const out = await uploadAi("fiche.pdf", makePdf(["Étape 1 - Preparation"]), true);
  assert.equal(out.status, 422);
  assert.match(String(out.json?.message), /non activé/);
});

test("C-109 : mode IA hors PDF => 422", async () => {
  process.env.MODOP_AI_BASE_URL = mockBase + "/v1";
  process.env.MODOP_AI_MODEL = "test-vision-1";
  process.env.MODOP_AI_API_KEY = "test";
  const out = await uploadAi("fiche.docx", Buffer.from("pas un zip"), true);
  assert.equal(out.status, 422);
  assert.match(String(out.json?.message), /PDF/);
});

test("C-109 : import IA — tri par numéro de la SOURCE, pictos filtrés, todo en commentaires", async () => {
  // La référence proposée par l'IA est déjà prise => IMP- + warning.
  db.prepare("INSERT INTO workflows (title, reference, description, category, family) VALUES (?, ?, '', '', '')").run(
    "MO existant",
    "FP262 A"
  );

  mockState.reply = PROPOSAL;
  const out = await uploadAi("FP 0262 A.pdf", makePdf(["Fiche de poste", "Etapes en colonnes"]), true);
  assert.equal(out.status, 201);
  assert.equal(out.json?.ai_used, true);
  assert.equal(out.json?.steps_created, 3);
  const warnings = (out.json?.warnings as string[]).join(" | ");
  assert.match(warnings, /proposée par le moteur IA/);
  assert.match(warnings, /déjà utilisée/);

  const wf = out.json?.workflow as Record<string, unknown>;
  assert.equal(wf.title, "Collage squelette C6");
  assert.match(String(wf.reference), /^IMP-/);
  assert.match(String(wf.description), /À RELIRE/);

  const full = await (
    await fetch(base + "/api/workflows/" + wf.id, { headers: { cookie: auteur } })
  ).json();
  const steps = full.steps as { id: number; position: number; title: string; pictos: string[] }[];
  assert.deepEqual(
    steps.map((s) => s.title),
    ["Première", "Deuxième", "Troisième"]
  );
  assert.deepEqual(steps[0].pictos, []);
  assert.deepEqual(steps[1].pictos, ["info"]);
  assert.deepEqual(steps[2].pictos, ["outil"]);
  // Commentaires d'auteurs (C-96) : API dédiée par étape.
  const com = async (sid: number): Promise<string[]> =>
    (await (await fetch(base + "/api/steps/" + sid + "/comments", { headers: { cookie: auteur } })).json() as Promise<
      { message: string }[]
    >).map((c) => c.message);
  const msgs = await com(steps[1].id);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /À COMPLÉTER \(import IA\) : Critère de parallélisme/);
  const msgs0 = await com(steps[0].id);
  assert.match(msgs0[0], /Catégorie et responsable/);
});

test("C-109 : PDF scanné accepté en mode IA (lève le refus OCR C-101)", async () => {
  mockState.reply = JSON.stringify({
    title: "Scan",
    reference: "",
    description: "",
    steps: [{ number: 1, title: "Unique", body: "Texte lu par vision", pictos: [] }],
    a_completer: [],
  });
  const out = await uploadAi("scan.pdf", makePdf([]), true);
  assert.equal(out.status, 201);
  const warnings = (out.json?.warnings as string[]).join(" | ");
  assert.match(warnings, /couche texte/);
});

test("C-113 : mode IA — photos extraites du PDF d'origine rattachées aux étapes (V14 #7)", async () => {
  resetRateLimits(); // fenêtre 10 min : purge pour ne pas hériter des quotas des tests précédents
  const pdf = makePdfAiImg(
    [{ text: "Etape 1 : Preparation", x: 72, y: 700 }, { text: "Etape 2 : Assemblage", x: 72, y: 500 }],
    [{ x: 72, y: 600, w: 150, h: 100 }, { x: 72, y: 400, w: 150, h: 100 }]
  );
  mockState.reply = JSON.stringify({
    title: "Fiche avec photos",
    reference: "",
    description: "",
    steps: [
      { number: 2, title: "Assemblage", body: "corps 2", pictos: [] },
      { number: 1, title: "Preparation", body: "corps 1", pictos: [] },
    ],
    a_completer: [],
  });
  const out = await uploadAi("fiche-photos.pdf", pdf, true);
  assert.equal(out.status, 201);
  assert.equal(out.json?.steps_created, 2);
  assert.equal(out.json?.photos_created, 2);
  const warnings = (out.json?.warnings as string[]).join(" | ");
  assert.match(warnings, /extraite\(s\) du PDF d'origine et rattachée\(s\) par position/);
  const wf = await (await fetch(base + "/api/workflows/" + out.json?.workflow.id, { headers: { cookie: auteur } })).json();
  const steps = wf.steps as { title: string; photos: { filename: string; alt: string }[] }[];
  assert.equal(steps[0].title, "Preparation");
  assert.equal(steps[0].photos.length, 1, "photo du haut sur l'étape 1");
  assert.equal(steps[1].photos.length, 1, "photo du bas sur l'étape 2");
  assert.match(steps[0].photos[0].alt, /PDF/);
  assert.ok(
    steps.every((s) => s.photos.every((p) => fs.existsSync(path.join(process.env.MODOP_PHOTOS_DIR!, p.filename)))),
    "fichiers photo écrits"
  );
});

test("C-113 : mode IA sans repère lisible — photos extraites mais non rattachées, warning à la main", async () => {
  resetRateLimits(); // fenêtre 10 min : purge pour ne pas hériter des quotas des tests précédents
  const pdf = makePdfAiImg([{ text: "Fiche sans repere", x: 72, y: 700 }], [{ x: 72, y: 400, w: 150, h: 100 }]);
  mockState.reply = JSON.stringify({
    title: "Sans repere", reference: "", description: "",
    steps: [{ number: 1, title: "Unique", body: "corps", pictos: [] }],
    a_completer: [],
  });
  const out = await uploadAi("fiche-sans-repere.pdf", pdf, true);
  assert.equal(out.status, 201);
  assert.equal(out.json?.photos_created, 0);
  const warnings = (out.json?.warnings as string[]).join(" | ");
  assert.match(warnings, /0 rattachée\(s\) seulement/);
  assert.match(warnings, /à la main/);
});
test("C-109 : réponse moteur illisible => 502 propre", async () => {
  mockState.reply = "je refuse de répondre en JSON";
  const out = await uploadAi("fiche2.pdf", makePdf(["Étape 1 - X"]), true);
  assert.equal(out.status, 502);
  mockState.reply = undefined;
});

test("C-109 : import classique inchangé — PDF sans texte => 422 OCR", async () => {
  const out = await uploadAi("scan2.pdf", makePdf([]), false);
  assert.equal(out.status, 422);
  assert.match(String(out.json?.message), /OCR/);
});
