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
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const cookie = (await call("POST", "/api/auth/login", { email: "a@modop.local", password: "auteurpass1" })).cookie!;

test("F5/F6 : publish -> modification -> restore restitue canvas et display_*", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Canvas RT", reference: "MO-CV1" }, cookie);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S1" }, cookie);
  const shapes = [{ type: "rect", x1: 0.1, y1: 0.2, w: 0.3, h: 0.4, color: "#f5a623" }];
  await call("PUT", `/api/steps/${step.json.id}/canvas`, { shapes }, cookie);
  // photo factice avec layout
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010000000049454e44ae426082", "hex");
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "p.png");
  fd.append("alt", "photo");
  const up = await fetch(`${base}/api/steps/${step.json.id}/photos`, { method: "POST", headers: { cookie }, body: fd });
  assert.equal(up.status, 201);
  const photo = await up.json();
  await call("PUT", `/api/photos/${photo.id}/layout`, { display_size: "large", display_align: "left", display_x: 0.5, display_y: 0.25, display_w: 0.8 }, cookie);
  // publication V1
  const pub = await call("POST", `/api/workflows/${wf.json.id}/publish`, undefined, cookie);
  assert.equal(pub.status, 200);
  // destruction : on vide le canvas et le layout
  await call("PUT", `/api/steps/${step.json.id}/canvas`, { shapes: [] }, cookie);
  await call("PUT", `/api/photos/${photo.id}/layout`, { display_size: "small", display_align: "center", display_x: null, display_y: null, display_w: null }, cookie);
  // restauration de V1
  const restore = await call("POST", `/api/workflows/${wf.json.id}/versions/1/restore`, undefined, cookie);
  assert.equal(restore.status, 200);
  // le canvas et le layout sont revenus
  const got = await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  const st = got.json.steps[0];
  assert.equal(st.canvas.length, 1);
  assert.equal(st.canvas[0].type, "rect");
  assert.equal(st.photos[0].display_size, "large");
  assert.equal(st.photos[0].display_align, "left");
  assert.equal(st.photos[0].display_x, 0.5);
});

test("F6 : duplication conserve canvas et display_*", async () => {
  const wf = await call("POST", "/api/workflows", { title: "Dup CV", reference: "MO-CV2" }, cookie);
  const step = await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S1" }, cookie);
  const shapes = [{ type: "arrow", x1: 0, y1: 0, x2: 0.5, y2: 0.5, color: "#d0021b" }];
  await call("PUT", `/api/steps/${step.json.id}/canvas`, { shapes }, cookie);
  const dup = await call("POST", `/api/workflows/${wf.json.id}/duplicate`, undefined, cookie);
  assert.equal(dup.status, 201);
  const got = await call("GET", `/api/workflows/${dup.json.id}`, undefined, cookie);
  assert.equal(got.json.steps[0].canvas.length, 1);
  assert.equal(got.json.steps[0].canvas[0].type, "arrow");
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
server.unref();
