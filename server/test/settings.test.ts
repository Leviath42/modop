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
  // C-86 : délai de revue par défaut — 30 jours
  assert.equal(got.json.default_review_days, 30, "défaut : délai de revue 30 jours");
});

test("C-86 : délai de revue par défaut — PUT admin, bornes, persistance", async () => {
  const forbidden = await call("PUT", "/api/settings", { default_review_days: 60 }, author);
  assert.equal(forbidden.status, 403, "un auteur ne peut pas modifier les paramètres");
  const put = await call("PUT", "/api/settings", { default_review_days: 60 }, admin);
  assert.equal(put.status, 200);
  assert.equal(put.json.default_review_days, 60, "délai persisté");
  const bad = await call("PUT", "/api/settings", { default_review_days: 0 }, admin);
  assert.equal(bad.json.default_review_days, 60, "délai hors bornes (0) ignoré");
  const bad2 = await call("PUT", "/api/settings", { default_review_days: 99999 }, admin);
  assert.equal(bad2.json.default_review_days, 60, "délai hors bornes (99999) ignoré");
  const frac = await call("PUT", "/api/settings", { default_review_days: 45.7 }, admin);
  assert.equal(frac.json.default_review_days, 46, "délai arrondi à l'entier");
  const back = await call("PUT", "/api/settings", { default_review_days: 30 }, admin);
  assert.equal(back.json.default_review_days, 30, "retour au défaut");
});

// C-85 : candidats responsables — comptes ACTIFS, accessibles aux auteurs
// (l'éditeur fait sa recherche par mot-clé dessus) ; lecteurs et anonymes refusés.
test("C-85 : GET /api/users — comptes actifs pour les auteurs", async () => {
  db.prepare("INSERT INTO users (email, password_hash, role, first_name, last_name, active) VALUES (?, ?, 'reader', 'Jeanne', 'Martin', 1)").run("jeanne@modop.local", bcrypt.hashSync("x".repeat(10), 4));
  db.prepare("INSERT INTO users (email, password_hash, role, first_name, last_name, active) VALUES (?, ?, 'reader', 'Paul', 'Hors', 0)").run("paul@modop.local", bcrypt.hashSync("x".repeat(10), 4));
  const anon = await call("GET", "/api/users");
  assert.equal(anon.status, 401, "anonyme refusé");
  const got = await call("GET", "/api/users", undefined, author);
  assert.equal(got.status, 200, "un auteur liste les candidats responsables");
  const emails = got.json.map((u: { email: string }) => u.email);
  assert.ok(emails.includes("jeanne@modop.local"), "compte actif présent");
  assert.ok(!emails.includes("paul@modop.local"), "compte désactivé absent");
  const jeanne = got.json.find((u: { email: string }) => u.email === "jeanne@modop.local");
  assert.equal([jeanne.first_name, jeanne.last_name].filter(Boolean).join(" "), "Jeanne Martin", "Prénom/Nom exposés pour la recherche");
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
