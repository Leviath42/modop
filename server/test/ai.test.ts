import { after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/schema.js";
import { createApp } from "../src/app.js";

// C-108 (V14 #1) — socle moteur IA : statut sans secret, test de connexion
// réel contre un FAUX moteur OpenAI en loopback (aucune dépendance externe en
// CI), admin requis, erreurs moteur typées (502), rate limit.
process.env.MODOP_PHOTOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-ai-"));

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?)").run(
  "admin@modop.local", bcrypt.hashSync("adminpass1", 4), "admin",
  "auteur@modop.local", bcrypt.hashSync("auteurpass1", 4), "author"
);
const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function login(email: string, pass: string): Promise<string> {
  const res = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const admin = await login("admin@modop.local", "adminpass1");
const auteur = await login("auteur@modop.local", "auteurpass1");

// Faux moteur OpenAI-compatible en loopback : réponse pilotée par mockState.
const mockState: { reply?: string; status?: number } = {};
const mock = http.createServer((rq, rs) => {
  let body = "";
  rq.on("data", (c) => (body += c));
  rq.on("end", () => {
    if (mockState.status) {
      rs.writeHead(mockState.status, { "content-type": "application/json" });
      rs.end("{}");
      return;
    }
    rs.writeHead(200, { "content-type": "application/json" });
    rs.end(JSON.stringify({ choices: [{ message: { content: mockState.reply ?? "OK" } }] }));
  });
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const mockBase = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;

after(() => {
  server.close();
  mock.close();
  fs.rmSync(process.env.MODOP_PHOTOS_DIR!, { recursive: true, force: true });
});

test("C-108 : statut — non configuré par défaut, sans secret, admin requis", async () => {
  const resA = await fetch(base + "/api/ai", { headers: { cookie: admin } });
  assert.equal(resA.status, 200);
  const st = await resA.json();
  assert.equal(st.configured, false);
  assert.equal(st.key_set, false);
  assert.equal(st.base_url, "");
  // C-108 : le statut est lisible par les auteurs (l'import IA est un outil
  // auteur) — seul le test de connexion reste admin.
  const resAut = await fetch(base + "/api/ai", { headers: { cookie: auteur } });
  assert.equal(resAut.status, 200);
  const stAut = await resAut.json();
  assert.equal(stAut.configured, false);
});

test("C-108 : statut configuré — expose la config, JAMAIS la clé", async () => {
  process.env.MODOP_AI_BASE_URL = mockBase + "/v1";
  process.env.MODOP_AI_MODEL = "test-vision-1";
  process.env.MODOP_AI_API_KEY = "cle-secrete-a-ne-jamais-voir";
  const res = await fetch(base + "/api/ai", { headers: { cookie: admin } });
  const st = await res.json();
  assert.equal(st.configured, true);
  assert.equal(st.key_set, true);
  assert.equal(st.model, "test-vision-1");
  assert.ok(!JSON.stringify(st).includes("cle-secrete"), "la clé ne doit jamais apparaître");
});

test("C-108 : test de connexion — ping OK + latence", async () => {
  const res = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.ok, true);
  assert.ok(typeof out.latency_ms === "number");
  assert.equal(out.reply, "OK");
});

test("C-108 : test de connexion — moteur en erreur => 502, réponse hors-sujet => ok:false", async () => {
  mockState.status = 500;
  const res1 = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res1.status, 502);
  mockState.status = 0;
  mockState.reply = "Désolé, je ne peux pas.";
  const res2 = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: admin } });
  assert.equal(res2.status, 200);
  const out2 = await res2.json();
  assert.equal(out2.ok, false);
  mockState.reply = undefined;
});

test("C-108 : test de connexion — 403 pour un auteur", async () => {
  const res = await fetch(base + "/api/ai/test", { method: "POST", headers: { cookie: auteur } });
  assert.equal(res.status, 403);
});
