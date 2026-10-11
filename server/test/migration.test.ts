import { after, test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";

// Base au schéma v1 (premier install, avant audit_log/expires_at/auth_provider)
const FILE = "/tmp/modop-migration-test.db";
fs.rmSync(FILE, { force: true });
fs.rmSync(FILE + "-wal", { force: true });
fs.rmSync(FILE + "-shm", { force: true });

const raw = new Database(FILE);
raw.exec(`
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('reader','author','admin')), created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE workflows (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published')), current_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE steps (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE, position INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', pictos TEXT NOT NULL DEFAULT '[]', UNIQUE (workflow_id, position));
CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE, filename TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '');
CREATE TABLE versions (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE, number INTEGER NOT NULL, snapshot TEXT NOT NULL, author_email TEXT NOT NULL, published_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (workflow_id, number));
INSERT INTO users (email, password_hash, role) VALUES ('ancien@modop.local', 'x', 'admin');
INSERT INTO sessions (token, user_id) VALUES ('vieilletoken', 1);
`);
raw.close();

test("migration v1 → v3 : openDb migre une base ancienne sans perte", async () => {
  const { openDb } = await import("../src/db/schema.js");
  const { createApp } = await import("../src/app.js");
  const http = await import("node:http");

  const db = openDb(FILE);
  const app = createApp(db);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  const h = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(h.status, 200, "le serveur démarre sur base migrée");

  const sess = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  assert.ok(sess.some((c) => c.name === "expires_at"), "expires_at ajoutée");
  const us = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  assert.ok(us.some((c) => c.name === "auth_provider"), "auth_provider ajouté");
  db.prepare("SELECT COUNT(*) c FROM audit_log").get();
  const old = db.prepare("SELECT expires_at e FROM sessions WHERE token='vieilletoken'").get() as { e: string };
  assert.ok(old.e, "vieille session reçoit une expiration");

  const users = db.prepare("SELECT email FROM users").all() as { email: string }[];
  assert.equal(users.length, 1, "données conservées");
  assert.equal(users[0].email, "ancien@modop.local");

  server.close();
  console.log("MIGRATION V1→V3 OK");
});
