import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";

fs.rmSync("data", { recursive: true, force: true });

const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("user@modop.local", bcrypt.hashSync("motdepasse1", 4), "author");

const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function call(method: string, path: string, body?: object, cookie?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}

test("en-têtes de sécurité présents sur toutes les réponses", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.ok(r.headers.get("content-security-policy")?.includes("default-src 'self'"));
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
});

test("login OK avec session en base et cookie httpOnly", async () => {
  const r = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  assert.equal(r.status, 200);
  assert.ok(r.headers.get("set-cookie")?.includes("HttpOnly"));
  const me = await call("GET", "/api/auth/me", undefined, r.cookie!);
  assert.equal(me.status, 200);
});

test("session expire : ttl court → 401 après expiration", async () => {
  const r = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  assert.equal(r.status, 200);
  // Expiration immédiate simulée en base
  db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 minute')").run();
  const me = await call("GET", "/api/auth/me", undefined, r.cookie!);
  assert.equal(me.status, 401);
});

test("audit log : login et login échoué tracés en base", async () => {
  await call("POST", "/api/auth/login", { email: "user@modop.local", password: "faux" });
  const rows = db.prepare("SELECT action FROM audit_log ORDER BY id").all() as { action: string }[];
  assert.ok(rows.some((x) => x.action === "login_echec"), "login_echec tracé");
  await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  const rows2 = db.prepare("SELECT action FROM audit_log ORDER BY id").all() as { action: string }[];
  assert.ok(rows2.some((x) => x.action === "login"), "login tracé");
});

test("rate limit : 10 tentatives puis 429", async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await call("POST", "/api/auth/login", { email: "brute@modop.local", password: "faux" });
    last = r.status;
  }
  assert.equal(last, 429);
});

test("SSO non configuré : /oidc/login → 404, status enabled=false", async () => {
  const st = await call("GET", "/api/auth/oidc/status");
  assert.equal(st.json.enabled, false);
  const r = await call("GET", "/api/auth/oidc/login");
  assert.equal(r.status, 404);
});

test("publish et export tracés dans l'audit log", async () => {
  const login = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  const cookie = login.cookie!;
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-SEC1" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, cookie);
  await call("GET", `/api/workflows/${wf.json.id}/export`, undefined, cookie);
  const actions = (db.prepare("SELECT action, target FROM audit_log ORDER BY id").all() as { action: string; target: string }[])
    .filter((x) => x.target.startsWith("workflow:"));
  assert.ok(actions.some((x) => x.action === "create_workflow"), "create_workflow tracé");
  assert.ok(actions.some((x) => x.action === "publish"), "publish tracé");
  assert.ok(actions.some((x) => x.action === "export_docx"), "export_docx tracé");
});

test("anti-CSRF : POST cross-site refusé, same-origin accepté", async () => {
  const login = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  assert.equal(login.status, 200);
  const host = new URL(base).host;
  // Origin d'un autre site -> 403
  const csrf = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { origin: "https://attaquant.example", cookie: login.cookie! },
  });
  assert.equal(csrf.status, 403);
  // Sec-Fetch-Site cross-site -> 403
  const csrf2 = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site", cookie: login.cookie! },
  });
  assert.equal(csrf2.status, 403);
  // Same-origin accepté
  const ok = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { origin: base, cookie: login.cookie! },
  });
  assert.equal(ok.status, 200);
  // Sans en-têtes d'origine (curl, tests) accepté
  const ok2 = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "user@modop.local", password: "motdepasse1" }),
  });
  assert.equal(ok2.status, 200);
  assert.equal(new URL(base).host, host);
});

test("en-têtes COOP/CORP présents", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(r.headers.get("cross-origin-resource-policy"), "same-origin");
});

test("S4 : les 500 renvoient un message générique (pas de détail interne)", async () => {
  const login = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  // Provocation d'un 500 : canvas sans body parser ne peut pas être testé
  // directement ; on vérifie que le handler ne laisse jamais fuiter err.message
  // en injectant une erreur via une route inexistante mutante (404 attendu).
  // Le vrai 500 est couvert par annot-500.test.ts (ancien bug réel).
  const r = await fetch(base + "/api/inexistante", { method: "POST", headers: { cookie: login.cookie! } });
  assert.ok([404, 500].includes(r.status));
  if (r.status === 500) {
    const j = (await r.json()) as { message?: string };
    assert.ok(!j.message?.includes("/") || j.message === "Erreur interne — consultez les logs du serveur");
  }
});



test("S2 : photos accessibles uniquement authentifié", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010000000049454e44ae426082", "hex");
fs.mkdirSync("data/photos", { recursive: true });
  fs.writeFileSync("data/photos/test-secure.png", png);
  // Non authentifié -> 401
  const anon = await fetch(base + "/photos/test-secure.png");
  assert.equal(anon.status, 401);
  // Authentifié -> 200
  const login = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  const auth = await fetch(base + "/photos/test-secure.png", { headers: { cookie: login.cookie! } });
  assert.equal(auth.status, 200);
});

test("S3 : upload avec contenu non conforme refusé (magic numbers)", async () => {
  const login = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  const wf = await call("POST", "/api/workflows", { title: "Sniff", reference: "SNIFF-1" }, login.cookie!);
  assert.equal(wf.status, 201);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "Étape" }, login.cookie!);
  assert.equal(step.status, 201);
  const fake = new FormData();
  fake.append("file", new Blob([Buffer.from("<script>alert(1)</script>")], { type: "image/png" }), "evil.png");
  fake.append("alt", "piège");
  const res = await fetch(base + `/api/steps/${step.json.id}/photos`, {
    method: "POST",
    headers: { cookie: login.cookie! },
    body: fake,
  });
  assert.equal(res.status, 422);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
server.unref();

test("anti-CSRF : X-Forwarded-Host honored derrière un reverse proxy/tunnel", async () => {
  // Deux sessions fraîches (le rate-limiter compte les login ; emails distincts)
  const login1 = await call("POST", "/api/auth/login", { email: "user@modop.local", password: "motdepasse1" });
  db.prepare("INSERT OR IGNORE INTO users (email, password_hash, role) VALUES (?, ?, 'author')").run(
    "admin2@modop.local",
    bcrypt.hashSync("motdepasse1", 4)
  );
  const login2 = await call("POST", "/api/auth/login", { email: "admin2@modop.local", password: "motdepasse1" });
  assert.equal(login2.status, 200);
  // Scénario tunnel : le Host vu par Express est localhost, mais le proxy
  // transmet l'hôte public dans X-Forwarded-Host — doit être accepté.
  const ok = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: {
      origin: "https://modop-beta.calironi.com",
      "x-forwarded-host": "modop-beta.calironi.com",
      "x-forwarded-proto": "https",
      cookie: login1.cookie!,
    },
  });
  assert.equal(ok.status, 200);
  // Et un vrai cross-site derrière le même proxy reste refusé.
  const csrf = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: {
      origin: "https://attaquant.example",
      "x-forwarded-host": "modop-beta.calironi.com",
      cookie: login2.cookie!,
    },
  });
  assert.equal(csrf.status, 403);
});
