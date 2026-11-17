// C-104 (V13 #7) : corpus + manifest — GET /api/corpus (zip md+json des MO
// publiés, checksums sha256, filtre ?since=) ; C-106 (V13 #4) : export PDF.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import JSZip from "jszip";
import { createHash } from "node:crypto";

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
const login = (email: string, pass: string) =>
  call("POST", "/api/auth/login", { email, password: pass }).then((r) => r.cookie ?? "");
const auteur = await login("auteur@modop.local", "auteurpass1");
const lecteur = await login("lecteur@modop.local", "lecteurpass1");

const w1 = await call("POST", "/api/workflows", { title: "Montage fusibles", reference: "MO-C104A" }, auteur);
await call("POST", "/api/workflows/" + w1.json.id + "/steps", { title: "Préparer le poste" }, auteur);
const pub1 = await call("POST", "/api/workflows/" + w1.json.id + "/publish", { changelog: "V1" }, auteur);
assert.equal(pub1.status, 200, "publication V1");
const w2 = await call("POST", "/api/workflows", { title: "Contrôle qualité", reference: "MO-C104B" }, auteur);
await call("POST", "/api/workflows/" + w2.json.id + "/steps", { title: "Vérifier les fusibles" }, auteur);
const pub2 = await call("POST", "/api/workflows/" + w2.json.id + "/publish", { changelog: "V1" }, auteur);
assert.equal(pub2.status, 200, "publication V1 bis");

after(() => {
  server.close();
});

test("C-104 : GET /api/corpus — zip md+json + manifest checksums, filtre since", async () => {
  const res = await fetch(base + "/api/corpus", { headers: { cookie: lecteur } });
  assert.equal(res.status, 200);
  assert.ok((res.headers.get("content-type") ?? "").includes("application/zip"), "content-type zip");
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  assert.equal(manifest.count, 2, "deux MO publiés");
  const a = manifest.items.find((i: { reference: string }) => i.reference === "MO-C104A") as { version: number; checksums: { md: string; json: string } };
  assert.ok(a, "item MO-C104A au manifest");
  assert.equal(a.version, 1);
  const mdA = await zip.file("MO-C104A-V1.md").async("string");
  assert.equal(a.checksums.md, createHash("sha256").update(mdA).digest("hex"), "checksum md = sha256 du fichier");
  const jsA = JSON.parse(await zip.file("MO-C104A-V1.json").async("string"));
  assert.equal(jsA.meta.reference, "MO-C104A");
  assert.ok(mdA.startsWith("---"), "markdown front matter");

  const res2 = await fetch(base + "/api/corpus?since=2031-01-01T00:00:00", { headers: { cookie: lecteur } });
  const zip2 = await JSZip.loadAsync(Buffer.from(await res2.arrayBuffer()));
  const manifest2 = JSON.parse(await zip2.file("manifest.json").async("string"));
  assert.equal(manifest2.count, 0, "since futur = aucun MO");

  const res3 = await fetch(base + "/api/corpus");
  assert.equal(res3.status, 401, "sans session = refusé");
});

test("C-106 : export PDF (?format=pdf) — signature, type, 404 inchangé", async () => {
  const res = await fetch(base + "/api/workflows/" + w1.json.id + "/export?format=pdf", { headers: { cookie: lecteur } });
  assert.equal(res.status, 200);
  assert.ok((res.headers.get("content-type") ?? "").includes("application/pdf"), "content-type pdf");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 4).toString(), "%PDF", "signature PDF");
  assert.ok(buf.length > 700, "pdf non trivial (page de garde + etape + pagination)");
  const nf = await fetch(base + "/api/workflows/999/export?format=pdf", { headers: { cookie: lecteur } });
  assert.equal(nf.status, 404, "workflow inexistant = 404");
});
