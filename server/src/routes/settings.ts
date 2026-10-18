import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";

// Paramètres applicatifs (C-72 #4/#5) — stockés en table key/value, édités
// depuis la page Paramètres (admin) et lus par le listing (filtre « à
// revoir ») et l'accueil (visibilité des brouillons pour les lecteurs).

export interface AppSettings {
  readers_see_drafts: boolean;
  no_review_date_is_overdue: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  readers_see_drafts: false,
  no_review_date_is_overdue: true,
};

export function getSettings(db: Database.Database): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    readers_see_drafts: map.get("readers_see_drafts") === "1",
    no_review_date_is_overdue:
      map.get("no_review_date_is_overdue") === undefined
        ? DEFAULT_SETTINGS.no_review_date_is_overdue
        : map.get("no_review_date_is_overdue") === "1",
  };
}

export function settingsRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/", requireAuth("reader"), (_req, res) => {
    res.json(getSettings(db));
  });

  r.put("/", requireAuth("admin"), (req, res) => {
    const body = req.body ?? {};
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
