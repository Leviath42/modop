import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";

export function statsRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAuth("admin"));

  r.get("/", (_req, res) => {
    const workflows = (db.prepare("SELECT COUNT(*) c FROM workflows").get() as { c: number }).c;
    const published = (db.prepare("SELECT COUNT(*) c FROM workflows WHERE state = 'published'").get() as { c: number }).c;
    const users = (db.prepare("SELECT COUNT(*) c FROM users WHERE active = 1").get() as { c: number }).c;
    const exports = (db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'export_docx'").get() as { c: number }).c;
    const logins = (db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action IN ('login', 'login_sso')").get() as { c: number }).c;

    // MO les plus exportés / publiés (proxy d'usage : audit)
    // U-B2 : jointure pour afficher titre + référence lisibles (l'id seul
    // n'a aucun sens pour un humain).
    const topExported = db
      .prepare(
        `SELECT a.target, COUNT(*) n,
                (SELECT w.title || ' (' || w.reference || ')'
                 FROM workflows w
                 WHERE w.id = CAST(REPLACE(a.target, 'workflow:', '') AS INTEGER)) AS label
         FROM audit_log a WHERE a.action = 'export_docx' GROUP BY a.target ORDER BY n DESC LIMIT 5`
      )
      .all() as { target: string; n: number; label: string | null }[];
    const topPublishers = db
      .prepare(
        `SELECT actor_email, COUNT(*) n FROM audit_log WHERE action = 'publish' GROUP BY actor_email ORDER BY n DESC LIMIT 5`
      )
      .all() as { actor_email: string; n: number }[];
    const views = (db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'view_workflow'").get() as { c: number }).c;
    const topViewed = db
      .prepare(
        `SELECT a.target, COUNT(*) n,
                (SELECT w.title || ' (' || w.reference || ')'
                 FROM workflows w
                 WHERE w.id = CAST(REPLACE(a.target, 'workflow:', '') AS INTEGER)) AS label
         FROM audit_log a WHERE a.action = 'view_workflow' GROUP BY a.target ORDER BY n DESC LIMIT 5`
      )
      .all() as { target: string; n: number; label: string | null }[];
    const recentActivity = db
      .prepare(
        `SELECT a.actor_email, a.action, a.target, a.at,
                (SELECT w.title || ' (' || w.reference || ')'
                 FROM workflows w
                 WHERE a.target LIKE 'workflow:%'
                   AND w.id = CAST(REPLACE(a.target, 'workflow:', '') AS INTEGER)) AS label
         FROM audit_log a ORDER BY a.id DESC LIMIT 15`
      )
      .all();

    res.json({
      workflows,
      published,
      users,
      exports,
      logins,
      views,
      topViewed,
      topExported,
      topPublishers,
      recentActivity,
    });
  });

  return r;
}
