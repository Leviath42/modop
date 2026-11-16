import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// C-98 (V13 #1/#2/#3/#5) — chemin arborescent résolu à la volée, exports
// Markdown et JSON canonique, image_description (upload/meta/warnings publish).
process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-v13-"));

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
const base = "http://127.0.0.1:" + (server.address() as { port: number }).port;

async function call(method: string, p: string, body?: object, cookie?: string) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
async function getRaw(p: string, cookie?: string) {
  const res = await fetch(base + p, { headers: { ...(cookie ? { cookie } : {}) } });
  return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() };
}
const login = (email: string, pass: string) =>
  call("POST", "/api/auth/login", { email, password: pass }).then((r) => r.cookie ?? "");
const auteur = await login("auteur@modop.local", "auteurpass1");
const boss = await login("boss@modop.local", "bosspass1");
const lecteur = await login("lecteur@modop.local", "lecteurpass1");

after(() => {
  server.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

test("C-98 : category_path résolu à la volée (workflow, liste, catégories)", async () => {
  const meca = await call("POST", "/api/categories", { name: "Mécanique" }, boss);
  const mont = await call("POST", "/api/categories", { name: "Montage", parent_id: meca.json.id }, boss);
  assert.ok(mont.json.id);

  const wf = await call("POST", "/api/workflows", { title: "Pose fusibles", reference: "MO-V13A", category_id: mont.json.id }, auteur);
  assert.ok(wf.json.id);

  const one = await call("GET", "/api/workflows/" + wf.json.id, undefined, lecteur);
  assert.equal(one.json.category_path, "mecanique/montage");

  const list = await call("GET", "/api/workflows", undefined, lecteur);
  const row = list.json.find((w: { id: number }) => w.id === wf.json.id);
  assert.equal(row.category_path, "mecanique/montage");

  const cats = await call("GET", "/api/categories", undefined, lecteur);
  const cEnfant = cats.json.find((c: { id: number }) => c.id === mont.json.id);
  assert.equal(cEnfant.path, "mecanique/montage");
  const cRacine = cats.json.find((c: { id: number }) => c.id === meca.json.id);
  assert.equal(cRacine.path, "mecanique");
});

test("C-98 : image_description (meta, warnings) + exports md/json canoniques", async () => {
  const elec = await call("POST", "/api/categories", { name: "Élec" }, boss);
  const cab = await call("POST", "/api/categories", { name: "Câblage", parent_id: elec.json.id }, boss);
  const wf = await call("POST", "/api/workflows", { title: "Câblage armoire", reference: "MO-V13B", category_id: cab.json.id }, auteur);
  assert.ok(wf.json.id);
  const s1 = await call("POST", "/api/workflows/" + wf.json.id + "/steps", { title: "Préparer" }, auteur);
  const s2 = await call("POST", "/api/workflows/" + wf.json.id + "/steps", { title: "Trier les fusibles" }, auteur);
  assert.ok(s1.json.id && s2.json.id);

  // deux photos : l'une décrite dès l'insert, l'autre pas (→ warning publish)
  fs.writeFileSync(path.join(process.env.MODOP_PHOTOS_DIR!, "v13-a.jpg"), "a");
  fs.writeFileSync(path.join(process.env.MODOP_PHOTOS_DIR!, "v13-b.jpg"), "b");
  const ins = db.prepare(
    "INSERT INTO photos (step_id, filename, alt, image_description, annotations, display_size, display_align, display_x, display_y, display_w) VALUES (?, ?, ?, ?, '[]', 'medium', 'center', NULL, NULL, NULL)"
  );
  ins.run(s1.json.id, "v13-a.jpg", "vue armoire", "armoire ouverte avec rangées de fusibles");
  ins.run(s2.json.id, "v13-b.jpg", "fusibles", "");
  const photoRow = db.prepare("SELECT id FROM photos WHERE filename = 'v13-b.jpg'").get() as { id: number };

  // lecteur : jamais l'édition meta
  const denied = await call("PUT", "/api/photos/" + photoRow.id + "/meta", { image_description: "volé" }, lecteur);
  assert.equal(denied.status, 403);
  // bornes : body vide → 422, photo inconnue → 404
  assert.equal((await call("PUT", "/api/photos/" + photoRow.id + "/meta", {}, auteur)).status, 422);
  assert.equal((await call("PUT", "/api/photos/999999/meta", { alt: "x" }, auteur)).status, 404);

  // publication V1 : un avertissement non bloquant (photo b sans description d'image)
  const pub1 = await call("POST", "/api/workflows/" + wf.json.id + "/publish", { changelog: "V1" }, auteur);
  assert.equal(pub1.status, 200);
  assert.equal(pub1.json.number, 1);
  assert.equal(pub1.json.warnings.length, 1);
  assert.ok(String(pub1.json.warnings[0]).includes("sans description d'image"));

  // export Markdown de la V1
  const md1 = await getRaw("/api/workflows/" + wf.json.id + "/export?format=md&version=1", lecteur);
  assert.equal(md1.status, 200);
  assert.ok(md1.type.startsWith("text/markdown"));
  assert.ok(md1.text.startsWith("---\n"));
  assert.ok(md1.text.includes("reference: MO-V13B"));
  assert.ok(md1.text.includes("chemin: elec/cablage"));
  assert.ok(md1.text.includes("## Étape 1 — Préparer"));
  assert.ok(md1.text.includes("Ancre : MO-V13B/etapes/2"));
  assert.ok(md1.text.includes("Description : armoire ouverte avec rangées de fusibles"));
  assert.ok(md1.text.includes("![fusibles](/photos/v13-b.jpg)"));

  // export JSON canonique : snapshot exact + bloc meta
  const js1 = await getRaw("/api/workflows/" + wf.json.id + "/export?format=json&version=1", lecteur);
  assert.equal(js1.status, 200);
  const js = JSON.parse(js1.text);
  assert.equal(js.meta.reference, "MO-V13B");
  assert.equal(js.meta.category_path, "elec/cablage");
  assert.equal(js.meta.anchors.length, 2);
  assert.equal(js.meta.anchors[1].anchor, "MO-V13B/etapes/2");
  assert.equal(js.snapshot.workflow.reference, "MO-V13B");
  assert.equal(js.snapshot.steps[0].photos[0].image_description, "armoire ouverte avec rangées de fusibles");
  assert.equal(js.snapshot.steps[1].photos[0].image_description, "");

  // version introuvable → 404 ; sans session → 401 ; docx reste le défaut
  assert.equal((await getRaw("/api/workflows/" + wf.json.id + "/export?format=md&version=99", auteur)).status, 404);
  assert.equal((await getRaw("/api/workflows/" + wf.json.id + "/export?format=md")).status, 401);
  const dx = await getRaw("/api/workflows/" + wf.json.id + "/export", lecteur);
  assert.equal(dx.status, 200);
  assert.ok(dx.type.includes("wordprocessingml"));

  // meta après publication : l'auteur complète la description, re-publish → plus de warning
  const meta = await call("PUT", "/api/photos/" + photoRow.id + "/meta", { alt: "fusibles triés", image_description: "fusibles triés par calibre sur la grille" }, auteur);
  assert.equal(meta.status, 200);
  assert.equal(meta.json.image_description, "fusibles triés par calibre sur la grille");
  assert.equal(meta.json.alt, "fusibles triés");
  // image_description exposée dans GET workflow (brouillon)
  const one = await call("GET", "/api/workflows/" + wf.json.id, undefined, auteur);
  const phB = one.json.steps.flatMap((s: { photos: { filename: string; image_description?: string }[] }) => s.photos).find((p: { filename: string }) => p.filename === "v13-b.jpg");
  assert.equal(phB.image_description, "fusibles triés par calibre sur la grille");

  const pub2 = await call("POST", "/api/workflows/" + wf.json.id + "/publish", { changelog: "V2" }, auteur);
  assert.equal(pub2.json.number, 2);
  assert.equal(pub2.json.warnings.length, 0);
  const md2 = await getRaw("/api/workflows/" + wf.json.id + "/export?format=md", lecteur);
  assert.ok(md2.text.includes("Description : fusibles triés par calibre sur la grille"));
  assert.ok(md2.text.includes("![fusibles triés](/photos/v13-b.jpg)"));
});
