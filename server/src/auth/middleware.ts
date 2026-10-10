import type { Request, Response, NextFunction } from "express";
import type Database from "better-sqlite3";
import { getUserByToken, requireRole, type SessionUser } from "./sessions.js";

export function attachAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.modop_session ?? null;
    const user = token ? getUserByToken(db, token) : null;
    (req as Request & { user?: SessionUser | null }).user = user;
    next();
  };
}

export function requireAuth(min: "reader" | "author" | "admin" = "reader") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: SessionUser | null }).user ?? null;
    if (!requireRole(user, "reader")) {
      res.status(401).json({ error: "unauthorized", message: "Connexion requise" });
      return;
    }
    if (!requireRole(user, min)) {
      res.status(403).json({ error: "forbidden", message: "Rôle insuffisant" });
      return;
    }
    next();
  };
}
