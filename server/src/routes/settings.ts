import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";

// Paramètres applicatifs (C-72 #4/#5) — stockés en table key/value, édités
// depuis la page Paramètres (admin) et lus par le listing (filtre « à
// revoir ») et l'accueil (visibilité des brouillons pour les lecteurs).

export interface AppSettings {
  readers_see_drafts: boolean;
  no_review_date_is_overdue: boolean;
  // C-74 : épaisseur de trait par défaut des formes (1-10).
  default_stroke_width: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  readers_see_drafts: false,
  no_review_date_is_overdue: true,
  default_stroke_width: 5,
};

export function getSettings(db: Database.Database): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rawWidth = Number(map.get("default_stroke_width"));
  return {
    readers_see_drafts: map.get("readers_see_drafts") === "1",
    no_review_date_is_overdue:
      map.get("no_review_date_is_overdue") === undefined
        ? DEFAULT_SETTINGS.no_review_date_is_overdue
        : map.get("no_review_date_is_overdue") === "1",
    default_stroke_width:
      Number.isFinite(rawWidth) && rawWidth >= 1 && rawWidth <= 10 ? rawWidth : DEFAULT_SETTINGS.default_stroke_width,
  };
}

export function settingsRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/", requireAuth("reader"), (_req, res) => {
    res.json(getSettings(db));
  });

  r.put("/", requireAuth("admin"), (req, res) => {
    const body = req.body ?? {};
    if (typeof body.default_stroke_width === "number" && body.default_stroke_width >= 1 && body.default_stroke_width <= 10) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run("default_stroke_width", String(Math.round(body.default_stroke_width)));
    }
    for (const key of ["readers_see_drafts", "no_review_date_is_overdue"] as const) {
      if (typeof body[key] === "boolean") {
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(key, body[key] ? "1" : "0");
      }
    }
    res.json(getSettings(db));
  });

  return r;
}
