// Compte de service svc-mcp (C-90) : upsert au démarrage depuis l'env,
// pattern seed.ts — l'env est la source de vérité (jamais de secret en
// base : seul le hash bcrypt du mot de passe y vit).
import type Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { MODOP_MCP_EMAIL, MODOP_MCP_PASSWORD, MODOP_MCP_ROLE } from "./config.js";

export function ensureServiceAccount(db: Database.Database): void {
  const email = MODOP_MCP_EMAIL();
  const hash = bcrypt.hashSync(MODOP_MCP_PASSWORD(), 10);
  const role = MODOP_MCP_ROLE();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE id = ?").run(hash, role, existing.id);
    console.log(`[mcp] compte de service ${email} synchronisé (rôle ${role})`);
  } else {
    db.prepare(
      "INSERT INTO users (email, password_hash, role, first_name, last_name, active) VALUES (?, ?, ?, ?, ?, 1)"
    ).run(email, hash, role, "Service", "MCP");
    console.log(`[mcp] compte de service ${email} créé (rôle ${role})`);
  }
}
