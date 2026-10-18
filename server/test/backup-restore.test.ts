import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Vague 9 : la sauvegarde de la base passe d'un `cp` (WAL à recopier, image
// possiblement incohérente) à VACUUM INTO, vérifiée par PRAGMA integrity_check
// — c'est ce que fait update.sh via server/scripts/backup-db.mjs.

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-backup-"));
const DB = path.join(DIR, "prod.db");
const BAK = path.join(DIR, "backup.db");

fs.rmSync(DB, { force: true });
fs.rmSync(DB + "-wal", { force: true });
fs.rmSync(DB + "-shm", { force: true });
fs.rmSync(BAK, { force: true });

test("VACUUM INTO : snapshot cohérent (WAL inclus), restauré et vérifié", async () => {
  const { backupDatabase, integrityCheck } = await import("../scripts/backup-db.mjs");

  // Base en mode WAL avec des écritures non checkpointées dans le -wal :
  // un `cp` du seul fichier .db les perdrait, VACUUM INTO les inclut.
  const db = new Database(DB);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  db.prepare("INSERT INTO t (v) VALUES (?)").run("donnée-à-conserver");
  db.pragma("wal_checkpoint(PASSIVE)");

  backupDatabase(DB, BAK);
  db.close();

  assert.ok(fs.existsSync(BAK), "le fichier de sauvegarde existe");
  assert.ok(!fs.existsSync(BAK + "-wal"), "la sauvegarde est un fichier unique (pas de -wal)");
  assert.equal(integrityCheck(BAK), "ok", "la sauvegarde passe integrity_check");

  // Restauration (chemin de update.sh rollback) : écraser la base, vérifier, relire.
  fs.rmSync(DB, { force: true });
  fs.rmSync(DB + "-wal", { force: true });
  fs.rmSync(DB + "-shm", { force: true });
  fs.copyFileSync(BAK, DB);
  assert.equal(integrityCheck(DB), "ok", "la base restaurée passe integrity_check");

  const restored = new Database(DB);
  const row = restored.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
  restored.close();
  assert.equal(row.v, "donnée-à-conserver", "les données sont intactes après restauration");
});

test("VACUUM INTO refuse d'écraser une sauvegarde existante", async () => {
  const { backupDatabase } = await import("../scripts/backup-db.mjs");
  assert.throws(() => backupDatabase(DB, BAK), "un second backup sur le même chemin échoue");
});

test("integrity_check détecte une base corrompue (non-SQLite)", async () => {
  const { integrityCheck } = await import("../scripts/backup-db.mjs");
  const garbage = path.join(DIR, "garbage.db");
  fs.writeFileSync(garbage, Buffer.from("ceci n'est pas une base sqlite"));
  assert.throws(() => integrityCheck(garbage), "une base illisible fait échouer le contrôle");
});
