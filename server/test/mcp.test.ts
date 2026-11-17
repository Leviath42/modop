// C-90 : tests E2E du serveur MCP — client SDK réel sur /mcp, compte de
// service bootstrappé depuis l'env, outils passant par l'API loopback.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db/schema.js";
import { createApp } from "../src/app.js";
import { setMcpBaseUrl } from "../src/mcp/config.js";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import JSZip from "jszip";

process.env.MODOP_MCP_TOKEN = "jeton-test-c90";
process.env.MODOP_MCP_EMAIL = "svc-mcp@modop.local";
process.env.MODOP_MCP_PASSWORD = "svcmcppass1";
process.env.MODOP_MCP_ROLE = "author";

const db = openDb(":memory:");
const app = createApp(db);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
setMcpBaseUrl(base);

async function connectClient(token: string): Promise<Client> {
  const client = new Client({ name: "test-c90", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

const client = await connectClient("jeton-test-c90");

interface ToolResponse {
  isError?: boolean;
  content?: { type: string; text?: string }[];
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResponse> {
  return (await client.callTool({ name, arguments: args })) as ToolResponse;
}

function toolJson(res: ToolResponse): Record<string, unknown> {
  const text = res.content?.[0]?.text;
  assert.ok(text, "contenu texte attendu");
  return JSON.parse(text) as Record<string, unknown>;
}

test("C-90 : sans token → connexion refusée (401)", async () => {
  await assert.rejects(connectClient("sans-rapport"));
});

test("C-90 : mauvais token → connexion refusée (401)", async () => {
  await assert.rejects(connectClient("jeton-errone"));
});

test("C-90 : GET/DELETE /mcp interdits (stateless, 405)", async () => {
  const get = await fetch(`${base}/mcp`, { headers: { authorization: "Bearer jeton-test-c90" } });
  assert.equal(get.status, 405);
  const del = await fetch(`${base}/mcp`, {
    method: "DELETE",
    headers: { authorization: "Bearer jeton-test-c90" },
  });
  assert.equal(del.status, 405);
});

test("C-91 : instructions servies à l'initialize", async () => {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer jeton-test-c90",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
      },
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result?: { instructions?: string } };
  assert.ok(body.result?.instructions?.includes("Modop"), "instructions absentes");
  assert.ok(body.result?.instructions?.includes("publish_workflow"), "recette absente des instructions");
});

test("C-90 : liste des outils complète (≥ 20, cœur présent)", async () => {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  assert.ok(names.length >= 20, `attendu ≥ 20 outils, reçu ${names.length}`);
  for (const attendu of [
    "whoami",
    "list_workflows",
    "create_workflow",
    "publish_workflow",
    "create_step",
    "upload_photo",
    "export_docx",
    "send_feedback",
    "list_users",
    "get_stats",
  ]) {
    assert.ok(names.includes(attendu), `outil manquant : ${attendu}`);
  }
});

test("C-90 : whoami = compte de service author", async () => {
  const me = toolJson(await callTool("whoami"));
  assert.equal(me.email, "svc-mcp@modop.local");
  assert.equal(me.role, "author");
});

test("C-90 : cycle complet — créer, étapes, publier, exporter, retour terrain", async () => {
  // Création via MCP → visible en base (passage par l'API loopback).
  const wf = toolJson(await callTool("create_workflow", {
    title: "Mode op MCP",
    reference: "MO-C90",
    description: "Créé via le serveur MCP",
    review_due: "2030-01-15",
  }));
  const id = wf.id as number;
  assert.ok(Number.isInteger(id), "id renvoyé par l'API");
  const row = db.prepare("SELECT title, reference, state FROM workflows WHERE id = ?").get(id) as
    | { title: string; reference: string; state: string }
    | undefined;
  assert.ok(row, "workflow persisté en base");
  assert.equal(row?.reference, "MO-C90");
  assert.equal(row?.state, "draft");

  // Recherche par référence exacte.
  const found = toolJson(await callTool("list_workflows", { reference: "mo-c90" }));
  assert.equal(Array.isArray(found) ? found.length : 0, 1, "recherche nocase par référence");

  // Étapes : création, mise à jour, réordonnancement.
  const s1 = toolJson(await callTool("create_step", { workflow_id: id, title: "Préparer" }));
  const s2 = toolJson(await callTool("create_step", { workflow_id: id, title: "Contrôler" }));
  const step1 = s1.id as number;
  const step2 = s2.id as number;
  await callTool("update_step", { step_id: step2, body: "Vérifier le serrage au couple." });
  await callTool("reorder_steps", { workflow_id: id, ordered_ids: [step2, step1] });
  const order = db
    .prepare("SELECT id FROM steps WHERE workflow_id = ? ORDER BY position")
    .all(id) as { id: number }[];
  assert.deepEqual(order.map((o) => o.id), [step2, step1], "réordonnancement persisté");

  // Publication + versions.
  const pub = toolJson(await callTool("publish_workflow", { id, changelog: "Version initiale via MCP" }));
  assert.equal(pub.number, 1, "numéro de version publiée");
  const published = db.prepare("SELECT state FROM workflows WHERE id = ?").get(id) as { state: string };
  assert.equal(published.state, "published");
  const versions = toolJson(await callTool("list_versions", { id })) as unknown[];
  assert.equal(versions.length, 1, "une version publiée");
  assert.equal((versions[0] as { number: number }).number, 1);

  // Export docx : ZIP valide (signature PK → "UEsDB" en base64).
  const docx = toolJson(await callTool("export_docx", { workflow_id: id }));
  const b64 = docx.content_base64 as string;
  assert.ok(b64.startsWith("UEsDB"), "signature ZIP/docx absente");
  assert.ok((docx.size as number) > 1000, "docx anormalement petit");
  assert.match(String(docx.filename), /\.docx$/);

  // Retour terrain : envoi, liste, résolution.
  await callTool("send_feedback", { workflow_id: id, step_id: step1, message: "Photo manquante sur l'étape" });
  const fbs = toolJson(await callTool("list_feedbacks", { workflow_id: id })) as unknown[];
  assert.equal(fbs.length, 1, "un retour terrain");
  const fb = fbs[0] as { id: number; resolved: number };
  await callTool("resolve_feedback", { workflow_id: id, feedback_id: fb.id });
  const fbs2 = toolJson(await callTool("list_feedbacks", { workflow_id: id })) as unknown[];
  assert.equal((fbs2[0] as { status: string }).status, "resolved", "retour marqué résolu");
  assert.equal((fbs2[0] as { resolved_by: string }).resolved_by, "svc-mcp@modop.local");
});

test("C-90 : upload photo via multipart (PNG 1x1, magic numbers)", async () => {
  const wf = toolJson(await callTool("create_workflow", { title: "Photos MCP", reference: "MO-C90P" }));
  const step = toolJson(await callTool("create_step", { workflow_id: wf.id as number, title: "Étape photo" }));
  const png1x1 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const photo = toolJson(
    await callTool("upload_photo", {
      step_id: step.id as number,
      filename: "test.png",
      content_base64: png1x1,
      alt: "Pixel de test",
    }),
  );
  assert.ok(Number.isInteger(photo.id as number), "photo créée");
  const del = await callTool("delete_photo", { photo_id: photo.id as number });
  assert.ok(!del.isError, "suppression photo OK");
});

test("C-90 : get_stats refusé pour le rôle author (403 → erreur outil)", async () => {
  const res = await callTool("get_stats");
  assert.equal(res.isError, true, "erreur attendue (403 author)");
  assert.match(res.content?.[0]?.text ?? "", /403/);
});

test("C-90 : list_users visible pour author", async () => {
  const users = toolJson(await callTool("list_users")) as unknown[];
  const emails = users.map((u) => (u as { email: string }).email);
  assert.ok(emails.includes("svc-mcp@modop.local"), "compte de service listé");
});

test("C-105 : get_workflow_markdown + export_corpus (V13 #6/#7)", async () => {
  const wf = toolJson(await callTool("create_workflow", { title: "Lecture IA", reference: "MO-C105" }));
  const id = wf.id as number;
  await callTool("create_step", { workflow_id: id, title: "Préparer" });
  await callTool("publish_workflow", { id, changelog: "V1 pour le corpus" });

  const md = (await callTool("get_workflow_markdown", { id })) as { content?: { text?: string }[] };
  const text = md.content?.[0]?.text ?? "";
  assert.ok(text.startsWith("---"), "markdown brut, front matter en tête");
  assert.ok(text.includes("reference: MO-C105"), "référence dans le front matter");
  assert.ok(text.includes("Étape 1"), "étape présente");
  assert.ok(!text.trim().startsWith("{"), "pas du JSON emballé");

  const corpus = toolJson(await callTool("export_corpus", {}));
  assert.ok(Number(corpus.size) > 100, "zip non vide");
  const zip = await JSZip.loadAsync(Buffer.from(corpus.content_base64 as string, "base64"));
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  assert.ok(manifest.count >= 1, "au moins un MO publié au corpus");
  const empty = toolJson(await callTool("export_corpus", { since: "2031-01-01T00:00:00" }));
  const zip2 = await JSZip.loadAsync(Buffer.from(empty.content_base64 as string, "base64"));
  const manifest2 = JSON.parse(await zip2.file("manifest.json").async("string"));
  assert.equal(manifest2.count, 0, "since futur = corpus vide (manifest seul)");
});

after(async () => {
  await client.close();
  await new Promise<void>((r) => server.close(() => r()));
});
