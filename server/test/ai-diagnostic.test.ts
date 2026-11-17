import { after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/schema.js";
import { createApp } from "../src/app.js";

// C-116 — le test de connexion doit dire la CAUSE (clé refusée, modèle
// absent du catalogue, message du moteur), pas un « HTTP 400 » muet.
// Vécu : pixtral-large-latest retiré du catalogue Mistral, affiché 502.
process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-aid-"));

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run(
  "admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin"
);
const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const loginRes = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@modop.local", password: "adminpass1" }),
});
const admin = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";

// Faux moteur OpenAI-compatible : /models et /chat/completions pilotés par state.
const state: { modelsStatus?: number; chatStatus?: number; chatBody?: unknown } = {};
const mock = http.createServer((rq, rs) => {
  rq.on("data", () => {});
  rq.on("end", () => {
    if ((rq.url ?? "").includes("/models")) {
      rs.writeHead(state.modelsStatus || 200, { "content-type": "application/json" });
      rs.end(JSON.stringify({ data: [{ id: "good-model" }] }));
      return;
    }
    if (state.chatStatus) {
      rs.writeHead(state.chatStatus, { "content-type": "application/json" });
      rs.end(JSON.stringify(state.chatBody ?? { message: "Invalid model: bad-model", type: "invalid_model" }));
      return;
    }
    rs.writeHead(200, { "content-type": "application/json" });
    rs.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
  });
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const mockBase = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;

after(() => {
  server.close();
  mock.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

async function configure(model: string): Promise<void> {
  const res = await fetch(base + "/api/ai/config", {
    method: "PUT",
    headers: { cookie: admin, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, base_url: mockBase + "/v1", model, api_key: "cle-test-c116", timeout_ms: 8000 }),
  });
  assert.equal(res.status, 200);
}

test("C-116 : diagnostic — tout vert : ok + check catalogue", async () => {
  await configure("good-model");
  const res = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.ok, true);
  assert.equal(out.reply, "OK");
  assert.ok(Array.isArray(out.checks), "checks présents");
  assert.ok(out.checks.some((c: { note: string }) => /catalogue/.test(c.note)));
});

test("C-116 : clé refusée (401 sur /models) => message clé, pas 502 muet", async () => {
  state.modelsStatus = 401;
  const res = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res.status, 502);
  const out = await res.json();
  assert.match(String(out.message), /clé API refusée/);
  state.modelsStatus = undefined;
});

test("C-116 : modèle absent du catalogue => 422 actionnable avant tout token", async () => {
  await configure("pixtral-large-latest");
  const res = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res.status, 422);
  const out = await res.json();
  assert.match(String(out.message), /absent du catalogue/);
  await configure("good-model");
});

test("C-116 : erreur moteur avec message JSON => le détail moteur est visible", async () => {
  state.chatStatus = 400;
  const res = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res.status, 502);
  const out = await res.json();
  assert.match(String(out.message), /HTTP 400/);
  assert.match(String(out.message), /Invalid model/);
  state.chatStatus = 0;
});

test("C-116 : catalogue non lisible (/models absent) => pas disqualifié, ping seul", async () => {
  state.modelsStatus = 404;
  const res = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.ok, true);
  assert.ok(out.checks.some((c: { note: string }) => /ignoré/.test(c.note)));
  state.modelsStatus = undefined;
});
