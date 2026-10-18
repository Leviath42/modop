import { openDb } from "./schema.js";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const file = process.argv[2] ?? "modop.db";
const email = process.argv[3];
const password = process.argv[4];
const role = (process.argv[5] ?? "admin") as "reader" | "author" | "admin";

if (!email || !password) {
  console.error("Usage : tsx src/db/seed.ts <fichier.db> <email> <mot-de-passe> [role]");
  console.error('Rôles : reader | author | admin (défaut : admin)');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Le mot de passe doit faire au moins 8 caractères.");
  process.exit(1);
}

const db = openDb(file);
const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
if (exists) {
  console.error(`Un compte existe déjà pour ${email}.`);
  process.exit(1);
}
db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run(
  email.toLowerCase().trim(),
  bcrypt.hashSync(password, 10),
  role
);
const token = crypto.randomBytes(16).toString("hex");
console.log(`Compte créé : ${email} (${role})`);
console.log(`Base : ${file}`);
console.log(`Jeton de session de test (optionnel) : ${token}`);
