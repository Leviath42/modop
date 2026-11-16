import { Router } from "express";
import type Database from "better-sqlite3";
import { categoryPaths } from "../lib/category-path.js";
import { requireAuth } from "../auth/middleware.js";
import { getSettings } from "./settings.js";

export function listRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/", requireAuth("reader"), (req, res) => {
    const search = typeof req.query.search === "string" ? `%${req.query.search}%` : null;
    const category = typeof req.query.category === "string" && req.query.category ? req.query.category : null;
    const state = req.query.state === "draft" || req.query.state === "published" ? req.query.state : null;
    const family = typeof req.query.family === "string" && req.query.family ? req.query.family : null;
    // C-94 : enfants directs d'un document parent + rattachement arborescent exact.
    const parent = typeof req.query.parent === "string" && req.query.parent ? Number(req.query.parent) : null;
    const categoryId = typeof req.query.category_id === "string" && req.query.category_id ? Number(req.query.category_id) : null;
    // C-88 : filtre exact (insensible à la casse) sur la référence — sert à
    // la vérification d'unicité en direct depuis le formulaire de création.
    const reference = typeof req.query.reference === "string" ? req.query.reference.trim() : "";
    const review = req.query.review === "overdue" ? "overdue" : null;
    const clauses: string[] = [];
    const params: unknown[] = [];
    const textClauses: string[] = [];
    if (search) {
      textClauses.push("title LIKE ?", "reference LIKE ?", "id IN (SELECT workflow_id FROM steps WHERE title LIKE ? OR body LIKE ?)");
      params.push(search, search, search, search);
    }
    if (textClauses.length) clauses.push(`(${textClauses.join(" OR ")})`);
    if (category) { clauses.push("category = ?"); params.push(category); }
    if (family) { clauses.push("family = ?"); params.push(family); }
    if (parent !== null && Number.isInteger(parent)) { clauses.push("parent_id = ?"); params.push(parent); }
    if (categoryId !== null && Number.isInteger(categoryId)) { clauses.push("category_id = ?"); params.push(categoryId); }
    if (state) { clauses.push("state = ?"); params.push(state); }
    if (reference) { clauses.push("reference = ? COLLATE NOCASE"); params.push(reference); }
    if (review === "overdue") {
      // C-72 (#4) : « sans date de revue = à revoir » est paramétrable.
      const overdueAll = getSettings(db).no_review_date_is_overdue;
      clauses.push(overdueAll ? "(review_due IS NULL OR review_due < date('now'))" : "review_due IS NOT NULL AND review_due < date('now')");
    }
    const SORTS: Record<string, string> = {
      title: "title COLLATE NOCASE ASC",
      reference: "reference ASC",
      family: "family COLLATE NOCASE ASC",
      updated_at: "updated_at DESC",
    };
    const sortCol = typeof req.query.sort === "string" ? SORTS[req.query.sort] : undefined;
    const orderBy = sortCol ?? "updated_at DESC";
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db
      .prepare(`SELECT id, title, reference, category, family, state, current_version, review_due, owner_email, category_id, parent_id, updated_at FROM workflows ${where} ORDER BY ${orderBy}`)
      .all(...params) as { category_id: number | null }[];
    // C-98 (V13 #1) : chemin arborescent de la catégorie, résolu à la volée
    // (une seule requête catégories, résolution en mémoire).
    const paths = categoryPaths(db);
    res.json(rows.map((w) => ({ ...w, category_path: paths.get(w.category_id ?? 0) ?? "" })));
  });

  return r;
}
