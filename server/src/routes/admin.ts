import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog, listAudit } from "../auth/audit.js";

export interface UserRow {
  id: number;
  email: string;
  role: string;
  active: number;
  auth_provider: string;
  created_at: string;
}

export function adminRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAuth("admin"));

  r.get("/users", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, email, role, active, auth_provider, created_at FROM users ORDER BY email`
      )
      .all() as UserRow[];
    res.json(rows);
  });

  r.post("/users", (req, res) => {
    const { email, password, role } = req.body ?? {};
    if (
      typeof email !== "string" ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 8 ||
      !["reader", "author", "admin"].includes(role)
    ) {
      res.status(422).json({
        error: "validation",
        message: "email valide, mot de passe (8+ caractères) et rôle requis",
      });
      return;
    }
    const normalized = email.toLowerCase().trim();
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(normalized)) {
      res.status(422).json({ error: "validation", message: "email déjà utilisé" });
      return;
    }
    const actor = (req as { user?: { id: number; email: string } }).user!;
    const info = db
      .prepare(
        "INSERT INTO users (email, password_hash, role, auth_provider) VALUES (?, ?, ?, 'local')"
      )
      .run(normalized, bcrypt.hashSync(password, 10), role);
    auditLog(db, actor.email, "create_user", `user:${normalized}`, `role=${role}`);
    res.status(201).json({ id: info.lastInsertRowid, email: normalized, role });
  });

  r.put("/users/:id", (req, res) => {
    const target = db
      .prepare("SELECT id, email, role FROM users WHERE id = ?")
      .get(Number(req.params.id)) as { id: number; email: string; role: string } | undefined;
    if (!target) {
      res.status(404).json({ error: "not_found", message: "utilisateur introuvable" });
      return;
    }
    const actor = (req as { user?: { id: number; email: string } }).user!;
    const { role, active } = req.body ?? {};

    if (role !== undefined && !["reader", "author", "admin"].includes(role)) {
      res.status(422).json({ error: "validation", message: "rôle invalide" });
      return;
    }
    // Protection : ne pas se rétrograder/désactiver soi-même (verrouillage total)
    if (target.id === actor.id && ((role !== undefined && role !== "admin") || active === 0)) {
      res.status(422).json({
        error: "validation",
        message: "impossible de modifier votre propre rôle ou statut d'admin",
      });
      return;
    }
    db.prepare("UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?").run(
      role ?? null,
      typeof active === "number" ? active : null,
      target.id
    );
    // Révocation immédiate des sessions si désactivation ou rétrogradation
    // (S-A1 : un admin rétrogradé ne doit pas garder ses droits 24 h)
    if (active === 0 || (role !== undefined && role !== target.role)) {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    }
    auditLog(
      db,
      actor.email,
      "update_user",
      `user:${target.email}`,
      `role=${role ?? "inchangé"} active=${active ?? "inchangé"}`
    );
    const updated = db
      .prepare("SELECT id, email, role, active, auth_provider, created_at FROM users WHERE id = ?")
      .get(target.id);
    res.json(updated);
  });

  // D-A3 : journal d'audit complet, admin uniquement (200 dernières lignes).
  r.get("/audit", (_req, res) => {
    res.json(listAudit(db, 200));
  });
  r.post("/users/:id/reset-password", (req, res) => {
    const target = db
      .prepare("SELECT id, email, auth_provider FROM users WHERE id = ?")
      .get(Number(req.params.id)) as { id: number; email: string; auth_provider: string } | undefined;
    if (!target) {
      res.status(404).json({ error: "not_found", message: "utilisateur introuvable" });
      return;
    }
    if (target.auth_provider === "oidc") {
      res.status(422).json({ error: "validation", message: "mot de passe géré par le SSO" });
      return;
    }
    const newPassword = crypto.randomBytes(9).toString("base64url");
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      bcrypt.hashSync(newPassword, 10),
      target.id
    );
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    const actor = (req as { user?: { id: number; email: string } }).user!;
    auditLog(db, actor.email, "reset_password", `user:${target.email}`);
    // Le mot de passe temporaire est affiché une seule fois à l'admin.
    res.json({ temporaryPassword: newPassword });
  });

  return r;
}
