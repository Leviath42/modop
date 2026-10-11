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
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("l@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader");
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
const author = (await call("POST", "/api/auth/login", { email: "a@modop.local", password: "auteurpass1" })).cookie!;
const reader = (await call("POST", "/api/auth/login", { email: "l@modop.local", password: "lecteurpass1" })).cookie!;

test("RF-73 : lecteur signale un problème d'étape, l'auteur consulte", async () => {
  const wf = await call("POST", "/api/workflows", { title: "FB", reference: "MO-FB1" }, author);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, author);
  // lecteur signale
  const fb = await call("POST", `/api/workflows/${wf.json.id}/feedback`, { step_id: step.json.id, message: "La photo est floue sur le connecteur" }, reader);
  assert.equal(fb.status, 201);
  // étape inexistante -> 404 ; message vide -> 422
  assert.equal((await call("POST", `/api/workflows/${wf.json.id}/feedback`, { step_id: 999, message: "x" }, reader)).status, 404);
  assert.equal((await call("POST", `/api/workflows/${wf.json.id}/feedback`, { step_id: step.json.id, message: "" }, reader)).status, 422);
  // l'auteur consulte
  const list = await call("GET", `/api/workflows/${wf.json.id}/feedback`, undefined, author);
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].step_id, step.json.id);
  assert.equal(list.json[0].message, "La photo est floue sur le connecteur");
  assert.equal(list.json[0].by, "l@modop.local");
  // un lecteur ne peut pas consulter la liste
  assert.equal((await call("GET", `/api/workflows/${wf.json.id}/feedback`, undefined, reader)).status, 403);
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
server.unref();
