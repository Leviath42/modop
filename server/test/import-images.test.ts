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
import { parsePdf } from "../src/lib/import/pdf.js";

// C-112 (V14 #3) — extraction déterministe des images EMBARQUÉES d'un PDF
// (étage 1) et rattachement aux étapes PAR POSITION : images décodées en
// JPEG, boîtes affichées calculées via la matrice, image pleine page (scan)
// et pictos ignorés, association à l'étape la plus proche dans le flux de
// lecture. Le PDF de test est écrit à la main avec des XObject FlateDecode
// RGB (pas de fixture binaire dans le repo, même recette que import.test.ts).

process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-img-"));
const NL = String.fromCharCode(10);

// 16x16 RGB (contenu distinct par image)
function rawRgb(n: number): Buffer {
  const px = Buffer.alloc(16 * 16 * 3);
  for (let i = 0; i < px.length; i += 3) {
    px[i] = n === 1 ? 220 : 40;
    px[i + 1] = n === 1 ? 30 : 200;
    px[i + 2] = 60;
  }
  return px;
}

interface TextEl {
  text: string;
  x: number;
  y: number;
}
interface ImgEl {
  im: number; // n° de l'objet image (1..3)
  x: number;
  y: number;
  w: number;
  h: number;
}

// PDF 1 page : textes positionnés + images XObject positionnées (q W 0 0 H x
// y cm /ImN Do Q), MediaBox 612x792.
function makePdfImages(texts: TextEl[], images: ImgEl[]): Buffer {
  let stream = "";
  for (const t of texts) {
    stream += "BT /F1 12 Tf " + t.x + " " + t.y + " Td (" + t.text + ") Tj ET" + NL;
  }
  for (const im of images) {
    stream += "q " + im.w + " 0 0 " + im.h + " " + im.x + " " + im.y + " cm /Im" + im.im + " Do Q" + NL;
  }
  const imgData = [1, 2, 3].map((n) => zlib.deflateSync(rawRgb(n)));
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R /Im2 7 0 R /Im3 8 0 R >> >> >>",
    "<< /Length " + Buffer.byteLength(stream, "latin1") + " >>" + NL + "stream" + NL + stream + "endstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4" + NL;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += i + 1 + " 0 obj" + NL + o + NL + "endobj" + NL;
  });
  imgData.forEach((data, i) => {
    offsets.push(out.length);
    out +=
      i + 6 + " 0 obj" + NL +
      "<< /Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length " +
      data.length + " >>" + NL + "stream" + NL;
    out += data.toString("latin1") + "endstream" + NL + "endobj" + NL;
  });
  const xref = out.length;
  out += "xref" + NL + "0 " + (objs.length + imgData.length + 1) + NL + "0000000000 65535 f " + NL;
  for (const off of offsets) out += String(off).padStart(10, "0") + " 00000 n " + NL;
  out += "trailer" + NL + "<< /Size " + (objs.length + imgData.length + 1) + " /Root 1 0 R >>" + NL + "startxref" + NL + xref + NL + "%%EOF" + NL;
  return Buffer.from(out, "latin1");
}

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

after(() => {
  server.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

// Deux étapes, une photo chacune, une image pleine page (scan) à ignorer.
const PDF2 = makePdfImages(
  [
    { text: "Etape 1 : Preparation", x: 72, y: 700 },
    { text: "Etape 2 : Assemblage", x: 72, y: 500 },
  ],
  [
    { im: 1, x: 72, y: 600, w: 150, h: 100 }, // centre y=650 → étape 1
    { im: 2, x: 72, y: 400, w: 150, h: 100 }, // centre y=450 → étape 2
    { im: 3, x: 0, y: 0, w: 612, h: 792 }, // pleine page → ignorée
  ]
);

test("C-112 : parsePdf — images extraites en JPEG et rattachées par position, scan pleine page ignoré", async () => {
  const res = await parsePdf(PDF2);
  assert.equal(res.steps.length, 2);
  assert.equal(res.steps[0].title, "Preparation");
  assert.equal(res.steps[1].title, "Assemblage");
  assert.equal(res.steps[0].images.length, 1, "l'image du haut doit aller sur l'étape 1");
  assert.equal(res.steps[1].images.length, 1, "l'image du bas doit aller sur l'étape 2");
  for (const im of [...res.steps[0].images, ...res.steps[1].images]) {
    assert.ok(im.buffer.length > 100, "JPEG non vide");
    assert.equal(im.buffer.subarray(0, 2).toString("latin1"), String.fromCharCode(0xff, 0xd8), "magic JPEG");
    assert.match(im.alt, /PDF/);
  }
  const warnings = res.warnings.join(" | ");
  assert.match(warnings, /2 photo/);
  assert.match(warnings, /pleine page/);
});

test("C-112 : sans repère d'étape — les images suivent l'étape unique", async () => {
  const pdf = makePdfImages([{ text: "Fiche sans repere", x: 72, y: 700 }], [
    { im: 1, x: 72, y: 600, w: 150, h: 100 },
    { im: 2, x: 72, y: 400, w: 150, h: 100 },
  ]);
  const res = await parsePdf(pdf);
  assert.equal(res.steps.length, 1);
  assert.equal(res.steps[0].images.length, 2);
});

test("C-112 : route import — les photos extraites deviennent des pièces jointes du brouillon", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(PDF2)], { type: "application/pdf" }), "fiche-images.pdf");
  const res = await fetch(base + "/api/import/document", { method: "POST", headers: { cookie: auteur }, body: fd });
  assert.equal(res.status, 201);
  const out = await res.json();
  assert.equal(out.steps_created, 2);
  assert.equal(out.photos_created, 2);
  assert.match(out.warnings.join(" | "), /2 photo/);
  const wf = await (await fetch(base + "/api/workflows/" + out.workflow.id, { headers: { cookie: auteur } })).json();
  const steps = wf.steps as { photos: { filename: string; alt: string }[] }[];
  const total = steps.reduce((n, s) => n + s.photos.length, 0);
  assert.equal(total, 2, "photos présentes dans le brouillon");
  for (const p of steps.flatMap((s) => s.photos)) {
    assert.ok(fs.existsSync(path.join(process.env.MODOP_PHOTOS_DIR!, p.filename)), "fichier photo écrit : " + p.filename);
    assert.match(p.alt, /PDF/);
  }
});
