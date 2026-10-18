import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";const PNG_MIN = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010000000049454e44ae426082","hex");
import fs from "node:fs";

fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
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
  const sc = res.headers.getSetCookie?.() ?? [];
  const session = sc.find((c) => c.startsWith("modop_session="));
  return { status: res.status, json: await res.json().catch(() => null), cookie: session ? session.split(";")[0] : null };
}
const loginRes = await call("POST", "/api/auth/login", { email: "a@modop.local", password: "auteurpass1" });
if (loginRes.status !== 200) throw new Error("login échoué: " + JSON.stringify(loginRes.json));
if (!loginRes.cookie) throw new Error("pas de cookie de session");
const cookie = loginRes.cookie;

test("layout photo : taille et position persistées et relues", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-PL1" }, cookie);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  const fd = new FormData();
  fd.append("file", new Blob([PNG_MIN], { type: "image/png" }), "p.png");
  fd.append("alt", "photo");
  const up = await fetch(`${base}/api/steps/${step.json.id}/photos`, { method: "POST", headers: { cookie }, body: fd });
  const photo = await up.json();

  const set = await call("PUT", `/api/photos/${photo.id}/layout`, { display_size: "full", display_align: "left", display_x: 0.1, display_y: 0.2, display_w: 0.8 }, cookie);
  if (set.status !== 200) throw new Error("PUT layout: " + set.status + " " + JSON.stringify(set.json));
  assert.equal(set.status, 200);
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  assert.equal(got.json.steps[0].photos[0].display_size, "full");
  assert.equal(got.json.steps[0].photos[0].display_align, "left");
  assert.equal(got.json.steps[0].photos[0].display_x, 0.1);
  assert.equal(got.json.steps[0].photos[0].display_w, 0.8);

  const bad = await call("PUT", `/api/photos/${photo.id}/layout`, { display_size: "énorme" }, cookie);
  assert.equal(bad.status, 422);
  const bad2 = await call("PUT", `/api/photos/${photo.id}/layout`, { display_w: 1.5 }, cookie);
  assert.equal(bad2.status, 422, "w>1 rejeté");

  // C-71 : display_y > 1 est LÉGITIME (fraction de 240 px — canevas plus haut).
  // Avant le correctif : 422 silencieux → positions de la 2e photo perdues.
  const below = await call("PUT", `/api/photos/${photo.id}/layout`, { display_y: 1.75, display_x: 0.2, display_w: 1 }, cookie);
  assert.equal(below.status, 200, "y=1.75 accepté (photo sous la première)");
  const gotBelow = await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  assert.equal(gotBelow.json.steps[0].photos[0].display_y, 1.75, "y>1 persisté et relu");
  const badY = await call("PUT", `/api/photos/${photo.id}/layout`, { display_y: -0.5 }, cookie);
  assert.equal(badY.status, 422, "y négatif rejeté");
  const badY2 = await call("PUT", `/api/photos/${photo.id}/layout`, { display_y: 12 }, cookie);
  assert.equal(badY2.status, 422, "y>10 rejeté");
});

// C-73 : rognage — remplacement du FICHIER en place (même ligne : position
// conservée) + repointage (retour arrière vers l'ancien fichier).
test("rognage : remplacement du fichier en place + retour arrière", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T2", reference: "MO-PL2" }, cookie);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  const fd = new FormData();
  fd.append("file", new Blob([PNG_MIN], { type: "image/png" }), "p1.png");
  fd.append("alt", "origine");
  const up = await fetch(`${base}/api/steps/${step.json.id}/photos`, { method: "POST", headers: { cookie }, body: fd });
  const photo = await up.json();

  // position posée
  await call("PUT", `/api/photos/${photo.id}/layout`, { display_size: "full", display_align: "left", display_x: 0.3, display_y: 1.2, display_w: 0.7 }, cookie);

  // rognage : remplacement du fichier (multipart)
  const fd2 = new FormData();
  fd2.append("file", new Blob([PNG_MIN], { type: "image/png" }), "rognee.png");
  const rep = await fetch(`${base}/api/photos/${photo.id}/file`, { method: "PUT", headers: { cookie }, body: fd2 });
  assert.equal(rep.status, 200, "PUT file: " + rep.status);
  const repJson = await rep.json();
  assert.notEqual(repJson.filename, photo.filename, "nouveau fichier");
  assert.equal(repJson.display_x, 0.3, "position X conservée");
  assert.equal(repJson.display_y, 1.2, "position Y conservée (y>1 toléré)");
  assert.equal(repJson.alt, "origine", "alt conservé");

  // retour arrière : repointage vers l'ancien fichier (resté sur le disque)
  const back = await call("PUT", `/api/photos/${photo.id}/file`, { filename: photo.filename }, cookie);
  assert.equal(back.status, 200, "repointage: " + back.status + " " + JSON.stringify(back.json));
  assert.equal(back.json.filename, photo.filename, "ancien fichier restauré");

  // garde-fous : fichier inexistant / id inconnu
  const bad = await call("PUT", `/api/photos/${photo.id}/file`, { filename: "inconnu.png" }, cookie);
  assert.equal(bad.status, 422, "fichier inexistant rejeté");
  const nf = await call("PUT", `/api/photos/999999/file`, { filename: "x.png" }, cookie);
  assert.equal(nf.status, 404, "photo inconnue → 404");
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
