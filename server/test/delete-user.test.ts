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

test("C-107 : suppression d'un compte désactivé (cycle complet)", async () => {
  const admin = await login("admin@modop.local", "adminpass1");
  const created = await call("POST", "/api/admin/users", { email: "tmp@modop.local", password: "MotDePasse123", role: "author" }, admin);
  assert.equal(created.status, 201);
  const uid = created.json.id;
  const tmpCookie = (await call("POST", "/api/auth/login", { email: "tmp@modop.local", password: "MotDePasse123" })).cookie;
  assert.ok(tmpCookie);
  // Compte actif : refus explicite.
  const actif = await call("DELETE", `/api/admin/users/${uid}`, undefined, admin);
  assert.equal(actif.status, 422);
  assert.equal(actif.json.message, "désactivez le compte avant de le supprimer");
  // Désactivation → session révoquée.
  assert.equal((await call("PUT", `/api/admin/users/${uid}`, { active: 0 }, admin)).status, 200);
  assert.equal((await call("GET", "/api/workflows", undefined, tmpCookie)).status, 401);
  // Suppression.
  assert.equal((await call("DELETE", `/api/admin/users/${uid}`, undefined, admin)).status, 204);
  const users = await call("GET", "/api/admin/users", undefined, admin);
  assert.equal(users.json.some((u: { id: number }) => u.id === uid), false);
  assert.equal((await call("POST", "/api/auth/login", { email: "tmp@modop.local", password: "MotDePasse123" })).status, 401);
});

test("C-107 : protections (soi-même, inconnu, non-admin, audit)", async () => {
  const admin = await login("admin@modop.local", "adminpass1");
  const author = await login("auteur@modop.local", "auteurpass1");
  const users = await call("GET", "/api/admin/users", undefined, admin);
  const adminId = users.json.find((u: { email: string }) => u.email === "admin@modop.local").id;
  // Soi-même : refus.
  const self = await call("DELETE", `/api/admin/users/${adminId}`, undefined, admin);
  assert.equal(self.status, 422);
  assert.equal(self.json.message, "impossible de supprimer votre propre compte");
  // Id inconnu : 404.
  assert.equal((await call("DELETE", "/api/admin/users/99999", undefined, admin)).status, 404);
  // Non-admin : 403.
  assert.equal((await call("DELETE", "/api/admin/users/2", undefined, author)).status, 403);
  // L'action de suppression est tracée dans l'audit.
  const audit = await call("GET", "/api/admin/audit", undefined, admin);
  assert.ok(audit.json.some((l: { action: string }) => l.action === "delete_user"));
});

after(() => server.close());