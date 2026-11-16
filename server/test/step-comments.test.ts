import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)"
).run(
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author",
  "auteur2@modop.local", bcrypt.hashSync("auteurpass2", 4), "author",
  "boss@modop.local", bcrypt.hashSync("bosspass1", 4), "admin"
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
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const login = (email: string, pass: string) =>
  call("POST", "/api/auth/login", { email, password: pass }).then((r) => r.cookie ?? "");
const a1 = await login("auteur@modop.local", "auteurpass1");
const a2 = await login("auteur2@modop.local", "auteurpass2");
const boss = await login("boss@modop.local", "bosspass1");
const readerCookie = await (async () => {
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("lecteur@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader");
  return login("lecteur@modop.local", "lecteurpass1");
})();

test("C-96 : ajout puis liste des commentaires d'une étape (authors)", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-SC1" }, a1);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, a1);
  const add = await call("POST", `/api/steps/${step.json.id}/comments`, { message: "  Photo floue — à refaire  " }, a1);
  assert.equal(add.status, 201);
  assert.equal(add.json.by, "auteur@modop.local");
  assert.equal(add.json.message, "Photo floue — à refaire");
  const add2 = await call("POST", `/api/steps/${step.json.id}/comments`, { message: "Vu, je m'en occupe" }, a2);
  assert.equal(add2.status, 201);
  const list = await call("GET", `/api/steps/${step.json.id}/comments`, undefined, a2);
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 2);
  assert.equal(list.json[0].by, "auteur@modop.local");
  assert.equal(list.json[1].message, "Vu, je m'en occupe");
});

test("C-96 : validation — vide/absent/long → 422, étape inconnue → 404", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-SC2" }, a1);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, a1);
  assert.equal((await call("POST", `/api/steps/${step.json.id}/comments`, { message: "   " }, a1)).status, 422);
  assert.equal((await call("POST", `/api/steps/${step.json.id}/comments`, { message: "x".repeat(1001) }, a1)).status, 422);
  assert.equal((await call("GET", "/api/steps/999/comments", undefined, a1)).status, 404);
  assert.equal((await call("POST", "/api/steps/999/comments", { message: "x" }, a1)).status, 404);
});

test("C-96 : lecteur → 403 (lecture ET écriture)", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-SC3" }, a1);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, a1);
  await call("POST", `/api/steps/${step.json.id}/comments`, { message: "interne" }, a1);
  assert.equal((await call("GET", `/api/steps/${step.json.id}/comments`, undefined, readerCookie)).status, 403);
  assert.equal((await call("POST", `/api/steps/${step.json.id}/comments`, { message: "x" }, readerCookie)).status, 403);
});

test("C-96 : suppression — l'auteur oui, un autre auteur non, l'admin oui", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-SC4" }, a1);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, a1);
  const c = await call("POST", `/api/steps/${step.json.id}/comments`, { message: "à garder" }, a1);
  assert.equal((await call("DELETE", `/api/steps/${step.json.id}/comments/${c.json.id}`, undefined, a2)).status, 403);
  assert.equal((await call("DELETE", `/api/steps/${step.json.id}/comments/${c.json.id}`, undefined, boss)).status, 200);
  assert.equal((await call("GET", `/api/steps/${step.json.id}/comments`, undefined, a1)).json.length, 0);
});

test("C-96 : commentaires jamais dans le snapshot de publication", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-SC5" }, a1);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, a1);
  await call("POST", `/api/steps/${step.json.id}/comments`, { message: "note interne" }, a1);
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, a1);
  assert.equal(pub.status, 200);
  const snap = JSON.parse(
    (db.prepare("SELECT snapshot FROM versions WHERE workflow_id = ? AND number = 1").get(wf.json.id) as { snapshot: string }).snapshot
  );
  assert.equal(JSON.stringify(snap).includes("note interne"), false, "le snapshot ne doit pas contenir les commentaires");
  assert.equal((snap.steps[0] as Record<string, unknown>).comments, undefined);
});

test("C-96 : supprimer l'étape supprime ses commentaires (CASCADE)", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-SC6" }, a1);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, a1);
  await call("POST", `/api/steps/${step.json.id}/comments`, { message: "temporaire" }, a1);
  const del = await call("DELETE", `/api/steps/${step.json.id}`, undefined, a1);
  assert.equal(del.status, 200);
  const n = (db.prepare("SELECT COUNT(*) c FROM step_comments WHERE step_id = ?").get(step.json.id) as { c: number }).c;
  assert.equal(n, 0);
});

after(() => server.close());
