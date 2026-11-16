import type Database from "better-sqlite3";

export interface CategoryPathRow {
  id: number;
  parent_id: number | null;
  slug: string;
  name: string;
}

// C-98 (V13 #1) : chemin arborescent d'une catégorie — slugs joints par
// « / », p.ex. « mecanique/montage/pose-fusibles ». CALCUL À LA VOLÉE depuis
// la map complète des catégories, JAMAIS stocké en base : les slugs sont
// immuables (C-94), donc le chemin se recalcule automatiquement après tout
// déplacement, sans risque de désynchronisation.
const MAX_DEPTH = 20;

export function resolveCategoryPath(byId: Map<number, CategoryPathRow>, id: number | null | undefined): string {
  if (id == null) return "";
  const parts: string[] = [];
  let cur = byId.get(id);
  let depth = 0;
  while (cur && depth < MAX_DEPTH) {
    parts.unshift(cur.slug);
    if (cur.parent_id == null) break;
    cur = byId.get(cur.parent_id);
    depth += 1;
  }
  return parts.join("/");
}

/** Charge toutes les catégories en une requête et résout chaque chemin en mémoire. */
export function categoryPaths(db: Database.Database): Map<number, string> {
  const rows = db.prepare("SELECT id, parent_id, slug, name FROM categories").all() as CategoryPathRow[];
  const byId = new Map(rows.map((c) => [c.id, c] as const));
  const out = new Map<number, string>();
  for (const c of rows) out.set(c.id, resolveCategoryPath(byId, c.id));
  return out;
}
