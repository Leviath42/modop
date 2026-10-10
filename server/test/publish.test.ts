import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

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

async function call(method: string, path: string, body?: object, cookie?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}

const author = (await call("POST", "/api/auth/login", { email: "auteur@modop.local", password: "auteurpass1" })).cookie ?? "";
const reader = (await call("POST", "/api/auth/login", { email: "lecteur@modop.local", password: "lecteurpass1" })).cookie ?? "";

test("première publication → V1", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Remplacement courroie", reference: "MO-V1" }, author);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape A" }, author);
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, author);
  assert.equal(pub.status, 200);
  assert.equal(pub.json.number, 1);
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, reader);
  assert.equal(got.json.state, "published");
  assert.equal(got.json.current_version, 1);
});

test("publication après modification → V2, snapshot complet", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Graissage", reference: "MO-V2" }, author);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape 1", body: "Avant" }, author);
  await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, author);
  const s = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape 2" }, author);
  await call("PUT", `/api/steps/${s.json.id}`, { pictos: ["epi"] }, author);
  const pub2 = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, author);
  assert.equal(pub2.json.number, 2);
  const versions = await call("GET", `/api/workflows/${wf.json.id}/versions`, undefined, reader);
  assert.equal(versions.json.length, 2);
  assert.deepEqual(versions.json.map((v: { number: number }) => v.number), [2, 1]);
  const snap2 = JSON.parse(
    (db.prepare("SELECT snapshot FROM versions WHERE workflow_id = ? AND number = 2").get(wf.json.id) as { snapshot: string }).snapshot
  );
  assert.equal(snap2.steps.length, 2);
  assert.deepEqual(snap2.steps[1].pictos, ["epi"]);
});

test("publier sans étape → 422", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Vide", reference: "MO-V3" }, author);
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, author);
  assert.equal(pub.status, 422);
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, author);
  assert.equal(got.json.state, "draft");
  assert.equal(got.json.current_version, 0);
});

test("lecteur ne peut pas publier → 403", async () => {
  const wf = await call("POST", "/api/workflows", { title: "X", reference: "MO-V4" }, author);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, author);
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, reader);
  assert.equal(pub.status, 403);
  const count = (db.prepare("SELECT COUNT(*) c FROM versions WHERE workflow_id = ?").get(wf.json.id) as { c: number }).c;
  assert.equal(count, 0, "aucune version écrite en base");
});

test("publication d'un workflow inexistant → 404", async () => {
  const pub = await call("POST", "/api/workflows/9999/publish", undefined, author);
  assert.equal(pub.status, 404);
});

test("triple publication → V3, numérotation continue vérifiée en base", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Triple", reference: "MO-V5" }, author);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S1" }, author);
  for (const expected of [1, 2, 3]) {
    const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, author);
    assert.equal(pub.json.number, expected);
  }
  const versions = await call("GET", `/api/workflows/${wf.json.id}/versions`, undefined, author);
  assert.deepEqual(versions.json.map((v: { number: number }) => v.number), [3, 2, 1]);
});

process.on("exit", () => server.close());
server.unref();
