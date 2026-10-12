import type Database from "better-sqlite3";
import { randomToken } from "./audit.js";

export interface SessionUser {
  id: number;
  email: string;
  role: "reader" | "author" | "admin";
  first_name?: string;
  last_name?: string;
}

const SESSION_TTL_HOURS = Number(process.env.MODOP_SESSION_TTL_HOURS ?? 24);

export function createSession(db: Database.Database, userId: number): string {
  const token = randomToken();
  db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+' || ? || ' hours'))`
  ).run(token, userId, SESSION_TTL_HOURS);
  return token;
}

export function destroySession(db: Database.Database, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserByToken(db: Database.Database, token: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token) as SessionUser | undefined;
  return row ?? null;
}

export function purgeExpiredSessions(db: Database.Database): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

export function requireRole(user: SessionUser | null, min: "reader" | "author" | "admin" = "reader"): boolean {
  if (!user) return false;
  const levels = { reader: 0, author: 1, admin: 2 } as const;
  return levels[user.role] >= levels[min];
}
