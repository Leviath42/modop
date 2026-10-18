import { after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import http from "node:http";
import type { Server } from "node:http";
import { randomBytes } from "node:crypto";

// Secret aléatoire par exécution (base32), posé avant tout import applicatif.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
process.env.MODOP_TOTP_SECRET = [...randomBytes(20)].map((b) => B32[b & 31] + B32[b >> 5]).join("");

const { generateTOTPCode, validateTOTPCode, isTotpEnabled } = await import("../src/auth/totp.js");
const { openDb } = await import("../src/db/schema.js");
const { createApp } = await import("../src/app.js");

test("isTotpEnabled actif quand MODOP_TOTP_SECRET est défini", () => {
  assert.equal(isTotpEnabled(), true);
});

test("valide un code TOTP fraîchement généré", () => {
  const code = generateTOTPCode();
  assert.ok(/^\d{6}$/.test(code), `le code doit être à 6 chiffres : ${code}`);
  assert.equal(validateTOTPCode(code), true);
});

test("rejette un code TOTP invalide", () => {
  const code = generateTOTPCode();
  const last = Number(code[5]);
  const tampered = code.slice(0, 5) + (last === 9 ? 0 : last + 1);
  assert.equal(validateTOTPCode(tampered), false);
});

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?)").run(
  "admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin",
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

test("login admin sans code TOTP → 401", async () => {
  const r = await call("POST", "/api/auth/login", { email: "admin@modop.local", password: "adminpass1" });
  assert.equal(r.status, 401);
});

test("login admin avec un code TOTP erroné → 401", async () => {
  const good = generateTOTPCode();
  const last = Number(good[5]);
  const mauvais = good.slice(0, 5) + (last === 9 ? 0 : last + 1);
  const r = await call("POST", "/api/auth/login", { email: "admin@modop.local", password: "adminpass1", totp: mauvais });
  assert.equal(r.status, 401);
});

test("login admin avec le bon code TOTP → 200, cookie posé", async () => {
  const r = await call("POST", "/api/auth/login", { email: "admin@modop.local", password: "adminpass1", totp: generateTOTPCode() });
  assert.equal(r.status, 200);
  const me = await call("GET", "/api/auth/me", undefined, r.cookie!);
  assert.equal(me.status, 200);
  assert.equal(me.json.email, "admin@modop.local");
});

test("login lecteur sans TOTP → 200 (MFA réservée aux admins)", async () => {
  const r = await call("POST", "/api/auth/login", { email: "lecteur@modop.local", password: "lecteurpass1" });
  assert.equal(r.status, 200);
});

after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
