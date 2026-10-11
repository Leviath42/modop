import { after, test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";const PNG_MIN = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010000000049454e44ae426082","hex");

// Reproduit le parcours utilisateur complet sur une BASE MIGRÉE v1->v3
// (comme la prod) : upload photo via l'API, puis PUT annotations avec les
// shapes exacts que le front envoie (arrow/rect/text) — traque le 500.
const FILE = "/tmp/modop-annot500.db";
for (const f of [FILE, FILE + "-wal", FILE + "-shm"]) fs.rmSync(f, { force: true });

// base au schéma v1 (avant annotations/display_*)
const raw = new Database(FILE);
raw.exec(`
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE workflows (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'draft', current_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE steps (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL, position INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', pictos TEXT NOT NULL DEFAULT '[]', UNIQUE (workflow_id, position));
CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, step_id INTEGER NOT NULL, filename TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '');
CREATE TABLE versions (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL, number INTEGER NOT NULL, snapshot TEXT NOT NULL, author_email TEXT NOT NULL, published_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (workflow_id, number));
`);
raw.close();

const { openDb } = await import("../src/db/schema.js");
const { createApp } = await import("../src/app.js");
const bcrypt = (await import("bcryptjs")).default;
const http = await import("node:http");

fs.rmSync("data", { recursive: true, force: true });
const db = openDb(FILE);   // <- migration v1->v3 ici
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("a@modop.local", bcrypt.hashSync("p", 4), "author");
const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function call(method: string, p: string, body?: unknown, cookie?: string, isForm = false) {
  const res = await fetch(base + p, {
    method,
    headers: isForm ? { cookie } : { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* réponse non JSON */ }
  return { status: res.status, json, text };
}
const login = await call("POST", "/api/auth/login", { email: "a@modop.local", password: "p" });
const cookie = (login.headers ?? (login as { json?: { }})) ? "" : ""; // placeholder

// refaire proprement le login avec getSetCookie
const lres = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@modop.local", password: "p" }) });
const sc = lres.headers.getSetCookie?.() ?? [];
const ck = sc.find((c) => c.startsWith("modop_session="))!.split(";")[0];

test("annotations sur base migrée : parcours complet sans 500", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-AN500" }, ck);
  assert.equal(wf.status, 201);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, ck);
  const fd = new FormData();
  fd.append("file", new Blob([PNG_MIN], { type: "image/png" }), "p.png");
  fd.append("alt", "photo test");
  const up = await call("POST", `/api/steps/${step.json.id}/photos`, fd, ck, true);
  assert.equal(up.status, 201, "upload: " + JSON.stringify(up.json));
  const photo = up.json;

  // shapes exacts du front (photo-annotator) : arrow avec x2/y2, rect avec w/h, text
  const shapes = [
    { type: "arrow", x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.5, color: "#d0021b" },
    { type: "rect", x1: 0.1, y1: 0.1, w: 0.4, h: 0.3, color: "#f5a623" },
    { type: "text", x1: 0.5, y1: 0.7, text: "Repère 12", color: "#1f4e9c" },
  ];
  const save = await call("PUT", `/api/photos/${photo.id}/annotations`, { annotations: shapes }, ck);
  assert.equal(save.status, 200, "PUT annotations: " + save.status + " " + save.text);

  // relecture complète (le GET workflow parse les annotations)
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, ck);
  assert.equal(got.status, 200);
  assert.equal(got.json.steps[0].photos[0].annotations.length, 3);

  // layout aussi (les boutons S/M/L et alignement)
  const lay = await call("PUT", `/api/photos/${photo.id}/layout`, { display_size: "large", display_align: "left" }, ck);
  assert.equal(lay.status, 200, "PUT layout: " + lay.status);
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
