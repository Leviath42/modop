import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { categoryPaths } from "../lib/category-path.js";

export interface CategoryRow {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  position: number;
}

// C-94 : slug stable — minuscules, sans accent, mots joints par des tirets.
// Le slug est IMMUABLE (les chemins arborescents ne bougent pas quand un
// titre change — spec-api-ia.md §1) ; le titre, lui, est libre.
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "categorie";
}

// C-94 : l'arbre est paramétrable (1 à X niveaux) mais borné — une branche
// de 100 niveaux n'a aucun sens documentaire et casserait l'UI.
const MAX_DEPTH = 20;

function depthOf(db: Database.Database, parentId: number | null): number {
  let depth = 0;
  let cur = parentId;
  while (cur !== null && depth <= MAX_DEPTH) {
    const row = db.prepare("SELECT parent_id FROM categories WHERE id = ?").get(cur) as
      | { parent_id: number | null }
      | undefined;
    if (!row) return depth; // robustesse (FK RESTRICT l'empêche de toute façon)
    cur = row.parent_id;
    depth++;
  }
  return depth;
}

// Un descendant ne peut pas devenir l'ancêtre de sa propre branche.
function isDescendant(db: Database.Database, candidateId: number, ofId: number): boolean {
  let cur: number | null = candidateId;
  let hops = 0;
  while (cur !== null && hops++ <= MAX_DEPTH) {
    if (cur === ofId) return true;
    const row = db.prepare("SELECT parent_id FROM categories WHERE id = ?").get(cur) as
      | { parent_id: number | null }
      | undefined;
    cur = row?.parent_id ?? null;
  }
  return false;
}

