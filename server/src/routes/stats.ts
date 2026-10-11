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
    const topExported = db
      .prepare(
        `SELECT target, COUNT(*) n FROM audit_log WHERE action = 'export_docx' GROUP BY target ORDER BY n DESC LIMIT 5`
      )
      .all() as { target: string; n: number }[];
    const topPublishers = db
      .prepare(
        `SELECT actor_email, COUNT(*) n FROM audit_log WHERE action = 'publish' GROUP BY actor_email ORDER BY n DESC LIMIT 5`
      )
      .all() as { actor_email: string; n: number }[];
    const recentActivity = db
      .prepare(
        `SELECT actor_email, action, target, at FROM audit_log ORDER BY id DESC LIMIT 15`
      )
      .all();

    res.json({
      workflows,
      published,
      users,
      exports,
      logins,
      topExported,
      topPublishers,
      recentActivity,
    });
  });

  return r;
}
