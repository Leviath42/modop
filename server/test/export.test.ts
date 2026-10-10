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
