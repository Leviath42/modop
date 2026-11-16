import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// C-97 (V12 #9) — reset-draft : abandon d'un brouillon MÊME sans version
// publiée (V0 = purge complète) et retour à la dernière publiée sinon.
// Dossier photos isolé pour prouver l'unlink des fichiers non référencés.
process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-rd-"));

const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)"
).run(
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author",
  "boss@modop.local", bcrypt.hashSync("bosspass1", 4), "admin",
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
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const login = (email: string, pass: string) =>
  call("POST", "/api/auth/login", { email, password: pass }).then((r) => r.cookie ?? "");
const auteur = await login("auteur@modop.local", "auteurpass1");
const boss = await login("boss@modop.local", "bosspass1");
const lecteur = await login("lecteur@modop.local", "lecteurpass1");

after(() => {
  server.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

test("C-97 : reset-draft d'un brouillon V0 — purge étapes + photos + commentaires, MO conservé", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Brouillon raté", reference: "MO-RD1" }, auteur);
  const s1 = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape foireuse" }, auteur);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Autre" }, auteur);
  // photo réelle attachée à l'étape (fichier + ligne)
  fs.writeFileSync(path.join(process.env.MODOP_PHOTOS_DIR!, "rd-v0.jpg"), "octets");
  db.prepare(
    "INSERT INTO photos (step_id, filename, alt, annotations, display_size, display_align, display_x, display_y, display_w) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(s1.json.id, "rd-v0.jpg", "", "[]", "medium", "center", null, null, null);
  // commentaire d'auteur (C-96) — parti avec l'étape (cascade)
  await call("POST", `/api/steps/${s1.json.id}/comments`, { message: "à revoir" }, auteur);

  const reset = await call("POST", `/api/workflows/${wf.json.id}/reset-draft`, undefined, auteur);
  assert.equal(reset.status, 200);
  assert.equal(reset.json.mode, "emptied");

  const after = await call("GET", `/api/workflows/${wf.json.id}`, undefined, auteur);
  assert.equal(after.status, 200);
  assert.equal(after.json.steps.length, 0);
  assert.equal(after.json.title, "Brouillon raté");
  assert.equal(fs.existsSync(path.join(process.env.MODOP_PHOTOS_DIR!, "rd-v0.jpg")), false);
  const photosLeft = db.prepare("SELECT COUNT(*) AS n FROM photos WHERE filename = 'rd-v0.jpg'").get() as { n: number };
  assert.equal(photosLeft.n, 0);
  const comments = db.prepare("SELECT COUNT(*) AS n FROM step_comments").get() as { n: number };
  assert.equal(comments.n, 0);
  const audit = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'reset_draft' AND target = ?").get(`workflow:${wf.json.id}`) as { n: number };
  assert.equal(audit.n, 1);
});

test("C-97 : reset-draft d'un MO publié — retour à la dernière version publiée", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Publié puis brouillon", reference: "MO-RD2" }, auteur);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "V1 seule" }, auteur);
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, { changelog: "init" }, auteur);
  assert.equal(pub.status, 200);
  // brouillon divergent : nouvelle étape jamais publiée
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape brouillon" }, auteur);

  const reset = await call("POST", `/api/workflows/${wf.json.id}/reset-draft`, undefined, auteur);
  assert.equal(reset.status, 200);
  assert.equal(reset.json.mode, "restored");
  assert.equal(reset.json.restoredFrom, 1);

  const after = await call("GET", `/api/workflows/${wf.json.id}`, undefined, auteur);
  assert.equal(after.json.steps.length, 1);
  assert.equal(after.json.steps[0].title, "V1 seule");
  assert.equal(after.json.current_version, 1);
});

test("C-97 : reset-draft — 404 inconnu, lecteur 403", async () => {
  assert.equal((await call("POST", "/api/workflows/999/reset-draft", undefined, auteur)).status, 404);
  assert.equal((await call("POST", "/api/workflows/1/reset-draft", undefined, lecteur)).status, 403);
  // l'admin peut tout à fait réinitialiser
  const wf = await call("POST", "/api/workflows", { title: "Admin reset", reference: "MO-RD3" }, boss);
  assert.equal((await call("POST", `/api/workflows/${wf.json.id}/reset-draft`, undefined, boss)).status, 200);
});
