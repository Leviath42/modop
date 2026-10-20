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
        `SELECT id, email, first_name, last_name, role, active, auth_provider, created_at FROM users ORDER BY email`
      )
      .all() as UserRow[];
    res.json(rows);
  });

  r.post("/users", (req, res) => {
    const { email, password, role, first_name, last_name } = req.body ?? {};
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
        "INSERT INTO users (email, password_hash, role, auth_provider, first_name, last_name) VALUES (?, ?, ?, 'local', ?, ?)"
      )
      .run(normalized, bcrypt.hashSync(password, 10), role, typeof first_name === "string" ? first_name.trim().slice(0, 60) : "", typeof last_name === "string" ? last_name.trim().slice(0, 60) : "");
    auditLog(db, actor.email, "create_user", `user:${normalized}`, `role=${role}`);
    res.status(201).json({ id: info.lastInsertRowid, email: normalized, first_name: typeof first_name === "string" ? first_name.trim() : "", last_name: typeof last_name === "string" ? last_name.trim() : "", role });
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
    const { role, active, first_name, last_name } = req.body ?? {};

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
    db.prepare("UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE id = ?").run(
      role ?? null,
      typeof active === "number" ? active : null,
      typeof first_name === "string" ? first_name.trim().slice(0, 60) : null,
      typeof last_name === "string" ? last_name.trim().slice(0, 60) : null,
      target.id
    );
    // Révocation immédiate des sessions si désactivation ou rétrogradation
    // (S-A1 : un admin rétrogradé ne doit pas garder ses droits 24 h)
    if (active === 0 || (role !== undefined && role !== target.role)) {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    }
    // C-45 : désactivation du compte -> ses MO n'ont plus de responsable
    // valide : les marquer À REVOIR (review_due = aujourd'hui) si non déjà marqués.
    if (active === 0) {
      const marked = db
        .prepare("UPDATE workflows SET review_due = date('now') WHERE owner_email = ? AND review_due IS NULL")
        .run(target.email);
      if (marked.changes > 0) {
        auditLog(db, actor.email, "flag_review_no_owner", `user:${target.email}`, `${marked.changes} MO sans responsable valide`);
      }
    }
    auditLog(
      db,
      actor.email,
      "update_user",
      `user:${target.email}`,
      `role=${role ?? "inchangé"} active=${active ?? "inchangé"}`
    );
    const updated = db
      .prepare("SELECT id, email, first_name, last_name, role, active, auth_provider, created_at FROM users WHERE id = ?")
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

// C-85 : candidats responsables — comptes ACTIFS, accessibles aux auteurs
// (author+) : le champ « Responsable » de l'éditeur fait une recherche par
// mot-clé sur Prénom/Nom/email. L'ancien appel vers /api/admin/users
// renvoyait 403 aux auteurs : aucune suggestion, et le champ se vidait.
export function activeUsersRouter(db: Database.Database): Router {
  const r = Router();
  r.get("/", requireAuth("author"), (_req, res) => {
    const rows = db
      .prepare("SELECT id, email, first_name, last_name, role FROM users WHERE active = 1 ORDER BY email")
      .all() as { id: number; email: string; first_name: string; last_name: string; role: string }[];
    res.json(rows);
  });
  return r;
}