// C-94 — arborescence documentaire paramétrable : l'admin construit l'arbre
// (1 à X niveaux, titres libres), les documents s'y rattachent.
export function categoryRouter(db: Database.Database): Router {
  const r = Router();

  // Arbre complet à plat (reader+) — le front reconstruit la hiérarchie
  // depuis parent_id ; les briques V13 (export corpus, API publique)
  // s'appuieront sur la même forme.
  r.get("/", requireAuth("reader"), (_req, res) => {
    const rows = db
      .prepare("SELECT id, parent_id, name, slug, position FROM categories ORDER BY position, name")
      .all() as CategoryRow[];
    // C-98 (V13 #1) : chemin complet (slugs depuis la racine) par catégorie,
    // calculé à la volée — jamais stocké, donc jamais désynchronisé.
    const paths = categoryPaths(db);
    res.json(rows.map((c) => ({ ...c, path: paths.get(c.id) ?? "" })));
  });

  r.post("/", requireAuth("admin"), (req, res) => {
    const { name, parent_id } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) {
      res.status(422).json({ error: "validation", message: "name requis" });
      return;
    }
    let parentId: number | null = null;
    if (parent_id !== undefined && parent_id !== null) {
      const parent = db.prepare("SELECT id FROM categories WHERE id = ?").get(Number(parent_id)) as
        | { id: number }
        | undefined;
      if (!parent) {
        res.status(422).json({ error: "validation", message: "catégorie parente introuvable" });
        return;
      }
      parentId = parent.id;
    }
    if (depthOf(db, parentId) >= MAX_DEPTH) {
      res.status(422).json({ error: "validation", message: `trop de niveaux (${MAX_DEPTH} maximum)` });
      return;
    }
    const slug = slugify(name.trim());
    const dup = db
      .prepare("SELECT 1 FROM categories WHERE COALESCE(parent_id, 0) = COALESCE(?, 0) AND slug = ?")
      .get(parentId, slug);
    if (dup) {
      res.status(422).json({ error: "validation", message: "une catégorie de ce nom existe déjà à ce niveau" });
      return;
    }
    const max = db
      .prepare("SELECT COALESCE(MAX(position), -1) p FROM categories WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)")
      .get(parentId) as { p: number };
    const info = db
      .prepare("INSERT INTO categories (parent_id, name, slug, position) VALUES (?, ?, ?, ?)")
      .run(parentId, name.trim(), slug, max.p + 1);
    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "create_category", `category:${info.lastInsertRowid}`, name.trim());
    res
      .status(201)
      .json(db.prepare("SELECT id, parent_id, name, slug, position FROM categories WHERE id = ?").get(info.lastInsertRowid));
  });

  r.put("/:id", requireAuth("admin"), (req, res) => {
    const cat = db
      .prepare("SELECT id, parent_id, name, slug, position FROM categories WHERE id = ?")
      .get(Number(req.params.id)) as CategoryRow | undefined;
    if (!cat) {
      res.status(404).json({ error: "not_found", message: "catégorie introuvable" });
      return;
    }
    const { name, parent_id, position } = req.body ?? {};
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      res.status(422).json({ error: "validation", message: "name invalide" });
      return;
    }
    let newParent: number | null | undefined = undefined; // undefined = inchangé
    if (parent_id !== undefined) {
      if (parent_id === null) {
        newParent = null;
      } else {
        const parent = db.prepare("SELECT id FROM categories WHERE id = ?").get(Number(parent_id)) as
          | { id: number }
          | undefined;
        if (!parent) {
          res.status(422).json({ error: "validation", message: "catégorie parente introuvable" });
          return;
        }
        if (parent.id === cat.id || isDescendant(db, parent.id, cat.id)) {
          res.status(422).json({ error: "validation", message: "déplacement interdit : la catégorie deviendrait sa propre descendante" });
          return;
        }
        if (depthOf(db, parent.id) >= MAX_DEPTH) {
          res.status(422).json({ error: "validation", message: `trop de niveaux (${MAX_DEPTH} maximum)` });
          return;
        }
        newParent = parent.id;
      }
    }
    // Le slug ne change pas au renommage : les chemins arborescents restent
    // stables (spec-api-ia.md §1) ; le titre est libre.
    // Sémantique explicite pour le parent : null = racine, absent = inchangé
    // (COALESCE ne distingue pas les deux — C-94).
    if (newParent !== undefined) {
      db.prepare("UPDATE categories SET parent_id = ? WHERE id = ?").run(newParent, cat.id);
    }
    db.prepare(
      `UPDATE categories SET
         name = COALESCE(?, name),
         position = COALESCE(?, position)
       WHERE id = ?`
    ).run(
      name !== undefined ? name.trim() : null,
      typeof position === "number" ? position : null,
      cat.id
    );
    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "update_category", `category:${cat.id}`, name ?? "");
    res.json(db.prepare("SELECT id, parent_id, name, slug, position FROM categories WHERE id = ?").get(cat.id));
  });

  r.delete("/:id", requireAuth("admin"), (req, res) => {
    const cat = db.prepare("SELECT id FROM categories WHERE id = ?").get(Number(req.params.id)) as
      | { id: number }
      | undefined;
    if (!cat) {
      res.status(404).json({ error: "not_found", message: "catégorie introuvable" });
      return;
    }
    const childCount = (db.prepare("SELECT COUNT(*) c FROM categories WHERE parent_id = ?").get(cat.id) as { c: number }).c;
    if (childCount > 0) {
      res.status(422).json({ error: "validation", message: "supprimez ou déplacez d'abord les sous-catégories" });
      return;
    }
    const attached = (db.prepare("SELECT COUNT(*) c FROM workflows WHERE category_id = ?").get(cat.id) as { c: number }).c;
    if (attached > 0) {
      res.status(422).json({ error: "validation", message: "des documents sont rattachés à cette catégorie — détachez-les d'abord" });
      return;
    }
    db.prepare("DELETE FROM categories WHERE id = ?").run(cat.id);
    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "delete_category", `category:${cat.id}`, "");
    res.json({ ok: true });
  });

  return r;
}
