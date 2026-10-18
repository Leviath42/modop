import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";
fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run("a@modop.local", bcrypt.hashSync("auteurpass1", 4), "admin");
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

test("RF-77 : les consultations alimentent les stats", async () => {
  const wf = await call("POST", "/api/workflows", { title: "V", reference: "MO-V1" }, cookie);
  await call("POST", `/api/workflows/${wf.json.id}/steps`, { title: "S" }, cookie);
  await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  await call("GET", `/api/workflows/${wf.json.id}`, undefined, cookie);
  const stats = await call("GET", "/api/stats", undefined, cookie);
  assert.equal(stats.status, 200);
  assert.ok(stats.json.views >= 3, "views doit compter les consultations");
  const top = stats.json.topViewed.find((t: { target: string }) => t.target === `workflow:${wf.json.id}`);
  assert.ok(top && top.n === 3, "le MO doit être le plus consulté avec 3 vues");
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();
