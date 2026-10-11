import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("lecteur@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader");

const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function call(method: string, path: string, body?: object, cookie?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}

const reader = (await call("POST", "/api/auth/login", { email: "lecteur@modop.local", password: "lecteurpass1" })).cookie!;

db.prepare("INSERT INTO workflows (title, reference, category, state) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)").run(
  "Remplacement courroie", "MO-B1", "Maintenance", "published",
  "Contrôle qualité", "MO-B2", "Qualité", "draft",
  "Remontage moteur", "MO-B3", "Maintenance", "published"
);

test("liste complète triée par date", async () => {
  const r = await call("GET", "/api/workflows", undefined, reader);
  assert.equal(r.status, 200);
  assert.equal(r.json.length, 3);
});

test("recherche par titre", async () => {
  const r = await call("GET", "/api/workflows?search=remplacement", undefined, reader);
  assert.equal(r.json.length, 1);
  assert.equal(r.json[0].reference, "MO-B1");
});

test("recherche par référence", async () => {
  const r = await call("GET", "/api/workflows?search=MO-B2", undefined, reader);
  assert.equal(r.json.length, 1);
  assert.equal(r.json[0].title, "Contrôle qualité");
});

test("filtre catégorie", async () => {
  const r = await call("GET", "/api/workflows?category=Maintenance", undefined, reader);
  assert.equal(r.json.length, 2);
});

test("filtre état", async () => {
  const r = await call("GET", "/api/workflows?state=draft", undefined, reader);
  assert.equal(r.json.length, 1);
  assert.equal(r.json[0].state, "draft");
});

test("filtres combinés", async () => {
  const r = await call("GET", "/api/workflows?category=Maintenance&state=published", undefined, reader);
  assert.equal(r.json.length, 2);
});

test("détail complet avec étapes et photos", async () => {
  const wfId = (db.prepare("SELECT id FROM workflows WHERE reference = 'MO-B1'").get() as { id: number }).id;
  db.prepare("INSERT INTO steps (workflow_id, position, title, body, pictos) VALUES (?, 0, 'Étape 1', 'Corps', '[]')").run(wfId);
  const stepId = (db.prepare("SELECT id FROM steps WHERE workflow_id = ?").get(wfId) as { id: number }).id;
  db.prepare("INSERT INTO photos (step_id, filename, alt) VALUES (?, 'abc.jpg', 'armoire')").run(stepId);
  const r = await call("GET", `/api/workflows/${wfId}`, undefined, reader);
  assert.equal(r.json.steps.length, 1);
  assert.equal(r.json.steps[0].photos.length, 1);
  assert.equal(r.json.steps[0].photos[0].alt, "armoire");
  assert.deepEqual(r.json.steps[0].pictos, []);
});

test("sans session → 401", async () => {
  const r = await call("GET", "/api/workflows");
  assert.equal(r.status, 401);
});

process.on("exit", () => server.close());
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
