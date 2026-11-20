import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";

// Paramètres applicatifs (C-72 #4/#5) — stockés en table key/value, édités
// depuis la page Paramètres (admin) et lus par le listing (filtre « à
// revoir ») et l'accueil (visibilité des brouillons pour les lecteurs).

export interface AppSettings {
  readers_see_drafts: boolean;
  no_review_date_is_overdue: boolean;
  // C-74 : épaisseur de trait par défaut des formes (1-10).
  default_stroke_width: number;
  // C-86 : délai de revue par défaut en jours — préremplit la date « À
  // revoir le » d'un MO qui n'en a pas (30 jours par défaut).
  default_review_days: number;
  // V17 (B2) : verrou de validation — exiger un statut éditorial
  // « validated » avant publication. Désactivé par défaut (usage solo).
  require_validated: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  readers_see_drafts: false,
  no_review_date_is_overdue: true,
  default_stroke_width: 5,
  default_review_days: 30,
  require_validated: false,
};

// C-97 (V12 #8) : indications métiers paramétrables — liste des encarts
// proposés par le flyout « Indications » de l'éditeur, et source de la
// résolution serveur kind → {kind,label,color} (API steps + MCP). Stockée en
// settings (clé « indications », JSON), seed = les 7 indications historiques.
// Les étapes restent auto-porteuses : renommer ou retirer une indication ne
// rétro-modifie PAS les MO existants (les pictos posés gardent leur libellé).
export interface IndicationDef {
  kind: string;
  label: string;
  color: string;
}

export const DEFAULT_INDICATIONS: IndicationDef[] = [
  { kind: "attention", label: "Attention", color: "#f5a623" },
  { kind: "danger", label: "Danger", color: "#d0021b" },
  { kind: "epi", label: "EPI obligatoire", color: "#1f4e9c" },
  { kind: "electrique", label: "Risque électrique", color: "#7b16c9" },
  { kind: "point-chaud", label: "Point chaud", color: "#d0021b" },
  { kind: "outil", label: "Outillage spécifique", color: "#108c5e" },
  { kind: "info", label: "Information", color: "#5b7285" },
];

const KIND_RE = /^[a-z0-9-]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validIndication(v: unknown): v is IndicationDef {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.kind === "string" && KIND_RE.test(o.kind) &&
    typeof o.label === "string" && o.label.trim().length >= 1 && o.label.trim().length <= 40 &&
    typeof o.color === "string" && COLOR_RE.test(o.color)
  );
}

export function getIndications(db: Database.Database): IndicationDef[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'indications'").get() as { value: string } | undefined;
  if (row) {
    try {
      const list = JSON.parse(row.value) as unknown;
      if (Array.isArray(list) && list.length >= 1 && list.length <= 30 && list.every(validIndication)) {
        return list.map((i) => ({ kind: i.kind, label: i.label.trim(), color: i.color.toLowerCase() }));
      }
    } catch { /* JSON invalide → défauts */ }
  }
  return DEFAULT_INDICATIONS;
}

export function getSettings(db: Database.Database): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rawWidth = Number(map.get("default_stroke_width"));
  const rawDays = Number(map.get("default_review_days"));
  return {
    readers_see_drafts: map.get("readers_see_drafts") === "1",
    no_review_date_is_overdue:
      map.get("no_review_date_is_overdue") === undefined
        ? DEFAULT_SETTINGS.no_review_date_is_overdue
        : map.get("no_review_date_is_overdue") === "1",
    default_stroke_width:
      Number.isFinite(rawWidth) && rawWidth >= 1 && rawWidth <= 10 ? rawWidth : DEFAULT_SETTINGS.default_stroke_width,
    default_review_days:
      Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 3650 ? Math.round(rawDays) : DEFAULT_SETTINGS.default_review_days,
    require_validated: map.get("require_validated") === "1",
  };
}

export function settingsRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/", requireAuth("reader"), (_req, res) => {
    res.json(getSettings(db));
  });

  r.put("/", requireAuth("admin"), (req, res) => {
    const body = req.body ?? {};
    // C-121 (V17.1) : snapshot avant écriture, pour n'auditer que les clés réellement changées.
    const before = getSettings(db);
    if (typeof body.default_stroke_width === "number" && body.default_stroke_width >= 1 && body.default_stroke_width <= 10) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run("default_stroke_width", String(Math.round(body.default_stroke_width)));
    }
    // C-86 : délai de revue par défaut (1 à 3650 jours, arrondi à l'entier).
    if (typeof body.default_review_days === "number" && body.default_review_days >= 1 && body.default_review_days <= 3650) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run("default_review_days", String(Math.round(body.default_review_days)));
    }
    for (const key of ["readers_see_drafts", "no_review_date_is_overdue", "require_validated"] as const) {
      if (typeof body[key] === "boolean") {
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(key, body[key] ? "1" : "0");
      }
    }
    // C-121 (V17.1) : audit des changements de paramètres — seules les clés
    // réellement modifiées sont consignées (ancienne → nouvelle valeur),
    // jamais le body brut. Cible de traçabilité "qui a actionné quoi".
    const after = getSettings(db);
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => String(after[k]) !== String(before[k]));
    if (changed.length > 0) {
      auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "update_settings", "settings", changed.map((k) => k + " " + before[k] + "→" + after[k]).join(", "));
    }
    res.json(after);
  });

  // C-97 (V12 #8) : indications métiers — liste active (lecteur+ : le flyout de
  // l'éditeur et la résolution des pictos côté serveur en dépendent) et
  // édition complète côté admin (PUT remplace la liste).
  r.get("/indications", requireAuth("reader"), (_req, res) => {
    res.json(getIndications(db));
  });

  r.put("/indications", requireAuth("admin"), (req, res) => {
    const body = req.body;
    if (!Array.isArray(body) || body.length < 1 || body.length > 30 || !body.every(validIndication)) {
      res.status(422).json({ error: "validation", message: "indications invalides (1 à 30 items, kind slug, label 1-40, couleur #rrggbb)" });
      return;
    }
    const normalized = body.map((i) => ({ kind: i.kind, label: i.label.trim(), color: i.color.toLowerCase() }));
    if (new Set(normalized.map((i) => i.kind)).size !== normalized.length) {
      res.status(422).json({ error: "validation", message: "kind dupliqué — chaque indication doit avoir un identifiant unique" });
      return;
    }
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run("indications", JSON.stringify(normalized));
    auditLog(db, (req as { user?: { email: string } }).user?.email ?? "?", "update_indications", "settings:indications", `${normalized.length} indication(s)`);
    res.json(getIndications(db));
  });

  return r;
}
