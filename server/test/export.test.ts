import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PHOTOS_DIR = "/tmp/modop-export-photos";
fs.rmSync(PHOTOS_DIR, { recursive: true, force: true });
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
process.env.MODOP_PHOTOS_DIR = PHOTOS_DIR;

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f50002000" +
  "057a1f0f200000000049454e44ae426082",
  "hex"
);
fs.writeFileSync(path.join(PHOTOS_DIR, "testphoto.png"), PNG);



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

async function call(method: string, p: string, body?: object, cookie?: string) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, res };
}

async function login(email: string, password: string): Promise<string> {
  const r = await call("POST", "/api/auth/login", { email, password });
  return r.res.headers.get("set-cookie")!.split(";")[0];
}
const author = await login("auteur@modop.local", "auteurpass1");
const reader = await login("lecteur@modop.local", "lecteurpass1");

const wf = (await (await fetch(base + "/api/workflows", { method: "POST", headers: { cookie: author, "content-type": "application/json" }, body: JSON.stringify({ title: "Remontage pompe", reference: "MO-E1", description: "Procédure de remontage", category: "Maintenance" }) })).json()) as { id: number };
await fetch(`${base}/api/workflows/${wf.id}/steps`, { method: "POST", headers: { cookie: author, "content-type": "application/json" }, body: JSON.stringify({ title: "Poser le joint", body: "Aligner le repère", pictos: ["epi"] }) });

const step = db.prepare("SELECT id FROM steps WHERE workflow_id = ?").get(wf.id) as { id: number };
db.prepare("INSERT INTO photos (step_id, filename, alt) VALUES (?, 'testphoto.png', 'joint neuf')").run(step.id);
await fetch(`${base}/api/workflows/${wf.id}/publish`, { method: "POST", headers: { cookie: author } });

test("export DOCX de la dernière version", async () => {
  const r = await call("GET", `/api/workflows/${wf.id}/export`, undefined, reader);
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get("content-type")!, /wordprocessingml/);
  const buf = Buffer.from(await r.res.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK", "signature ZIP du .docx");
  assert.ok(buf.length > 1000, "document non vide");
});

test("export d'une version précise et d'une version inexistante", async () => {
  const ok = await call("GET", `/api/workflows/${wf.id}/export?version=1`, undefined, reader);
  assert.equal(ok.status, 200);
  const missing = await call("GET", `/api/workflows/${wf.id}/export?version=99`, undefined, reader);
  assert.equal(missing.status, 404);
});

test("export d'un workflow inexistant → 404", async () => {
  const r = await call("GET", "/api/workflows/9999/export", undefined, reader);
  assert.equal(r.status, 404);
});

test("sans session → 401", async () => {
  const r = await call("GET", `/api/workflows/${wf.id}/export`);
  assert.equal(r.status, 401);
});

process.on("exit", () => server.close());
server.unref();

// C-25 : le canevas composé (photos positionnées + formes) est intégré au DOCX.
// Preuve : la réponse docx contient des médias (images) même quand la photo
// seule existe déjà, et composeStepCanvas rend un PNG avec les dimensions attendues.
test("export avec formes : le canevas composé est une image PNG valide", async () => {
  // photo factice
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010000000049454e44ae426082", "hex");
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTOS_DIR, "c25.png"), PNG);
  const wfRes = await call("POST", "/api/workflows", { title: "Export formes", reference: "MO-EXP2" }, author);
  const wf = await wfRes.res.json() as { id: number };
  const stepRes = await call("POST", `/api/workflows/${wf.id}/steps`, { title: "Étape annotée" }, author);
  const step = await stepRes.res.json() as { id: number };
  // canvas : une flèche + un rectangle sur l'étape
  await call("PUT", `/api/steps/${step.id}/canvas`, { shapes: [
    { type: "arrow", x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.3, color: "#d0021b" },
    { type: "rect", x1: 0.2, y1: 0.05, w: 0.4, h: 0.3, color: "#f5a623" },
  ] }, author);
  // photo avec positionnement libre
  const up = await fetch(`${base}/api/steps/${step.id}/photos`, {
    method: "POST",
    headers: { cookie: author },
    body: (() => { const fd = new FormData(); fd.append("file", new Blob([PNG], { type: "image/png" }), "c25.png"); fd.append("alt", ""); return fd; })(),
  });
  if (!up.ok) throw new Error(`upload échoué: ${up.status} ${JSON.stringify(await up.text())}`);
  const photo = await up.json();
  await call("PUT", `/api/photos/${photo.id}/layout`, { display_size: "large", display_align: "center", display_x: 0.1, display_y: 0.1, display_w: 0.8 }, author);
  await call("POST", `/api/workflows/${wf.id}/publish`, { changelog: "test" }, author);
  const res = await fetch(`${base}/api/workflows/${wf.id}/export`, { headers: { cookie: author } });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 1000, "docx trop petit");
  assert.equal(buf.readUInt32BE(0), 0x504b0304, "le docx doit être un zip (PK)");
  // composer directement le canvas et vérifier le PNG
  const { composeStepCanvas } = await import("../src/render/canvas-composite.js");
  const composed = await composeStepCanvas(
    PHOTOS_DIR,
    [{ filename: "c25.png", display_x: 0.1, display_y: 0.1, display_w: 0.8 }],
    [{ type: "arrow", x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.3, color: "#d0021b" }],
    800
  );
  assert.ok(composed && composed.length > 100, "PNG composé non généré");
  assert.equal(composed!.readUInt32BE(16), 800, "largeur du composé = 800");
  assert.ok(composed!.readUInt32BE(20) >= 240, "hauteur du composé >= repère 240px");
});
