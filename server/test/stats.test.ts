import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?)"
).run("adm@modop.local", bcrypt.hashSync("adminpass1", 4), "admin", "l@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader");

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
const admin = (await call("POST", "/api/auth/login", { email: "adm@modop.local", password: "adminpass1" })).cookie!;
const reader = (await call("POST", "/api/auth/login", { email: "l@modop.local", password: "lecteurpass1" })).cookie!;

test("stats : compteurs exacts depuis l'activité réelle", async () => {
  // activité : 2 workflows, 1 publié, 1 export
  const wf1 = await call("POST", "/api/workflows", { title: "A", reference: "MO-S1" }, admin);
  await call("POST", `/api/workflows/${wf1.json.id}/steps`, { title: "S" }, admin);
  await call("POST", `/api/workflows/${wf1.json.id}/publish`, undefined, admin);
  await call("GET", `/api/workflows/${wf1.json.id}/export`, undefined, admin);
  await call("POST", "/api/workflows", { title: "B", reference: "MO-S2" }, admin);

  const st = await call("GET", "/api/stats", undefined, admin);
  assert.equal(st.status, 200);
  assert.equal(st.json.workflows, 2);
  assert.equal(st.json.published, 1);
  assert.equal(st.json.users, 2);
  assert.equal(st.json.exports, 1);
  assert.ok(st.json.recentActivity.length > 0, "activité récente peuplée");
});

test("stats : lecteur → 403", async () => {
  const r = await call("GET", "/api/stats", undefined, reader);
  assert.equal(r.status, 403);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
