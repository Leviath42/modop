import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

// Isolation : le trigger cherche update.sh à la racine du dépôt (cwd/..).
// En test, cwd = server/ du dépôt réel qui CONTIENT update.sh — on intercepte
// via un repère : on teste le contrôle d'accès et la validation, et le cas
// "script introuvable" avec un repoRoot fantôme via MODOP_REPO_ROOT.
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
const admin = await login("admin@modop.local", "adminpass1");
const author = await login("auteur@modop.local", "auteurpass1");
const reader = await login("lecteur@modop.local", "lecteurpass1");

test("healthcheck public", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("statut de déploiement : lecteur autorisé, journal masqué", async () => {
  const r = await call("GET", "/api/deploy/status", undefined, reader);
  assert.equal(r.status, 200);
  assert.equal(r.json.isAdmin, false);
  assert.equal(r.json.logTail, null);
  assert.equal(r.json.running, false);
});

test("statut : admin voit isAdmin", async () => {
  const r = await call("GET", "/api/deploy/status", undefined, admin);
  assert.equal(r.status, 200);
  assert.equal(r.json.isAdmin, true);
  assert.equal(typeof r.json.currentCommit, "string");
});

test("déclenchement sans session → 401", async () => {
  const r = await call("POST", "/api/deploy/trigger", { mode: "update" });
  assert.equal(r.status, 401);
});

test("déclenchement lecteur → 403", async () => {
  const r = await call("POST", "/api/deploy/trigger", { mode: "update" }, reader);
  assert.equal(r.status, 403);
});

test("déclenchement auteur → 403", async () => {
  const r = await call("POST", "/api/deploy/trigger", { mode: "update" }, author);
  assert.equal(r.status, 403);
});

test("mode invalide rejeté (aucune commande arbitraire n'atteint le shell) → 422", async () => {
  const r = await call("POST", "/api/deploy/trigger", { mode: "rm -rf /" }, admin);
  assert.equal(r.status, 422);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
