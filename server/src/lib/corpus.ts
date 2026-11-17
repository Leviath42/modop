// C-104 (V13 #7) : corpus d'indexation — zip Markdown + JSON canonique des
// MO publies (modifies depuis ?since= en option) + manifest avec checksums
// sha256 : re-embedding incremental sans tout recalculer. Spec docs/spec-api-ia.md §5.
// Aucune base vectorielle dans modop v1 : le corpus alimente un moteur externe.
import { Router } from "express";
import type Database from "better-sqlite3";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { buildExportMeta, renderMarkdown, type PayloadSnap } from "./export-payload.js";

interface VersionRow { snapshot: string; changelog: string; author_email: string; published_at: string; number: number }
interface WfRow { id: number; title: string; reference: string; current_version: number }

const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");

export async function buildCorpus(
  db: Database.Database,
  since?: string,
): Promise<{ buffer: Buffer; manifest: Record<string, unknown> }> {
  // published_at SQLite = "AAAA-MM-JJ HH:MM:SS" ; un since ISO avec "T" est
  // normalise pour que la comparaison lexicographique reste temporelle.
  const sinceNorm = since ? since.replace("T", " ") : undefined;
  const rows: { id: number; number: number }[] = sinceNorm
    ? (db
        .prepare("SELECT v.workflow_id AS id, MAX(v.number) AS number FROM versions v WHERE v.published_at >= ? GROUP BY v.workflow_id")
        .all(sinceNorm) as { id: number; number: number }[])
    : (db.prepare("SELECT id, current_version AS number FROM workflows WHERE current_version >= 1").all() as { id: number; number: number }[]);
  const zip = new JSZip();
  const items: Record<string, unknown>[] = [];
  for (const row of rows) {
    const wf = db.prepare("SELECT id, title, reference, current_version FROM workflows WHERE id = ?").get(row.id) as WfRow | undefined;
    if (!wf) continue;
    const version = db
      .prepare("SELECT snapshot, changelog, author_email, published_at, number FROM versions WHERE workflow_id = ? AND number = ?")
      .get(row.id, row.number) as VersionRow | undefined;
    if (!version) continue;
    const snap = JSON.parse(version.snapshot) as PayloadSnap;
    const meta = buildExportMeta(db, wf, version, snap);
    const md = renderMarkdown(meta, snap);
    const json = JSON.stringify({ meta, snapshot: snap }, null, 2);
    const base = meta.reference + "-V" + meta.version;
    zip.file(base + ".md", md);
    zip.file(base + ".json", json);
    items.push({
      id: wf.id,
      reference: meta.reference,
      title: meta.title,
      version: meta.version,
      published_at: meta.published_at,
      category_path: meta.category_path,
      checksums: { md: sha256(md), json: sha256(json) },
    });
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    since: since ?? null,
    count: items.length,
    items,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, manifest };
}

export function corpusRouter(db: Database.Database): Router {
  const r = Router();
  // reader+ : le corpus n'agrege que des MO publies, deja exportables en
  // md/json par tout lecteur (la spec proposait admin ; choix journalise).
  r.get("/corpus", requireAuth("reader"), async (req, res) => {
    const since = typeof req.query.since === "string" && req.query.since.trim() !== "" ? req.query.since.trim() : undefined;
    try {
      const { buffer } = await buildCorpus(db, since);
      auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "export_corpus", "corpus", since ?? "all");
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("content-type", "application/zip");
      res.setHeader("content-disposition", 'attachment; filename="modop-corpus-' + stamp + (since ? "-since" : "") + '.zip"');
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "internal", message: "corpus indisponible" });
    }
  });
  return r;
}
