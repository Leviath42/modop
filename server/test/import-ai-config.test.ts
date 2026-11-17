import { after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/schema.js";
import { createApp } from "../src/app.js";
const NL = String.fromCharCode(10);

// C-110 (V14 #3) — configuration du moteur IA EN BASE (settings « ai_engine »,
// « ai_engine », page Paramètres) : ce fichier vérifie SANS AUCUNE VARIABLE D'ENVIRONNEMENT
// que l'import IA fonctionne depuis la config en base, que la clé de la base
// est bien transmise au moteur (Bearer), et que le toggle « enabled »
// verrouille l'import sans retirer la config. (Fichier autonome : propre
// serveur, propre rate limiter.)

process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-iacfg-"));
delete process.env.MODOP_AI_BASE_URL;
delete process.env.MODOP_AI_MODEL;
delete process.env.MODOP_AI_API_KEY;

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author");
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

// Faux moteur : capture l'en-tête d'autorisation reçu.
const mockState: { auth?: string; reply?: string } = {};
const mock = http.createServer((rq, rs) => {
  let body = "";
  rq.on("data", (c) => (body += c));
  rq.on("end", () => {
    mockState.auth = rq.headers.authorization ?? "";
    rs.writeHead(200, { "content-type": "application/json" });
    rs.end(JSON.stringify({ choices: [{ message: { content: mockState.reply ?? "{}" } }] }));
  });
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const mockBase = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;

// Config EN BASE (comme si l'admin l'avait enregistrée dans Paramètres).
function setAiConfig(enabled: boolean) {
  const value = JSON.stringify({
    enabled,
    base_url: mockBase + "/v1",
    model: "cfg-db-model",
    api_key: "cle-de-la-base",
    timeout_ms: 30000,
  });
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("ai_engine", value);
}
setAiConfig(true);

function pdfBlob() {
  // PDF minimal (même recette que import-ai.test.ts).
  const stream = "BT /F1 12 Tf 72 720 Td (Fiche) Tj ET";
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
  return new Blob([new Uint8Array(Buffer.from(out, "latin1"))], { type: "application/pdf" });
}

after(() => {
  server.close();
  mock.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

test("C-110 : import IA piloté par la config en base (sans env) — clé de la base transmise au moteur", async () => {
  mockState.reply = JSON.stringify({
    title: "Via la base",
    reference: "",
    description: "",
    steps: [{ number: 1, title: "Une", body: "Corps", pictos: [] }],
    a_completer: [],
  });
  const fd = new FormData();
  fd.append("file", pdfBlob(), "fiche.pdf");
  fd.append("ai", "1");
  const res = await fetch(base + "/api/import/document", { method: "POST", headers: { cookie: auteur }, body: fd });
  assert.equal(res.status, 201);
  const out = await res.json();
  assert.equal(out.ai_used, true);
  assert.equal(out.steps_created, 1);
  // La clé vient de la config en base, pas d'un env inexistant.
  assert.equal(mockState.auth, "Bearer cle-de-la-base");
});

test("C-110 : toggle off en base — import verrouillé, config conservée", async () => {
  setAiConfig(false);
  const fd = new FormData();
  fd.append("file", pdfBlob(), "fiche.pdf");
  fd.append("ai", "1");
  const res = await fetch(base + "/api/import/document", { method: "POST", headers: { cookie: auteur }, body: fd });
  assert.equal(res.status, 422);
  const out = await res.json();
  assert.match(String(out.message), /non activé/);
  // La config est toujours là (visible dans le statut).
  const st = await (await fetch(base + "/api/ai", { headers: { cookie: auteur } })).json();
  assert.equal(st.enabled, false);
  assert.equal(st.base_url, mockBase + "/v1");
  assert.equal(st.model, "cfg-db-model");
  assert.equal(st.key_set, true);
});
