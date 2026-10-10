import crypto from "node:crypto";
import type Database from "better-sqlite3";

// Journal d'audit : qui a fait quoi, quand. Cible = objet concerné
// (workflow/étape/user), detail = information libre (ex. référence + version).
export function auditLog(
  db: Database.Database,
  actorEmail: string,
  action: string,
  target = "",
  detail = ""
): void {
  db.prepare(
    "INSERT INTO audit_log (actor_email, action, target, detail) VALUES (?, ?, ?, ?)"
  ).run(actorEmail, action, target, detail);
}

export function listAudit(
  db: Database.Database,
  limit = 200
): { id: number; actor_email: string; action: string; target: string; detail: string; at: string }[] {
  return db
    .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?")
    .all(limit) as { id: number; actor_email: string; action: string; target: string; detail: string; at: string }[];
}

// Nettoyage : purge au-delà de N jours (appelé au démarrage).
export function purgeAudit(db: Database.Database, days = 365): void {
  db.prepare("DELETE FROM audit_log WHERE at < datetime('now', ?)").run(`-${days} days`);
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
