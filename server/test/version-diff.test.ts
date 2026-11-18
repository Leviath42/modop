import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

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

test("diff de versions : ajouts, modifications, refus", async () => {
  const wf = await call("POST", "/api/workflows", { title: "MO Diff", reference: "MO-VD1", family: "Méca" }, cookie);
  const id = wf.json.id;
  await call("POST", `/api/workflows/${id}/steps`, { title: "Préparer", body: "nettoyer les pièces" }, cookie);
  const s2 = await call("POST", `/api/workflows/${id}/steps`, { title: "Serrer", body: "45 Nm" }, cookie);
  const p1 = await call("POST", `/api/workflows/${id}/publish`, {}, cookie);
  assert.equal(p1.json.number, 1, "V1 publiée");

  // modification d une étape (base directe) + ajout d une étape, puis V2
  db.prepare("UPDATE steps SET body = ? WHERE id = ?").run("60 Nm", s2.json.id);
  await call("POST", `/api/workflows/${id}/steps`, { title: "Contrôler", body: "visuel" }, cookie);
  const p2 = await call("POST", `/api/workflows/${id}/publish`, {}, cookie);
  assert.equal(p2.json.number, 2, "V2 publiée");

  const d = await call("GET", `/api/workflows/${id}/versions/1/diff/2`, undefined, cookie);
  assert.equal(d.status, 200);
  assert.equal(d.json.workflow_id, id);
  const diff = d.json.diff;
  assert.equal(diff.added.length, 1, "une étape ajoutée");
  assert.equal(diff.added[0].title, "Contrôler");
  const mod = diff.modified.find((m: { title: string }) => m.title === "Serrer");
  assert.ok(mod, "l étape Serrer est signalée modifiée");
  assert.equal(mod.changes.body, true);
  assert.equal(mod.changes.photos, false);
  assert.equal(mod.changes.pictos, false);
  assert.equal(diff.removed.length, 0, "aucune étape supprimée");

  // comparaison d une version avec elle-même : refus
  const same = await call("GET", `/api/workflows/${id}/versions/1/diff/1`, undefined, cookie);
  assert.equal(same.status, 400);
  assert.equal(same.json.error, "same_version");

  // version inexistante : 404
  const missing = await call("GET", `/api/workflows/${id}/versions/1/diff/99`, undefined, cookie);
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, "not_found");
});

after(() => { server.close(); db.close(); });
