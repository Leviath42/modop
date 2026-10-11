import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PDIR = "/tmp/modop-wa-photos";
fs.rmSync(PDIR, { recursive: true, force: true });
fs.mkdirSync(PDIR, { recursive: true });
process.env.MODOP_PHOTOS_DIR = PDIR;

fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("a@modop.local", bcrypt.hashSync("auteurpass1", 4), "author");

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
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const cookie = (await call("POST", "/api/auth/login", { email: "a@modop.local", password: "auteurpass1" })).cookie!;

test("duplication : copie indépendante avec photos", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Original", reference: "MO-A1", family: "Méca" }, cookie);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape clé", body: "serrer au couple de 45 Nm" }, cookie);
  // photo réelle sur disque
  const filename = "aaaa1111.png";
  fs.writeFileSync(path.join(PDIR, filename), Buffer.from("89504e47", "hex"));
  db.prepare("INSERT INTO photos (step_id, filename, alt) VALUES (?, ?, ?)").run(step.json.id, filename, "vis");

  const dup = await call("POST", `/api/workflows/${wf.json.id}/duplicate`, undefined, cookie);
  assert.equal(dup.status, 201);
  assert.equal(dup.json.reference, "MO-A1-COPIE");
  assert.equal(dup.json.state, "draft");
  const detail = await call("GET", `/api/workflows/${dup.json.id}`, undefined, cookie);
  assert.equal(detail.json.steps.length, 1);
  assert.equal(detail.json.steps[0].title, "Étape clé");
  // la photo a été copiée sur disque (fichier distinct)
  const newFilename = detail.json.steps[0].photos[0].filename;
  assert.notEqual(newFilename, filename);
  assert.ok(fs.existsSync(path.join(PDIR, newFilename)), "binaire copié");
  // suppression de l'original ne casse pas la copie
  await call("DELETE", `/api/workflows/${wf.json.id}`, undefined, cookie);
  const after = await call("GET", `/api/workflows/${dup.json.id}`, undefined, cookie);
  assert.equal(after.status, 200);
  assert.ok(fs.existsSync(path.join(PDIR, newFilename)), "photo de la copie toujours là");
});

test("référence de copie unique (n+1 copies)", async () => {
  const wf = await call("POST", "/api/workflows", { title: "X", reference: "MO-A2" }, cookie);
  const d1 = await call("POST", `/api/workflows/${wf.json.id}/duplicate`, undefined, cookie);
  const d2 = await call("POST", `/api/workflows/${wf.json.id}/duplicate`, undefined, cookie);
  assert.equal(d1.json.reference, "MO-A2-COPIE");
  assert.equal(d2.json.reference, "MO-A2-COPIE-2");
});

test("tri de la liste", async () => {
  await call("POST", "/api/workflows", { title: "Zèbre", reference: "MO-Z9" }, cookie);
  await call("POST", "/api/workflows", { title: "Ane", reference: "MO-Z8" }, cookie);
  const byTitle = await call("GET", "/api/workflows?sort=title", undefined, cookie);
  const titles = byTitle.json.map((w: { title: string }) => w.title);
  assert.ok(titles.indexOf("Ane") < titles.indexOf("Zèbre"), "tri alphabétique");
  const byRef = await call("GET", "/api/workflows?sort=reference", undefined, cookie);
  const refs = byRef.json.map((w: { reference: string }) => w.reference);
  assert.deepEqual([...refs].sort(), refs, "tri par référence");
});

test("recherche étendue au texte des étapes", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Sans rapport", reference: "MO-Q1" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Alignement laser", body: "vérifier le faisceau" }, cookie);
  const byStep = await call("GET", "/api/workflows?search=alignement", undefined, cookie);
  assert.equal(byStep.json.length, 1);
  assert.equal(byStep.json[0].reference, "MO-Q1");
  const byBody = await call("GET", "/api/workflows?search=faisceau", undefined, cookie);
  assert.equal(byBody.json.length, 1);
});

test("lecteur ne peut pas dupliquer", async () => {
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("l@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader");
  const rc = (await call("POST", "/api/auth/login", { email: "l@modop.local", password: "lecteurpass1" })).cookie!;
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-Q2" }, cookie);
  const dup = await call("POST", `/api/workflows/${wf.json.id}/duplicate`, undefined, rc);
  assert.equal(dup.status, 403);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
server.unref();
