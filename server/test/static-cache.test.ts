import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import { createApp } from "../src/app.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// C-09/C-10 : le HTML doit être servi frais (no-store) pour que le script
// inline de thème s'applique sans flash ; les assets empreintés en cache
// long. Régression : un middleware next("static-assets") court-circuitait
// tous les /assets/* vers le handler 500 -> page blanche.
const WEB_DIST = process.env.MODOP_WEB_DIST_TEST ?? path.resolve("../web/dist");
const hasDist = fs.existsSync(WEB_DIST);
if (hasDist) fs.rmSync("data", { recursive: true, force: true });
const db = openDb(":memory:");
const app = createApp(db, hasDist ? WEB_DIST : undefined);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

test("index.html servi sans cache navigateur (script de thème toujours frais)", { skip: !hasDist }, async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.ok((res.headers.get("cache-control") ?? "").includes("no-store"));
});

test("assets empreintés servis en 200 (jamais de 500 middleware)", { skip: !hasDist }, async () => {
  const files = fs.readdirSync(path.join(WEB_DIST, "assets")).filter((f) => f.endsWith(".js"));
  assert.ok(files.length > 0, "bundle JS absent du dist");
  const res = await fetch(base + "/assets/" + files[0]);
  assert.equal(res.status, 200);
  assert.ok((res.headers.get("cache-control") ?? "").includes("immutable"));
});

process.on("exit", () => { server.close(); fs.rmSync("data", { recursive: true, force: true }); });
after(() => { (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); return Promise.resolve(server.close()); });
server.unref();

// C-15 : le thème est injecté côté serveur depuis le cookie modop-theme —
// le HTML part avec le bon data-theme, insensible aux caches.
test("thème injecté depuis le cookie modop-theme", { skip: !hasDist }, async () => {
  const dark = await fetch(base + "/", { headers: { cookie: "modop-theme=dark" } });
  assert.equal(dark.status, 200);
  const html = await dark.text();
  assert.ok(html.includes('<html lang="fr" data-theme="dark">'), "data-theme=dark attendu dans le HTML");
  const light = await fetch(base + "/", { headers: { cookie: "modop-theme=light" } });
  const htmlLight = await light.text();
  assert.ok(htmlLight.includes('<html lang="fr" data-theme="light">'), "data-theme=light attendu");
  const anon = await fetch(base + "/");
  const htmlAnon = await anon.text();
  assert.ok(!htmlAnon.includes('data-theme="dark"'), "sans cookie : pas d'injection, script inline de repli");
});
