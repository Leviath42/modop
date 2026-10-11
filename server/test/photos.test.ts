import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

process.env.MODOP_PHOTOS_DIR = "/tmp/modop-photos-test";
fs.rmSync(process.env.MODOP_PHOTOS_DIR, { recursive: true, force: true });

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author");

const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function login() {
  const res = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "auteur@modop.local", password: "auteurpass1" }) });
  return res.headers.get("set-cookie")!.split(";")[0];
}
const cookie = await login();

const wf = await (await fetch(base + "/api/workflows", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ title: "T", reference: "MO-P1" }) })).json();
const step = await (await fetch(`${base}/api/workflows/${wf.id}/steps`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ title: "S" }) })).json();

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f50002000" +
  "057a1f0f200000000049454e44ae426082",
  "hex"
);

async function uploadPhoto(buf: Buffer, mime: string, extra?: Record<string, string>) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime }), "photo.png");
  if (extra?.alt) fd.append("alt", extra.alt);
  const res = await fetch(`${base}/api/steps/${step.id}/photos`, { method: "POST", headers: { cookie }, body: fd });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test("upload d'une photo écrit en base ET sur disque", async () => {
  const up = await uploadPhoto(PNG, "image/png", { alt: "vue de l'armoire" });
  assert.equal(up.status, 201);
  const onDisk = fs.existsSync(`${process.env.MODOP_PHOTOS_DIR}/${up.json.filename}`);
  assert.ok(onDisk, "fichier écrit sur disque");
  const inDb = db.prepare("SELECT alt FROM photos WHERE id = ?").get(up.json.id) as { alt: string };
  assert.equal(inDb.alt, "vue de l'armoire");
});

test("la photo est servie en HTTP", async () => {
  const photos = db.prepare("SELECT filename FROM photos WHERE step_id = ?").all(step.id) as { filename: string }[];
  const res = await fetch(`${base}/photos/${photos[0].filename}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("type non autorisé → 422", async () => {
  const up = await uploadPhoto(Buffer.from("MZ"), "application/octet-stream");
  assert.equal(up.status, 422);
});

test("upload sur étape inexistante → 404", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "photo.png");
  const res = await fetch(`${base}/api/steps/99999/photos`, { method: "POST", headers: { cookie }, body: fd });
  assert.equal(res.status, 404);
});

test("suppression d'une photo retire la ligne ET le fichier", async () => {
  const up = await uploadPhoto(PNG, "image/png");
  const file = `${process.env.MODOP_PHOTOS_DIR}/${up.json.filename}`;
  assert.ok(fs.existsSync(file));
  const res = await fetch(`${base}/api/photos/${up.json.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 200);
  assert.ok(!fs.existsSync(file), "fichier supprimé du disque");
  const inDb = db.prepare("SELECT COUNT(*) c FROM photos WHERE id = ?").get(up.json.id) as { c: number };
  assert.equal(inDb.c, 0);
});

test("sans session → 401", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "photo.png");
  const res = await fetch(`${base}/api/steps/${step.id}/photos`, { method: "POST", body: fd });
  assert.equal(res.status, 401);
});

process.on("exit", () => server.close());
server.unref();
