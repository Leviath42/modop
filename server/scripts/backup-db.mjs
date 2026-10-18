// Outil de sauvegarde/restauration cohérente de la base SQLite (utilisé par update.sh).
//   node backup-db.mjs backup <base.db> <sortie.db>   → VACUUM INTO + integrity_check de la copie
//   node backup-db.mjs check  <base.db>                → integrity_check seul (après restauration)
//
// VACUUM INTO produit un snapshot complet et cohérent dans UN seul fichier :
// pas de -wal/-shm à recopier (contrairement à un `cp` de la base pendant
// laquelle le serveur écrit), et la copie est vérifiée par PRAGMA integrity_check.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

export function integrityCheck(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare("PRAGMA integrity_check").all();
    const values = rows.map((row) => Object.values(row)[0]);
    return values.every((value) => value === "ok") ? "ok" : "corrompu";
  } finally {
    db.close();
  }
}

export function backupDatabase(dbPath, backupPath) {
  const db = new Database(dbPath);
  try {
    db.exec(`VACUUM INTO ${sqlQuote(backupPath)}`);
  } finally {
    db.close();
  }
  const check = integrityCheck(backupPath);
  if (check !== "ok") {
    throw new Error(`sauvegarde incohérente (integrity_check : ${check})`);
  }
}

const invoked =
  process.argv[1] !== undefined && process.argv[1].replaceAll("\\", "/").endsWith("/backup-db.mjs");
if (invoked) {
  const command = process.argv[2];
  try {
    if (command === "backup") {
      backupDatabase(process.argv[3], process.argv[4]);
      console.log(`[backup] ${process.argv[4]} : integrity_check ok`);
    } else if (command === "check") {
      const check = integrityCheck(process.argv[3]);
      if (check !== "ok") throw new Error(`integrity_check : ${check}`);
      console.log(`[backup] ${process.argv[3]} : integrity_check ok`);
    } else {
      throw new Error("usage : backup-db.mjs backup <db> <sortie> | check <db>");
    }
  } catch (error) {
    console.error(String(error));
    process.exit(1);
  }
}
