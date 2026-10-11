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

test("F2 : GET version publiée rend le snapshot immuable", async () => {
  const wf = await call("POST", "/api/workflows", { title: "V read", reference: "MO-VR1" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape V1", body: "ancien corps" }, cookie);
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, cookie);
  assert.equal(pub.status, 200);
  const v1 = await call("GET", `/api/workflows/${wf.json.id}/versions/1`, undefined, cookie);
  assert.equal(v1.status, 200);
  assert.equal(v1.json.steps[0].title, "Étape V1");
  // le brouisson évolue : V1 reste figée
  const steps = await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  await call("PUT", `/api/steps/${steps.json.steps[0].id}`, { title: "Étape modifiée" }, cookie);
  const v1bis = await call("GET", `/api/workflows/${wf.json.id}/versions/1`, undefined, cookie);
  assert.equal(v1bis.json.steps[0].title, "Étape V1");
  // version inexistante -> 404
  const nf = await call("GET", `/api/workflows/${wf.json.id}/versions/99`, undefined, cookie);
  assert.equal(nf.status, 404);
  // non authentifié -> 401
  const anon = await fetch(`${base}/api/workflows/${wf.json.id}/versions/1`);
  assert.equal(anon.status, 401);
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
server.unref();
