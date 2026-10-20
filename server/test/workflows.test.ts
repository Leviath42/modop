import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";

const db = openDb(":memory:");
db.prepare(
  "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)"
).run(
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author",
  "lecteur@modop.local", bcrypt.hashSync("lecteurpass1", 4), "reader",
  "admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin"
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

const login = await call("POST", "/api/auth/login", { email: "auteur@modop.local", password: "auteurpass1" });
const adminLogin = await call("POST", "/api/auth/login", { email: "admin@modop.local", password: "adminpass1" });
const admin = adminLogin.cookie!;
const author = login.cookie!;
const llogin = await call("POST", "/api/auth/login", { email: "lecteur@modop.local", password: "lecteurpass1" });
const reader = llogin.cookie!;

test("lecteur ne peut pas créer (403)", async () => {
  const r = await call("POST", "/api/workflows", { title: "T", reference: "R" }, reader);
  assert.equal(r.status, 403);
});

// C-87 : la création persiste la date de revue et le responsable saisis en
// mode création (avant : perdus au passage en édition).
test("C-87 : création avec review_due + owner_email, date invalide rejetée", async () => {
  const bad = await call("POST", "/api/workflows", { title: "Date invalide", reference: "MO-C87X", review_due: "pas-une-date" }, author);
  assert.equal(bad.status, 422);
  const create = await call("POST", "/api/workflows", { title: "GED dès la création", reference: "MO-C87", review_due: "2030-06-15", owner_email: "resp@usine.fr" }, author);
  assert.equal(create.status, 201);
  assert.equal(create.json.review_due, "2030-06-15", "date de revue persistée à la création");
  assert.equal(create.json.owner_email, "resp@usine.fr", "responsable persisté à la création");
  const got = await call("GET", `/api/workflows/${create.json.id}`, undefined, author);
  assert.equal(got.json.review_due, "2030-06-15", "relu : date de revue");
  assert.equal(got.json.owner_email, "resp@usine.fr", "relu : responsable");
  // valeurs absentes : null/vide, pas d'erreur
  const bare = await call("POST", "/api/workflows", { title: "Sans GED", reference: "MO-C87B" }, author);
  assert.equal(bare.status, 201);
  assert.equal(bare.json.review_due, null);
  assert.equal(bare.json.owner_email, "");
});

// C-88 : deux documents ne peuvent pas partager le même numéro — la casse
// est ignorée (« MO-001 » ≡ « mo-001 »), et le filtre exact ?reference=
// alimente la vérification en direct du formulaire de création.
test("C-88 : référence unique insensible à la casse + filtre ?reference=", async () => {
  const create = await call("POST", "/api/workflows", { title: "Original", reference: "MO-88" }, author);
  assert.equal(create.status, 201);
  const variant = await call("POST", "/api/workflows", { title: "Clone", reference: "mo-88" }, author);
  assert.equal(variant.status, 422, "mo-88 doit être refusé (même numéro, casse différente)");
  const spaced = await call("POST", "/api/workflows", { title: "Clone", reference: "  MO-88  " }, author);
  assert.equal(spaced.status, 422, "espaces ignorés : même numéro refusé");
  const unique = await call("POST", "/api/workflows", { title: "Autre", reference: "MO-89" }, author);
  assert.equal(unique.status, 201);
  // filtre exact (nocase) pour la vérification en direct
  const found = await call("GET", "/api/workflows?reference=Mo-88", undefined, author);
  assert.equal(found.json.length, 1, "trouvé quelle que soit la casse de la requête");
  assert.equal(found.json[0].reference, "MO-88");
  const none = await call("GET", "/api/workflows?reference=MO-999", undefined, author);
  assert.equal(none.json.length, 0, "numéro libre : aucune réponse");
});

// C-88 : la duplication ne doit pas non plus entrer en collision par la
// casse — le suffixe -COPIE saute au prochain libre si l'équivalent
// (casse différente) existe déjà.
test("C-88 : duplication — suffixe unique même en casse différente", async () => {
  await call("POST", "/api/workflows", { title: "Garde-fou", reference: "mo-dup-copie" }, author);
  const src = await call("POST", "/api/workflows", { title: "Source", reference: "MO-DUP" }, author);
  assert.equal(src.status, 201);
  const dup = await call("POST", `/api/workflows/${src.json.id}/duplicate`, undefined, author);
  assert.equal(dup.status, 201);
  assert.equal(dup.json.reference, "MO-DUP-COPIE-2", "« MO-DUP-COPIE » ≡ « mo-dup-copie » existant → -COPIE-2");
});

test("création + lecture avec étapes", async () => {
  const create = await call("POST", "/api/workflows", { title: "Remplacement courroie", reference: "MO-001", description: "Procédure complète", category: "Maintenance" }, author);
  assert.equal(create.status, 201);
  const id = create.json.id;
  assert.equal(create.json.state, "draft");

  const s1 = await call("POST", `/api/workflows/${id}/steps`, { title: "Couper l'alimentation", body: "Consigner l'armoire" }, author);
  const s2 = await call("POST", `/api/workflows/${id}/steps`, { title: "Démonter le carter" }, author);
  assert.equal(s1.status, 201);
  assert.equal(s2.json.position, 1);

  const got = await call("GET", `/api/workflows/${id}`, undefined, reader);
  assert.equal(got.json.steps.length, 2);
  assert.equal(got.json.steps[0].title, "Couper l'alimentation");
});

test("référence dupliquée → 422", async () => {
  const r = await call("POST", "/api/workflows", { title: "X", reference: "MO-001" }, author);
  assert.equal(r.status, 422);
});

test("modification du workflow", async () => {
  const create = await call("POST", "/api/workflows", { title: "Graissage", reference: "MO-002" }, author);
  const r = await call("PUT", `/api/workflows/${create.json.id}`, { description: "Nouvelle description" }, author);
  assert.equal(r.status, 200);
  assert.equal(r.json.description, "Nouvelle description");
});

test("réordonnancement vérifié en base", async () => {
  const create = await call("POST", "/api/workflows", { title: "Contrôle", reference: "MO-003" }, author);
  const id = create.json.id;
  const a = (await call("POST", `/api/workflows/${id}/steps`, { title: "A" }, author)).json.id;
  const b = (await call("POST", `/api/workflows/${id}/steps`, { title: "B" }, author)).json.id;
  const reorder = await call("PUT", `/api/workflows/${id}/steps/reorder`, { orderedIds: [b, a] }, author);
  assert.equal(reorder.status, 200);
  const got = await call("GET", `/api/workflows/${id}`, undefined, author);
  assert.deepEqual(got.json.steps.map((s: { id: number }) => s.id), [b, a]);
  const reordered = await call("PUT", `/api/workflows/${id}/steps/reorder`, { orderedIds: [a] }, author);
  assert.equal(reordered.status, 422);
});

test("suppression d'une étape recalcule les positions", async () => {
  const create = await call("POST", "/api/workflows", { title: "Nettoyage", reference: "MO-004" }, author);
  const id = create.json.id;
  const a = (await call("POST", `/api/workflows/${id}/steps`, { title: "A" }, author)).json.id;
  await call("POST", `/api/workflows/${id}/steps`, { title: "B" }, author);
  const del = await call("DELETE", `/api/steps/${a}`, undefined, author);
  assert.equal(del.status, 200);
  const got = await call("GET", `/api/workflows/${id}`, undefined, author);
  assert.equal(got.json.steps.length, 1);
  assert.equal(got.json.steps[0].position, 0);
});

test("mise à jour étape avec pictos", async () => {
  const create = await call("POST", "/api/workflows", { title: "Soudure", reference: "MO-005" }, author);
  const id = create.json.id;
  const s = (await call("POST", `/api/workflows/${id}/steps`, { title: "Préparer le poste" }, author)).json;
  assert.deepEqual(s.pictos, [], "POST /steps renvoie pictos en tableau, pas en chaîne JSON");
  const up = await call("PUT", `/api/steps/${s.id}`, { pictos: ["epi", "attention"] }, author);
  assert.equal(up.status, 200);
  assert.deepEqual(up.json.pictos, ["epi", "attention"], "PUT /steps renvoie pictos en tableau, pas en chaîne JSON");
  const got = await call("GET", `/api/workflows/${id}`, undefined, author);
  assert.deepEqual(got.json.steps[0].pictos, ["epi", "attention"]);
});

test("suppression du workflow en cascade (C-46 : admin uniquement)", async () => {
  const create = await call("POST", "/api/workflows", { title: "Périmé", reference: "MO-006" }, author);
  const id = create.json.id;
  await call("POST", `/api/workflows/${id}/steps`, { title: "S" }, author);
  // C-46 : un AUTEUR ne peut plus supprimer un MO — 403
  const forbidden = await call("DELETE", `/api/workflows/${id}`, undefined, author);
  assert.equal(forbidden.status, 403, "C-46 : la suppression est réservée aux admins");
  const del = await call("DELETE", `/api/workflows/${id}`, undefined, admin);
  assert.equal(del.status, 200);
  const got = await call("GET", `/api/workflows/${id}`, undefined, author);
  assert.equal(got.status, 404);
  const steps = (db.prepare("SELECT COUNT(*) c FROM steps WHERE workflow_id = ?").get(id) as { c: number }).c;
  assert.equal(steps, 0, "cascade ON DELETE confirmée en base");
});

test("404 sur workflow inexistant", async () => {
  const r = await call("GET", "/api/workflows/9999", undefined, author);
  assert.equal(r.status, 404);
});

process.on("exit", () => server.close());
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
