import { Router } from "express";
import bcrypt from "bcryptjs";
import type Database from "better-sqlite3";
import { createSession, destroySession } from "../auth/sessions.js";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { cookieSecure } from "../auth/security.js";
import { getOidcConfig, makeState, makePkce, verifyState, exchangeCode, fetchUserInfo, roleFromClaims, discover } from "../auth/oidc.js";

const COOKIE = "modop_session";

export function authRouter(db: Database.Database): Router {
  const r = Router();

  r.get("/oidc/status", (_req, res) => {
    const cfg = getOidcConfig();
    if (!cfg) {
      res.json({ enabled: false });
      return;
    }
    void discover(cfg.issuer)
      .then(() => res.json({ enabled: true }))
      .catch(() => res.json({ enabled: false, error: "issuer injoignable" }));
  });

  // Déclenchement du parcours SSO : redirection vers l'émetteur OIDC.
  r.get("/oidc/login", (req, res) => {
    const cfg = getOidcConfig();
    if (!cfg) {
      res.status(404).json({ error: "not_found", message: "SSO non configuré" });
      return;
    }
    void (async () => {
      const doc = await discover(cfg.issuer);
      const state = makeState();
      const { verifier, challenge } = makePkce();
      const params = new URLSearchParams({
        response_type: "code",
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        scope: "openid email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      if (cfg.roleClaim !== "email" && cfg.roleClaim !== "profile") {
        params.set("scope", `openid email profile ${cfg.roleClaim}`);
      }
      res.cookie("modop_oidc_verifier", verifier, {
        httpOnly: true,
        sameSite: "lax",
        secure: cookieSecure(),
        maxAge: 600_000,
      });
      res.redirect(`${doc.authorization_endpoint}?${params}`);
    })().catch(() =>
      res.status(502).json({ error: "bad_gateway", message: "SSO injoignable" })
    );
  });

  // Callback OIDC : échange du code, création/alignement de l'utilisateur local.
  r.get("/oidc/callback", (req, res) => {
    const cfg = getOidcConfig();
    if (!cfg) {
      res.status(404).json({ error: "not_found", message: "SSO non configuré" });
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code || !verifyState(state)) {
      res.status(422).json({ error: "validation", message: "callback OIDC invalide" });
      return;
    }
    const verifier = req.cookies?.modop_oidc_verifier;
    if (!verifier) {
      res.status(422).json({ error: "validation", message: "session OIDC expirée" });
      return;
    }
    void (async () => {
      const tokens = await exchangeCode(cfg, code, verifier);
      const { email, claims } = await fetchUserInfo(cfg, tokens.access_token);
      const role = roleFromClaims(claims, cfg);
      let user = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(email) as { id: number } | undefined;
      if (user) {
        db.prepare("UPDATE users SET role = ?, auth_provider = 'oidc' WHERE id = ?").run(role, user.id);
      } else {
        const info = db
          .prepare("INSERT INTO users (email, password_hash, role, auth_provider) VALUES (?, '', ?, 'oidc')")
          .run(email, role);
        user = { id: Number(info.lastInsertRowid) };
      }
      auditLog(db, email, "login_sso", "user", `role=${role}`);
      const token = createSession(db, user.id);
      res.clearCookie("modop_oidc_verifier");
      res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: cookieSecure() });
      res.redirect("/");
    })().catch((err: unknown) => {
      res.status(502).json({
        error: "bad_gateway",
        message: `authentification SSO échouée : ${err instanceof Error ? err.message : "erreur"}`,
      });
    });
  });

  // Login local (dev / fallback si SSO en panne).
  r.post("/login", (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      res.status(422).json({ error: "validation", message: "email et password requis" });
      return;
    }
    const user = db
      .prepare("SELECT id, email, role, password_hash, auth_provider FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()) as
      | { id: number; email: string; role: string; password_hash: string; auth_provider: string }
      | undefined;
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      auditLog(db, email.toLowerCase(), "login_echec", "user");
      res.status(401).json({ error: "unauthorized", message: "Identifiants invalides" });
      return;
    }
    const token = createSession(db, user.id);
    auditLog(db, user.email, "login", "user");
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: cookieSecure() });
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
    const user = (req as { user?: { id: number; email: string } }).user!;
    if (typeof oldPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(422).json({ error: "validation", message: "Nouveau mot de passe : 8 caractères minimum" });
      return;
    }
    const row = db.prepare("SELECT password_hash, auth_provider FROM users WHERE id = ?").get(user.id) as
      | { password_hash: string; auth_provider: string }
      | undefined;
    if (!row || row.auth_provider === "oidc") {
      res.status(403).json({ error: "forbidden", message: "Mot de passe géré par le SSO" });
      return;
    }
    if (!bcrypt.compareSync(oldPassword, row.password_hash)) {
      res.status(401).json({ error: "unauthorized", message: "Ancien mot de passe invalide" });
      return;
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), user.id);
    auditLog(db, user.email, "change_password", "user");
    res.json({ ok: true });
  });

  return r;
}
