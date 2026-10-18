import { after, test } from "node:test";
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

test("RF-74/75 : review_due et owner_email persistés, date invalide rejetée", async () => {
  const wf = await call("POST", "/api/workflows", { title: "GED", reference: "MO-GED1" }, cookie);
  assert.equal(wf.status, 201);
  const bad = await call("PUT", `/api/workflows/${wf.json.id}`, { review_due: "pas-une-date" }, cookie);
  assert.equal(bad.status, 422);
  const ok = await call("PUT", `/api/workflows/${wf.json.id}`, { review_due: "2020-01-01", owner_email: "resp@usine.fr" }, cookie);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.owner_email, "resp@usine.fr");
  // filtre overdue : review_due dans le passé -> présent
  const overdue = await call("GET", "/api/workflows?review=overdue", undefined, cookie);
  assert.ok(overdue.json.some((w: { id: number }) => w.id === wf.json.id), "le MO à revoir doit apparaître");
  // et un filtre sans overdue le montre avec ses champs
  const all = await call("GET", "/api/workflows", undefined, cookie);
  const mine = all.json.find((w: { id: number }) => w.id === wf.json.id);
  assert.equal(mine.review_due, "2020-01-01");
  assert.equal(mine.owner_email, "resp@usine.fr");
});

test("RF-65 : changelog stocké à la publication et lu dans l'historique", async () => {
  const wf = await call("POST", "/api/workflows", { title: "CL", reference: "MO-CL1" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, { changelog: "Création initiale du mode opératoire" }, cookie);
  assert.equal(pub.status, 200);
  const versions = await call("GET", `/api/workflows/${wf.json.id}/versions`, undefined, cookie);
  assert.equal(versions.json[0].changelog, "Création initiale du mode opératoire");
});

test("migration idempotente : les deux colonnes existent après openDb", () => {
  const cols = db.prepare("PRAGMA table_info(workflows)").all() as { name: string }[];
  const names = cols.map((c) => c.name);
  assert.ok(names.includes("review_due"));
  assert.ok(names.includes("owner_email"));
  const vcols = (db.prepare("PRAGMA table_info(versions)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(vcols.includes("changelog"));
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
