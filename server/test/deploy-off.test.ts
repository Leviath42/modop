import { after, test } from "node:test";
import assert from "node:assert/strict";
process.env.MODOP_DEPLOY = "off";
const { openDb } = await import("../src/db/schema.js");
const { createApp } = await import("../src/app.js");
import bcrypt from "bcryptjs";
import http from "node:http";
import fs from "node:fs";

fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin");

const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

test("MODOP_DEPLOY=off : /api/deploy refuse tout, même au statut (403)", async () => {
  const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@modop.local", password: "adminpass1" }) });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const st = await fetch(base + "/api/deploy/status", { headers: { cookie } });
  assert.equal(st.status, 403);
  const tr = await fetch(base + "/api/deploy/trigger", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ mode: "update" }) });
  assert.equal(tr.status, 403);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
