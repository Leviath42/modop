import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

// C-72 (#4/#5) : paramètres applicatifs — GET (défauts), PUT admin,
// refus non-admin, effet sur le filtre « à revoir » du listing
// (un MO sans date de revue y apparaît selon le paramétrage).

fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("a@modop.local", bcrypt.hashSync("auteurpass1", 4), "author");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("ad@modop.local", bcrypt.hashSync("adminpass1", 4), "admin");
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
  const sc = res.headers.getSetCookie?.() ?? [];
  const session = sc.find((c) => c.startsWith("modop_session="));
  return { status: res.status, json: await res.json().catch(() => null), cookie: session ? session.split(";")[0] : null };
}

const authorLogin = await call("POST", "/api/auth/login", { email: "a@modop.local", password: "auteurpass1" });
const author = authorLogin.cookie!;
const adminLogin = await call("POST", "/api/auth/login", { email: "ad@modop.local", password: "adminpass1" });
const admin = adminLogin.cookie!;

test("paramètres : défauts, lecture authentifiée", async () => {
  const got = await call("GET", "/api/settings", undefined, author);
  assert.equal(got.status, 200);
  assert.equal(got.json.readers_see_drafts, false, "défaut : lecteurs ne voient pas les brouillons");
  assert.equal(got.json.no_review_date_is_overdue, true, "défaut : sans date = à revoir");
  assert.equal(got.json.default_stroke_width, 5, "défaut : épaisseur 5");
});

test("paramètres : PUT admin seul, persistance", async () => {
  const forbidden = await call("PUT", "/api/settings", { readers_see_drafts: true }, author);
  assert.equal(forbidden.status, 403, "un auteur ne peut pas modifier les paramètres");
  const put = await call("PUT", "/api/settings", { no_review_date_is_overdue: false, default_stroke_width: 8 }, admin);
  assert.equal(put.status, 200);
  assert.equal(put.json.no_review_date_is_overdue, false, "paramètre persisté");
  assert.equal(put.json.default_stroke_width, 8, "épaisseur persistée");
  const badWidth = await call("PUT", "/api/settings", { default_stroke_width: 20 }, admin);
  assert.equal(badWidth.json.default_stroke_width, 8, "épaisseur hors bornes ignorée");
  const got = await call("GET", "/api/settings", undefined, author);
  assert.equal(got.json.no_review_date_is_overdue, false);
  await call("PUT", "/api/settings", { no_review_date_is_overdue: true }, admin);
});

test("« à revoir » : sans date de revue selon le paramétrage", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Sans date", reference: "MO-SET1" }, author);
  assert.ok(wf.status === 200 || wf.status === 201, "création du MO de test");

  // paramètre ON : le MO sans date apparaît dans review=overdue
  const on = await call("GET", "/api/workflows?review=overdue", undefined, author);
  assert.ok(on.json.some((w: { id: number }) => w.id === wf.json.id), "sans date = à revoir (paramètre ON)");

  // paramètre OFF : il disparaît
  await call("PUT", "/api/settings", { no_review_date_is_overdue: false }, admin);
  const off = await call("GET", "/api/workflows?review=overdue", undefined, author);
  assert.ok(!off.json.some((w: { id: number }) => w.id === wf.json.id), "sans date ≠ à revoir (paramètre OFF)");

  // retour à l'état demandé par défaut
  await call("PUT", "/api/settings", { no_review_date_is_overdue: true }, admin);
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
