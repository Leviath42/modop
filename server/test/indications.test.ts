import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

// C-97 (V12 #8) — indications métiers paramétrables : liste active en
// settings, édition admin, résolution des pictos posés par l'API/MCP,
// tolérance aux pictos corrompus (plus de 500 au chargement d'un brouillon).
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

after(() => server.close());

const SEED = ["attention", "danger", "epi", "electrique", "point-chaud", "outil", "info"];

test("C-97 : GET indications — seed par défaut, accessible au lecteur", async () => {
  const r = await call("GET", "/api/settings/indications", undefined, lecteur);
  assert.equal(r.status, 200);
  assert.equal(r.json.length, 7);
  assert.deepEqual(r.json.map((i: { kind: string }) => i.kind), SEED);
  assert.equal(r.json[0].label, "Attention");
});

test("C-97 : PUT indications admin — remplace la liste (trim + couleur normalisée), auteur 403", async () => {
  const put = await call("PUT", "/api/settings/indications", [
    { kind: "attention", label: "  Vigilance  ", color: "#F5A623" },
    { kind: "risque-coupe", label: "Risque de coupe", color: "#c2410c" },
  ], boss);
  assert.equal(put.status, 200);
  assert.equal(put.json.length, 2);
  assert.equal(put.json[0].label, "Vigilance");
  assert.equal(put.json[0].color, "#f5a623");
  assert.equal(put.json[1].kind, "risque-coupe");
  const got = await call("GET", "/api/settings/indications", undefined, lecteur);
  assert.equal(got.json.length, 2);
  assert.equal((await call("PUT", "/api/settings/indications", [{ kind: "x", label: "X", color: "#111111" }], auteur)).status, 403);
});

test("C-97 : PUT indications — validations 422 (vide, kind dupliqué, couleur, label, > 30)", async () => {
  const ok1 = { kind: "a", label: "A", color: "#123456" };
  assert.equal((await call("PUT", "/api/settings/indications", [], boss)).status, 422);
  assert.equal((await call("PUT", "/api/settings/indications", [ok1, ok1], boss)).status, 422);
  assert.equal((await call("PUT", "/api/settings/indications", [{ kind: "a", label: "A", color: "123456" }], boss)).status, 422);
  assert.equal((await call("PUT", "/api/settings/indications", [{ kind: "a", label: "   ", color: "#123456" }], boss)).status, 422);
  const many = Array.from({ length: 31 }, (_, k) => ({ kind: `k${k}`, label: `K${k}`, color: "#123456" }));
  assert.equal((await call("PUT", "/api/settings/indications", many, boss)).status, 422);
  // répare pour la suite : une liste saine
  const seedPut = await call("PUT", "/api/settings/indications", [
    { kind: "attention", label: "Attention", color: "#f5a623" },
    { kind: "risque-coupe", label: "Risque de coupe", color: "#c2410c" },
  ], boss);
  assert.equal(seedPut.status, 200);
});

test("C-97 : résolution des pictos posés par l'API — kinds → objets auto-porteurs", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-IND1" }, auteur);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, auteur);
  const upd = await call("PUT", `/api/steps/${step.json.id}`, { pictos: ["attention", "risque-coupe", "inconnue"] }, auteur);
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.json.pictos, [
    { kind: "attention", label: "Attention", color: "#f5a623" },
    { kind: "risque-coupe", label: "Risque de coupe", color: "#c2410c" },
    { kind: "inconnue", label: "inconnue", color: "#5b7285" },
  ]);
  // objets complets passés tels quels (comportement historique de l'éditeur)
  const upd2 = await call("PUT", `/api/steps/${step.json.id}`, { pictos: [{ kind: "perso", label: "Perso", color: "#abcdef" }] }, auteur);
  assert.deepEqual(upd2.json.pictos, [{ kind: "perso", label: "Perso", color: "#abcdef" }]);
});

test("C-97 : pictos corrompus en base — le chargement ne 500 plus (liste vide)", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-IND2" }, auteur);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, auteur);
  db.prepare("UPDATE steps SET pictos = '{corrompu' WHERE id = ?").run(step.json.id);
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, auteur);
  assert.equal(got.status, 200);
  assert.deepEqual(got.json.steps[0].pictos, []);
});
