import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("a@modop.local", bcrypt.hashSync("auteurpass1", 4), "author");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("l@modop.local", bcrypt.hashSync("lecturepass1", 4), "reader");

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
const cookieA = (await call("POST", "/api/auth/login", { email: "a@modop.local", password: "auteurpass1" })).cookie!;
const cookieR = (await call("POST", "/api/auth/login", { email: "l@modop.local", password: "lecturepass1" })).cookie!;

test("statut editorial : lecture, mise a jour, refus invalides", async () => {
  const wf = await call("POST", "/api/workflows", { title: "MO Statut", reference: "MO-ST1", family: "Méca" }, cookieA);
  const id = wf.json.id;

  let s = await call("GET", `/api/workflows/${id}/status`, undefined, cookieA);
  assert.equal(s.status, 200);
  assert.equal(s.json.status, "draft");

  s = await call("PUT", `/api/workflows/${id}/status`, { status: "in_review" }, cookieA);
  assert.equal(s.status, 200);
  assert.equal(s.json.status, "in_review");
  assert.ok(s.json.updated_at, "horodatage present");

  s = await call("GET", `/api/workflows/${id}/status`, undefined, cookieA);
  assert.equal(s.json.status, "in_review");

  s = await call("PUT", `/api/workflows/${id}/status`, { status: "nimporte" }, cookieA);
  assert.equal(s.status, 422);

  s = await call("PUT", "/api/workflows/999999/status", { status: "draft" }, cookieA);
  assert.equal(s.status, 404);

  const audit = db.prepare("SELECT action, target, detail FROM audit_log WHERE action = 'status_change'").get() as { action: string; target: string; detail: string };
  assert.equal(audit.target, `workflow:${id}`);
  assert.equal(audit.detail, "in_review");

  s = await call("PUT", `/api/workflows/${id}/status`, { status: "validated" }, cookieR);
  assert.equal(s.status, 403);
});

test("statut editorial : filtre par statut dans la liste", async () => {
  const wf2 = await call("POST", "/api/workflows", { title: "MO Deux", reference: "MO-ST2", family: "Méca" }, cookieA);
  await call("PUT", `/api/workflows/${wf2.json.id}/status`, { status: "validated" }, cookieA);
  const list = await call("GET", "/api/workflows?editorial_status=validated", undefined, cookieA);
  assert.equal(list.status, 200);
  const rows = (list.json.workflows ?? list.json) as { id: number }[];
  assert.ok(Array.isArray(rows));
  assert.ok(rows.some((w) => w.id === wf2.json.id), "le valide apparait");
});

after(() => { server.close(); db.close(); });
