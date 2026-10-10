import { Router } from "express";
import bcrypt from "bcryptjs";
import type Database from "better-sqlite3";
import { createSession, destroySession } from "../auth/sessions.js";
import { requireAuth } from "../auth/middleware.js";

const COOKIE = "modop_session";

export function authRouter(db: Database.Database): Router {
  const r = Router();

  r.post("/login", (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      res.status(422).json({ error: "validation", message: "email et password requis" });
      return;
    }
    const user = db
      .prepare("SELECT id, email, role, password_hash FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()) as
      | { id: number; email: string; role: string; password_hash: string }
      | undefined;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: "unauthorized", message: "Identifiants invalides" });
      return;
    }
    const token = createSession(db, user.id);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax" });
    res.json({ id: user.id, email: user.email, role: user.role });
  });

  r.post("/logout", (req, res) => {
    const token = req.cookies?.[COOKIE];
    if (token) destroySession(db, token);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  r.get("/me", requireAuth("reader"), (req, res) => {
    res.json((req as { user?: unknown }).user);
  });

  r.post("/change-password", requireAuth("reader"), (req, res) => {
    const { oldPassword, newPassword } = req.body ?? {};
    const user = (req as { user?: { id: number } }).user!;
    if (typeof oldPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(422).json({ error: "validation", message: "Nouveau mot de passe : 8 caractères minimum" });
      return;
    }
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
    if (!bcrypt.compareSync(oldPassword, row.password_hash)) {
      res.status(401).json({ error: "unauthorized", message: "Ancien mot de passe invalide" });
      return;
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), user.id);
    res.json({ ok: true });
  });

  return r;
}
