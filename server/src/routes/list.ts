import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";

export function listRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/", requireAuth("reader"), (req, res) => {
    const search = typeof req.query.search === "string" ? `%${req.query.search}%` : null;
    const category = typeof req.query.category === "string" && req.query.category ? req.query.category : null;
    const state = req.query.state === "draft" || req.query.state === "published" ? req.query.state : null;
    const family = typeof req.query.family === "string" && req.query.family ? req.query.family : null;
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
    if (state) { clauses.push("state = ?"); params.push(state); }
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
      .prepare(`SELECT id, title, reference, category, family, state, current_version, updated_at FROM workflows ${where} ORDER BY ${orderBy}`)
      .all(...params);
    res.json(rows);
  });

  return r;
}
