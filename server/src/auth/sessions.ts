import crypto from "node:crypto";
import type Database from "better-sqlite3";

export interface SessionUser {
  id: number;
  email: string;
  role: "reader" | "author" | "admin";
}

export function createSession(db: Database.Database, userId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId);
  return token;
}

export function destroySession(db: Database.Database, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserByToken(db: Database.Database, token: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token) as SessionUser | undefined;
  return row ?? null;
}

export function requireRole(user: SessionUser | null, min: "reader" | "author" | "admin" = "reader"): boolean {
  if (!user) return false;
  const levels = { reader: 0, author: 1, admin: 2 } as const;
  return levels[user.role] >= levels[min];
}
