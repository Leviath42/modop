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
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const cookie = (await call("POST", "/api/auth/login", { email: "a@modop.local", password: "auteurpass1" })).cookie!;

test("annotations persistées et relues via GET workflow", async () => {
  const wf = await call("POST", "/api/workflows", { title: "T", reference: "MO-AN1" }, cookie);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  const fd = new FormData();
  fd.append("file", new Blob([PNG_MIN], { type: "image/png" }), "p.png");
  fd.append("alt", "dispositif");
  const up = await fetch(`${base}/api/steps/${step.json.id}/photos`, { method: "POST", headers: { cookie }, body: fd });
  const photo = await up.json();

  const shapes = [
    { type: "arrow", x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.5, color: "#d0021b" },
    { type: "rect", x1: 0.1, y1: 0.1, w: 0.4, h: 0.3, color: "#f5a623" },
    { type: "text", x1: 0.5, y1: 0.7, text: "Repère 12", color: "#1f4e9c" },
  ];
  const save = await call("PUT", `/api/photos/${photo.id}/annotations`, { annotations: shapes }, cookie);
  assert.equal(save.status, 200);
  assert.equal(save.json.count, 3);

  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  const stored = got.json.steps[0].photos[0].annotations;
  assert.equal(stored.length, 3);
  assert.equal(stored[0].type, "arrow");
  assert.equal(stored[2].text, "Repère 12");
});

test("annotations invalides → 422", async () => {
  const r = await call("PUT", `/api/photos/999/annotations`, { annotations: [] }, cookie);
  assert.equal(r.status, 404);
  const bad = await call("PUT", `/api/photos/1/annotations`, { annotations: "pas un tableau" }, cookie);
  assert.equal(bad.status, 422);
});

process.on("exit", () => {
  server.close();
  fs.rmSync("data", { recursive: true, force: true });
});
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
