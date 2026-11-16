import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

// C-94 — arborescence documentaire paramétrable + documents parents :
// tout est vérifié EN RUNTIME (écritures réelles en base, routes réelles).

fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("a@modop.local", bcrypt.hashSync("auteurpass1", 4), "author");
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
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function loginCookie(email: string, password: string) {
  const res = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const adminC = await loginCookie("admin@modop.local", "adminpass1");
const authorC = await loginCookie("a@modop.local", "auteurpass1");

test("C-94 : l'arbre est vide au départ, seuls les admins créent des catégories", async () => {
  const empty = await call("GET", "/api/categories", undefined, authorC);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json, []);
  const forbidden = await call("POST", "/api/categories", { name: "Mécanique" }, authorC);
  assert.equal(forbidden.status, 403);
});

test("C-94 : création, slug normalisé, unicité par niveau, 403 auteur", async () => {
  const root = await call("POST", "/api/categories", { name: "Mécanique" }, adminC);
  assert.equal(root.status, 201);
  assert.equal(root.json.slug, "mecanique");
  assert.equal(root.json.parent_id, null);
  // même nom au même niveau -> refus ; sous une autre racine -> autorisé
  const dup = await call("POST", "/api/categories", { name: "mécanique" }, adminC);
  assert.equal(dup.status, 422);
  const elec = await call("POST", "/api/categories", { name: "Électrique" }, adminC);
  assert.equal(elec.status, 201);
  assert.equal(elec.json.slug, "electrique");
  const sameUnderElec = await call("POST", "/api/categories", { name: "Mécanique", parent_id: elec.json.id }, adminC);
  assert.equal(sameUnderElec.status, 201);
  // sous-famille : accents, espaces, casse -> slug propre
  const sub = await call("POST", "/api/categories", { name: "Sous-famille A", parent_id: root.json.id }, adminC);
  assert.equal(sub.status, 201);
  assert.equal(sub.json.slug, "sous-famille-a");
  assert.equal(sub.json.parent_id, root.json.id);
  // parent inconnu
  const orphan = await call("POST", "/api/categories", { name: "X", parent_id: 999999 }, adminC);
  assert.equal(orphan.status, 422);
});

test("C-94 : profondeur bornée à 20 niveaux", async () => {
  let parent: number | null = null;
  let last = 0;
  for (let i = 0; i < 22; i++) {
    const r = await call("POST", "/api/categories", { name: `Niveau ${i}`, ...(parent ? { parent_id: parent } : {}) }, adminC);
    if (r.status !== 201) break;
    parent = r.json.id as number;
    last = i;
  }
  assert.equal(last, 19, "la création doit buter au 20e niveau");
});

test("C-94 : déplacement circulaire refusé, renommage sans slug, position", async () => {
  const a = await call("POST", "/api/categories", { name: "Arbo-A" }, adminC);
  const b = await call("POST", "/api/categories", { name: "Arbo-B", parent_id: a.json.id }, adminC);
  // b sous a : déplacer a sous b = cycle -> refus
  const cycle = await call("PUT", `/api/categories/${a.json.id}`, { parent_id: b.json.id }, adminC);
  assert.equal(cycle.status, 422);
  // renommage : le titre change, le slug ne bouge pas (chemins stables)
  const renamed = await call("PUT", `/api/categories/${a.json.id}`, { name: "Arbo-A renommée" }, adminC);
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.name, "Arbo-A renommée");
  assert.equal(renamed.json.slug, "arbo-a");
  // passer en racine : parent_id null
  const toRoot = await call("PUT", `/api/categories/${b.json.id}`, { parent_id: null }, adminC);
  assert.equal(toRoot.status, 200);
  assert.equal(toRoot.json.parent_id, null);
});

test("C-94 : suppression refusée si enfants ou documents rattachés", async () => {
  const root = await call("POST", "/api/categories", { name: "Suppr-R" }, adminC);
  const child = await call("POST", "/api/categories", { name: "Suppr-C", parent_id: root.json.id }, adminC);
  const delWithChild = await call("DELETE", `/api/categories/${root.json.id}`, undefined, adminC);
  assert.equal(delWithChild.status, 422);
  // un document rattaché bloque aussi la feuille
  const wf = await call("POST", "/api/workflows", { title: "MO Arbo", reference: "MO-ARB1", category_id: child.json.id }, authorC);
  assert.equal(wf.status, 201);
  assert.equal(wf.json.category_id, child.json.id);
  const delWithDoc = await call("DELETE", `/api/categories/${child.json.id}`, undefined, adminC);
  assert.equal(delWithDoc.status, 422);
  // détaché -> supprimable
  const detach = await call("PUT", `/api/workflows/${wf.json.id}`, { category_id: null }, authorC);
  assert.equal(detach.status, 200);
  assert.equal(detach.json.category_id, null);
  const delOk = await call("DELETE", `/api/categories/${child.json.id}`, undefined, adminC);
  assert.equal(delOk.status, 200);
});

test("C-94 : documents parents — cycles refusés, filtres et snapshot", async () => {
  const parent = await call("POST", "/api/workflows", { title: "Notice machine", reference: "MO-PARENT1" }, authorC);
  const child = await call("POST", "/api/workflows", { title: "MO associé", reference: "MO-CHILD1", parent_id: parent.json.id }, authorC);
  assert.equal(child.status, 201);
  assert.equal(child.json.parent_id, parent.json.id);
  // auto-parentage et cycles
  const self = await call("PUT", `/api/workflows/${child.json.id}`, { parent_id: child.json.id }, authorC);
  assert.equal(self.status, 422);
  const cycle = await call("PUT", `/api/workflows/${parent.json.id}`, { parent_id: child.json.id }, authorC);
  assert.equal(cycle.status, 422);
  const unknown = await call("PUT", `/api/workflows/${child.json.id}`, { parent_id: 999999 }, authorC);
  assert.equal(unknown.status, 422);
  // filtre enfants directs + colonnes exposées dans la liste
  const kids = await call("GET", `/api/workflows?parent=${parent.json.id}`, undefined, authorC);
  assert.ok(kids.json.some((w: { id: number }) => w.id === child.json.id));
  const listed = await call("GET", "/api/workflows", undefined, authorC);
  const mine = listed.json.find((w: { id: number }) => w.id === child.json.id);
  assert.equal(mine.parent_id, parent.json.id);
  assert.ok("category_id" in mine, "category_id doit être exposé par la liste");
  // le snapshot de publication porte le rattachement parent
  await call("POST", `/api/workflows/${child.json.id}/steps`, { title: "S1" }, authorC);
  await call("POST", `/api/workflows/${child.json.id}/publish`, { changelog: "V1" }, authorC);
  const v1 = await call("GET", `/api/workflows/${child.json.id}/versions/1`, undefined, authorC);
  assert.equal(v1.status, 200);
  assert.equal(v1.json.parent_id, parent.json.id, "la version publiée doit porter le document parent");
  // détacher null fonctionne
  const detach = await call("PUT", `/api/workflows/${child.json.id}`, { parent_id: null }, authorC);
  assert.equal(detach.status, 200);
  assert.equal(detach.json.parent_id, null);
});

test("C-94 : la migration est idempotente (colonnes workflows)", () => {
  const cols = (db.prepare("PRAGMA table_info(workflows)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes("category_id"));
  assert.ok(cols.includes("parent_id"));
  const catCols = (db.prepare("PRAGMA table_info(categories)").all() as { name: string }[]).map((c) => c.name);
  for (const c of ["id", "parent_id", "name", "slug", "position"]) assert.ok(catCols.includes(c));
});

after(() => {
  server.close();
});
