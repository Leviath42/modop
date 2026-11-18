// V17 : cycle éditorial — fil de relecture (B1) + verrou de publication (B2).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)"
).run(
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author",
  "auteur2@modop.local", bcrypt.hashSync("auteur2pass1", 4), "author",
  "lecteur@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader",
  "admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin"
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

async function login(email: string, password: string): Promise<string> {
  return (await call("POST", "/api/auth/login", { email, password })).cookie ?? "";
}
const author = await login("auteur@modop.local", "auteurpass1");
const author2 = await login("auteur2@modop.local", "auteur2pass1");
const reader = await login("lecteur@modop.local", "lecteurpass1");
const admin = await login("admin@modop.local", "adminpass1");

async function newWorkflow(reference: string): Promise<number> {
  const wf = await call("POST", "/api/workflows", { title: `MO ${reference}`, reference }, author);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape A" }, author);
  return wf.json.id as number;
}

test("B1 : fil de relecture — ajout, ordre chronologique, rôles, bornes", async () => {
  const id = await newWorkflow("MO-311");
  const r404 = await call("GET", `/api/workflows/999999/review-comments`, undefined, author);
  assert.equal(r404.status, 404);
  const vide = await call("POST", `/api/workflows/${id}/review-comments`, { message: "   " }, author);
  assert.equal(vide.status, 422);
  const long = await call("POST", `/api/workflows/${id}/review-comments`, { message: "x".repeat(1001) }, author);
  assert.equal(long.status, 422);
  const c1 = await call("POST", `/api/workflows/${id}/review-comments`, { message: " Titre à préciser sur l'étape A " }, author);
  assert.equal(c1.status, 201);
  assert.equal(c1.json.message, "Titre à préciser sur l'étape A");
  const c2 = await call("POST", `/api/workflows/${id}/review-comments`, { message: "Vu, OK pour publication" }, author2);
  assert.equal(c2.status, 201);
  const fil = await call("GET", `/api/workflows/${id}/review-comments`, undefined, author);
  assert.equal(fil.status, 200);
  assert.equal(fil.json.length, 2);
  assert.equal(fil.json[0].by, "auteur@modop.local");
  assert.equal(fil.json[1].by, "auteur2@modop.local");
  const lecteur = await call("GET", `/api/workflows/${id}/review-comments`, undefined, reader);
  assert.equal(lecteur.status, 403);
});

test("B1 : suppression — auteur du commentaire ou admin uniquement", async () => {
  const id = await newWorkflow("MO-312");
  const c1 = await call("POST", `/api/workflows/${id}/review-comments`, { message: "commentaire de auteur" }, author);
  const autre = await call("DELETE", `/api/workflows/${id}/review-comments/${c1.json.id}`, undefined, author2);
  assert.equal(autre.status, 403);
  const parAdmin = await call("DELETE", `/api/workflows/${id}/review-comments/${c1.json.id}`, undefined, admin);
  assert.equal(parAdmin.status, 200);
  const c2 = await call("POST", `/api/workflows/${id}/review-comments`, { message: "commentaire de auteur2" }, author2);
  const propre = await call("DELETE", `/api/workflows/${id}/review-comments/${c2.json.id}`, undefined, author2);
  assert.equal(propre.status, 200);
  const fil = await call("GET", `/api/workflows/${id}/review-comments`, undefined, author);
  assert.equal(fil.json.length, 0);
  const r404 = await call("DELETE", `/api/workflows/${id}/review-comments/999999`, undefined, admin);
  assert.equal(r404.status, 404);
});

test("B2 : verrou désactivé par défaut — publication libre sans statut", async () => {
  const id = await newWorkflow("MO-313");
  const s = await call("GET", "/api/settings", undefined, author);
  assert.equal(s.json.require_validated, false);
  const pub = await call("POST", `/api/workflows/${id}/publish`, undefined, author);
  assert.equal(pub.status, 200);
});

test("B2 : verrou activé — 422 validation_required, lever via « validated »", async () => {
  const id = await newWorkflow("MO-314");
  const refus = await call("PUT", "/api/settings", { require_validated: true }, author);
  assert.equal(refus.status, 403);
  const on = await call("PUT", "/api/settings", { require_validated: true }, admin);
  assert.equal(on.json.require_validated, true);
  const bloq = await call("POST", `/api/workflows/${id}/publish`, undefined, author);
  assert.equal(bloq.status, 422);
  assert.equal(bloq.json.error, "validation_required");
  const etat = await call("GET", `/api/workflows/${id}`, undefined, author);
  assert.equal(etat.json.state, "draft");
  await call("PUT", `/api/workflows/${id}/status`, { status: "in_review" }, author);
  const bloq2 = await call("POST", `/api/workflows/${id}/publish`, undefined, author);
  assert.equal(bloq2.status, 422);
  await call("PUT", `/api/workflows/${id}/status`, { status: "validated" }, author);
  const pub = await call("POST", `/api/workflows/${id}/publish`, { changelog: "V1" }, author);
  assert.equal(pub.status, 200);
  // Cycle rejouable : retour en relecture pour la V2, re-bloqué, re-validé.
  await call("PUT", `/api/workflows/${id}/status`, { status: "in_review" }, author);
  const bloq3 = await call("POST", `/api/workflows/${id}/publish`, { changelog: "V2" }, author);
  assert.equal(bloq3.status, 422);
  await call("PUT", `/api/workflows/${id}/status`, { status: "validated" }, author);
  const pub2 = await call("POST", `/api/workflows/${id}/publish`, { changelog: "V2" }, author);
  assert.equal(pub2.json.number, 2);
  // Publication ne modifie pas le statut éditorial.
  const st = await call("GET", `/api/workflows/${id}/status`, undefined, author);
  assert.equal(st.json.status, "validated");
  const off = await call("PUT", "/api/settings", { require_validated: false }, admin);
  assert.equal(off.json.require_validated, false);
});

test("B1 : le fil de relecture ne fuit ni dans le snapshot ni dans les exports", async () => {
  const id = await newWorkflow("MO-315");
  await call("POST", `/api/workflows/${id}/review-comments`, { message: "SECRETE-RELECTURE-V17" }, author);
  const pub = await call("POST", `/api/workflows/${id}/publish`, { changelog: "V1" }, author);
  assert.equal(pub.status, 200);
  const snap = db.prepare("SELECT snapshot FROM versions WHERE workflow_id = ? AND number = 1").get(id) as { snapshot: string };
  assert.ok(!snap.snapshot.includes("SECRETE-RELECTURE-V17"), "le fil ne doit pas être dans le snapshot");
  const exJson = await call("GET", `/api/workflows/${id}/versions/1/export?format=json`, undefined, author);
  if (exJson.status === 200) {
    assert.ok(!JSON.stringify(exJson.json).includes("SECRETE-RELECTURE-V17"), "le fil ne doit pas être dans l'export json");
  }
  const lecteur = await call("GET", `/api/workflows/${id}/review-comments`, undefined, reader);
  assert.equal(lecteur.status, 403);
});

test("B1 : CASCADE — la suppression du workflow emporte le fil", async () => {
  const id = await newWorkflow("MO-316");
  await call("POST", `/api/workflows/${id}/review-comments`, { message: "à supprimer avec le MO" }, author);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM review_comments WHERE workflow_id = ?").get(id) as { n: number }).n, 1);
  db.pragma("foreign_keys = ON"); // déjà le cas via openDb, redondé ici par prudence
  db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM review_comments WHERE workflow_id = ?").get(id) as { n: number }).n, 0, "commentaires supprimés en cascade");
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
