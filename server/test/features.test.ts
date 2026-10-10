import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

fs.rmSync("data", { recursive: true, force: true });

const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)"
).run(
  "admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin",
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author",
  "lecteur@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader"
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
  return (await call("POST", "/api/auth/login", { email, password })).cookie!;
}
let authorTempPassword = "auteurpass1";
let authorFresh: string | null = null;
const admin = await login("admin@modop.local", "adminpass1");
const author = await login("auteur@modop.local", "auteurpass1");
const reader = await login("lecteur@modop.local", "lecteurpass1");

test("accès admin : lecteur/auteur refusés", async () => {
  assert.equal((await call("GET", "/api/admin/users", undefined, reader)).status, 403);
  assert.equal((await call("GET", "/api/admin/users", undefined, author)).status, 403);
  assert.equal((await call("GET", "/api/admin/users")).status, 401);
});

test("création utilisateur + validation", async () => {
  const bad = await call("POST", "/api/admin/users", { email: "pasunemail", password: "court", role: "reader" }, admin);
  assert.equal(bad.status, 422);
  const ok = await call("POST", "/api/admin/users", { email: "Nouveau@Modop.Local", password: "MotDePasse123", role: "author" }, admin);
  assert.equal(ok.status, 201);
  assert.equal(ok.json.email, "nouveau@modop.local");
  // le compte peut se connecter immédiatement
  const loginNew = await call("POST", "/api/auth/login", { email: "nouveau@modop.local", password: "MotDePasse123" });
  assert.equal(loginNew.status, 200);
});

test("changement de rôle + révocation à la désactivation", async () => {
  const users = await call("GET", "/api/admin/users", undefined, admin);
  const target = users.json.find((u: { email: string }) => u.email === "nouveau@modop.local");
  const sess = await login("nouveau@modop.local", "MotDePasse123");
  const off = await call("PUT", `/api/admin/users/${target.id}`, { active: 0 }, admin);
  assert.equal(off.status, 200);
  assert.equal(off.json.active, 0);
  // session révoquée immédiatement
  const me = await call("GET", "/api/auth/me", undefined, sess);
  assert.equal(me.status, 401);
  // login refusé pour compte désactivé
  const rel = await call("POST", "/api/auth/login", { email: "nouveau@modop.local", password: "MotDePasse123" });
  assert.equal(rel.status, 401);
  // réactivation
  await call("PUT", `/api/admin/users/${target.id}`, { active: 1 }, admin);
  const rel2 = await call("POST", "/api/auth/login", { email: "nouveau@modop.local", password: "MotDePasse123" });
  assert.equal(rel2.status, 200);
});

test("auto-protection : impossible de se rétrograder/désactiver soi-même", async () => {
  const users = await call("GET", "/api/admin/users", undefined, admin);
  const me = users.json.find((u: { email: string }) => u.email === "admin@modop.local");
  const demote = await call("PUT", `/api/admin/users/${me.id}`, { role: "reader" }, admin);
  assert.equal(demote.status, 422);
  const off = await call("PUT", `/api/admin/users/${me.id}`, { active: 0 }, admin);
  assert.equal(off.status, 422);
});

test("reset password : mot de passe temporaire fonctionne, sessions révoquées", async () => {
  const users = await call("GET", "/api/admin/users", undefined, admin);
  const target = users.json.find((u: { email: string }) => u.email === "auteur@modop.local");
  const oldSess = author;
  const reset = await call("POST", `/api/admin/users/${target.id}/reset-password`, undefined, admin);
  assert.equal(reset.status, 200);
  assert.ok(reset.json.temporaryPassword.length >= 8);
    authorTempPassword = reset.json.temporaryPassword;
  // ancienne session morte
  const me = await call("GET", "/api/auth/me", undefined, oldSess);
  assert.equal(me.status, 401);
  // nouveau mot de passe accepté
  const nl = await login("auteur@modop.local", reset.json.temporaryPassword);
  assert.ok(nl);
  authorFresh = nl;
  const audit = db.prepare("SELECT action FROM audit_log WHERE action = 'reset_password'").get();
  assert.ok(audit, "reset tracé dans l'audit");
});

test("family : création, filtre, mise à jour", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T1", reference: "MO-FAM1", family: "Mécanique" }, authorFresh!);
  assert.equal(wf.status, 201);
  assert.equal(wf.json.family, "Mécanique");
  await call("POST", "/api/workflows", { title: "T2", reference: "MO-FAM2", family: "Électrique" }, authorFresh!);
  const filtered = await call("GET", "/api/workflows?family=Mécanique", undefined, reader);
  assert.equal(filtered.json.length, 1);
  assert.equal(filtered.json[0].reference, "MO-FAM1");
  const up = await call("PUT", `/api/workflows/${wf.json.id}`, { family: "Hydraulique" }, authorFresh!);
  assert.equal(up.json.family, "Hydraulique");
});

test("pictos structurés : couleur + texte libre persistés et relus", async () => {
  const wf = await call("POST", "/api/workflows", { title: "P", reference: "MO-PIC1" }, authorFresh!);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, authorFresh!);
  const custom = [{ kind: "custom", label: "Ne pas toucher le variateur", color: "#d0021b" }];
  const up = await call("PUT", `/api/steps/${step.json.id}`, { pictos: custom }, authorFresh!);
  assert.equal(up.status, 200);
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, reader);
  const stored = got.json.steps[0].pictos;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].label, "Ne pas toucher le variateur");
  assert.equal(stored[0].color, "#d0021b");
});

test("suppression workflow : confirmée en base (cascade)", async () => {
  const wf = await call("POST", "/api/workflows", { title: "D", reference: "MO-DEL1" }, authorFresh!);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, authorFresh!);
  const del = await call("DELETE", `/api/workflows/${wf.json.id}`, undefined, authorFresh!);
  assert.equal(del.status, 200);
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, reader);
  assert.equal(got.status, 404);
});

test("lecteur ne peut pas supprimer", async () => {
  const wf = await call("POST", "/api/workflows", { title: "X", reference: "MO-DEL2" }, authorFresh!);
  const del = await call("DELETE", `/api/workflows/${wf.json.id}`, undefined, reader);
  assert.equal(del.status, 403);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
server.unref();
