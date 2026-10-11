import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

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

test("restauration V1 après modifications et republication", async () => {
  const wf = await call("POST", "/api/workflows", { title: "MO", reference: "MO-R1" }, cookie);
  const id = wf.json.id;
  await call("POST", `/api/workflows/${id}/steps`, { title: "Étape A", body: "version initiale" }, cookie);
  await call("POST", `/api/workflows/${id}/publish`, undefined, cookie);

  // modifications + V2
  const s2 = await call("POST", `/api/workflows/${id}/steps`, { title: "Étape B" }, cookie);
  const steps = await call("GET", `/api/workflows/${id}`, undefined, cookie);
  await call("DELETE", `/api/steps/${steps.json.steps[0].id}`, undefined, cookie);
  await call("PUT", `/api/steps/${s2.json.id}`, { body: "modifié en V2" }, cookie);
  await call("POST", `/api/workflows/${id}/publish`, undefined, cookie);

  let cur = await call("GET", `/api/workflows/${id}`, undefined, cookie);
  assert.equal(cur.json.steps.length, 1);
  assert.equal(cur.json.steps[0].title, "Étape B");

  // restauration de V1
  const restore = await call("POST", `/api/workflows/${id}/versions/1/restore`, undefined, cookie);
  assert.equal(restore.status, 200);
  assert.equal(restore.json.steps, 1);
  assert.equal(restore.json.restoredFrom, 1);

  cur = await call("GET", `/api/workflows/${id}`, undefined, cookie);
  assert.equal(cur.json.steps.length, 1);
  assert.equal(cur.json.steps[0].title, "Étape A");
  assert.equal(cur.json.steps[0].body, "version initiale");

  // les versions restent intactes
  const versions = await call("GET", `/api/workflows/${id}/versions`, undefined, cookie);
  assert.equal(versions.json.length, 2);
});

test("restauration d'une version inexistante → 404", async () => {
  const wf = await call("POST", "/api/workflows", { title: "X", reference: "MO-R2" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, cookie);
  const r = await call("POST", `/api/workflows/${wf.json.id}/versions/99/restore`, undefined, cookie);
  assert.equal(r.status, 404);
});

test("lecteur ne peut pas restaurer", async () => {
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("l@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader");
  const rc = (await call("POST", "/api/auth/login", { email: "l@modop.local", password: "lecteurpass1" })).cookie!;
  const wf = await call("POST", "/api/workflows", { title: "Y", reference: "MO-R3" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, cookie);
  const r = await call("POST", `/api/workflows/${wf.json.id}/versions/1/restore`, undefined, rc);
  assert.equal(r.status, 403);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
server.unref();
