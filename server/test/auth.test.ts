import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import type { Server } from "node:http";
import http from "node:http";

const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)"
).run(
  "admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin",
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author",
  "lecteur@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader"
);

const app = createApp(db);
const server = http.createServer(app) as Server & { port: number };
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;

async function call(method: string, path: string, body?: object, cookie?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, json: await res.json().catch(() => null), cookie: setCookie?.split(";")[0] };
}

test("login refusé avec mauvais identifiants", async () => {
  const r = await call("POST", "/api/auth/login", { email: "admin@modop.local", password: "faux" });
  assert.equal(r.status, 401);
});

test("login OK, cookie posé, /me fonctionne", async () => {
  const r = await call("POST", "/api/auth/login", { email: "admin@modop.local", password: "adminpass1" });
  assert.equal(r.status, 200);
  const me = await call("GET", "/api/auth/me", undefined, r.cookie!);
  assert.equal(me.status, 200);
  assert.equal(me.json.email, "admin@modop.local");
});

test("/me sans session → 401", async () => {
  const r = await call("GET", "/api/auth/me");
  assert.equal(r.status, 401);
});

test("logout supprime la session en base", async () => {
  const r = await call("POST", "/api/auth/login", { email: "lecteur@modop.local", password: "lecteurpass1" });
  const me = await call("GET", "/api/auth/me", undefined, r.cookie!);
  assert.equal(me.status, 200);
  const out = await call("POST", "/api/auth/logout", undefined, r.cookie!);
  assert.equal(out.status, 200);
  const after = await call("GET", "/api/auth/me", undefined, r.cookie!);
  assert.equal(after.status, 401);
});

test("change-password écrit réellement en base", async () => {
  const r = await call("POST", "/api/auth/login", { email: "auteur@modop.local", password: "auteurpass1" });
  const change = await call("POST", "/api/auth/change-password", { oldPassword: "auteurpass1", newPassword: "nouveaupass1" }, r.cookie!);
  assert.equal(change.status, 200);
  const rel = await call("POST", "/api/auth/login", { email: "auteur@modop.local", password: "nouveaupass1" });
  assert.equal(rel.status, 200);
  const old = await call("POST", "/api/auth/login", { email: "auteur@modop.local", password: "auteurpass1" });
  assert.equal(old.status, 401);
  const count = (db.prepare("SELECT COUNT(*) c FROM sessions").get() as { c: number }).c;
  assert.ok(count >= 2, "sessions écrites en base");
});

test("validation : mot de passe trop court → 422", async () => {
  const r = await call("POST", "/api/auth/login", { email: "admin@modop.local", password: "adminpass1" });
  const change = await call("POST", "/api/auth/change-password", { oldPassword: "adminpass1", newPassword: "court" }, r.cookie!);
  assert.equal(change.status, 422);
});

test("logout invalide aussi les sessions précédentes du même utilisateur", async () => {
  const s1 = await call("POST", "/api/auth/login", { email: "lecteur@modop.local", password: "lecteurpass1" });
  await call("POST", "/api/auth/login", { email: "lecteur@modop.local", password: "lecteurpass1" });
  await call("POST", "/api/auth/logout", undefined, s1.cookie!);
  const me1 = await call("GET", "/api/auth/me", undefined, s1.cookie!);
  assert.equal(me1.status, 401);
});

process.on("exit", () => server.close());
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
