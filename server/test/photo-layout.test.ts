import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
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
  fd.append("file", new Blob([Buffer.from("89504e47", "hex")], { type: "image/png" }), "p.png");
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
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
server.unref();
