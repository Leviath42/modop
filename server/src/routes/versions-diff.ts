// V16 (V7 #2) : endpoint de diff entre deux versions publiées d'un MO.
import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { compareSnapshots, type Snapshot } from "../lib/version-diff.js";

export function versionsDiffRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/:id/versions/:va/diff/:vb", requireAuth("reader"), (req, res) => {
    const id = Number(req.params.id);
    const va = Number(req.params.va);
    const vb = Number(req.params.vb);
    if (!Number.isInteger(va) || !Number.isInteger(vb) || va < 1 || vb < 1) {
      res.status(422).json({ error: "validation", message: "numéros de version invalides" });
      return;
    }
    if (va === vb) {
      res.status(400).json({ error: "same_version", message: "comparaison d'une version avec elle-même refusée" });
      return;
    }
    const load = (n: number) =>
      db.prepare("SELECT snapshot FROM versions WHERE workflow_id = ? AND number = ?").get(id, n) as { snapshot: string } | undefined;
    const a = load(va);
    const b = load(vb);
    if (!a || !b) {
      res.status(404).json({ error: "not_found", message: "version introuvable" });
      return;
    }
    res.json({
      workflow_id: id,
      va,
      vb,
      diff: compareSnapshots(JSON.parse(a.snapshot) as Snapshot, JSON.parse(b.snapshot) as Snapshot),
    });
  });

  return r;
}
