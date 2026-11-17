// C-104 (V13 #7) : le calcul d'export (metadonnees GED + Markdown) vit ici,
// partage par la route /api/workflows/:id/export et le corpus d'indexation —
// un seul generateur, checksums comparables entre exports et corpus (DRY).
// Le contenu (front matter, ancres, descriptions) est le rendu C-98 inchange.
import type Database from "better-sqlite3";
import { categoryPaths } from "./category-path.js";

export interface PayloadPhoto {
  filename: string;
  alt: string;
  image_description?: string;
  annotations?: unknown[];
  display_x?: number | null;
  display_y?: number | null;
  display_w?: number | null;
  display_size?: string | number | null;
}
export interface PayloadStep {
  position: number;
  title: string;
  body: string;
  photos?: PayloadPhoto[];
  pictos?: (string | { label: string; color?: string })[];
  canvas?: unknown[];
}
export interface PayloadSnap {
  workflow: {
    title: string;
    reference: string;
    description: string;
    category: string;
    family?: string;
    review_due?: string | null;
    owner_email?: string;
    category_id?: number | null;
  };
  steps: PayloadStep[];
}
export interface ExportMeta {
  reference: string;
  title: string;
  version: number;
  published_at: string;
  author: string;
  changelog: string;
  type: string;
  category_path: string;
  family: string;
  description: string;
  review_due: string | null;
  owner_email: string;
  owner_name: string;
  anchors: { position: number; title: string; anchor: string }[];
}

export function buildExportMeta(
  db: Database.Database,
  wf: { id: number; title: string; reference: string },
  version: { number: number; published_at: string; author_email: string; changelog: string },
  snap: PayloadSnap,
): ExportMeta {
  const ownerEmail = snap.workflow.owner_email ?? "";
  const ownerRow = ownerEmail
    ? (db.prepare("SELECT first_name, last_name FROM users WHERE email = ?").get(ownerEmail) as
      | { first_name: string; last_name: string }
      | undefined)
    : undefined;
  const ownerLabel = ownerRow
    ? [ownerRow.first_name, ownerRow.last_name].filter(Boolean).join(" ") || ownerEmail
    : ownerEmail;
  const categoryPath = categoryPaths(db).get((snap.workflow as { category_id?: number | null }).category_id ?? 0) ?? "";
  const stepAnchor = (pos: number) => snap.workflow.reference + "/etapes/" + (pos + 1);
  return {
    reference: snap.workflow.reference,
    title: snap.workflow.title,
    version: version.number,
    published_at: version.published_at,
    author: version.author_email,
    changelog: version.changelog ?? "",
    type: snap.workflow.category,
    category_path: categoryPath,
    family: snap.workflow.family ?? "",
    description: snap.workflow.description,
    review_due: snap.workflow.review_due ?? null,
    owner_email: ownerEmail,
    owner_name: ownerLabel,
    anchors: snap.steps.map((s) => ({ position: s.position + 1, title: s.title, anchor: stepAnchor(s.position) })),
  };
}

export function renderMarkdown(meta: ExportMeta, snap: PayloadSnap): string {
  const fm = (v: string | null | undefined) => (v ?? "").replace(/\r?\n/g, " ").trim();
  const stepAnchor = (pos: number) => snap.workflow.reference + "/etapes/" + (pos + 1);
  const md: string[] = [
    "---",
    "reference: " + meta.reference,
    "titre: " + fm(meta.title),
    "version: " + meta.version,
    "chemin: " + (meta.category_path || "(racine)"),
    "famille: " + fm(meta.family),
    "type: " + fm(meta.type),
    "description: " + fm(meta.description),
    "responsable: " + fm(meta.owner_name),
    "a_revoir_le: " + fm(meta.review_due),
    "publiee_le: " + meta.published_at,
    "auteur: " + meta.author,
    "---",
    "",
    "# " + snap.workflow.title,
    "",
  ];
  if (meta.changelog) md.push("> **Modifications de cette version :** " + fm(meta.changelog), "");
  if (snap.workflow.description) md.push(fm(snap.workflow.description), "");
  for (const step of snap.steps) {
    md.push("## Étape " + (step.position + 1) + " — " + step.title, "", "> Ancre : " + stepAnchor(step.position), "");
    if (step.body) md.push(step.body, "");
    const pictos = step.pictos ?? [];
    if (pictos.length) {
      for (const p of pictos) md.push("- ⚠ " + (typeof p === "string" ? p : p.label));
      md.push("");
    }
    for (const ph of step.photos ?? []) {
      md.push("![" + (ph.alt || ph.filename) + "](/photos/" + ph.filename + ")");
      const ai = (ph.image_description ?? "").trim();
      if (ai) md.push("", "*Description : " + ai + "*");
      md.push("");
    }
    const shapes = step.canvas ?? [];
    if (shapes.length) md.push("_(canevas : " + shapes.length + " forme(s), non représentables en Markdown — voir le docx)_", "");
  }
  return md.join("\n");
}
