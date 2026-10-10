import Database from "better-sqlite3";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('reader','author','admin')),
  auth_provider TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published')),
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  pictos TEXT NOT NULL DEFAULT '[]',
  UNIQUE (workflow_id, position)
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  author_email TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workflow_id, number)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+24 hours'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_steps_workflow ON steps(workflow_id, position);
CREATE INDEX IF NOT EXISTS idx_photos_step ON photos(step_id);
CREATE INDEX IF NOT EXISTS idx_versions_workflow ON versions(workflow_id, number);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

`;

// Migration idempotente : les bases créées avant une évolution du schéma
// reçoivent les colonnes manquantes (CREATE TABLE IF NOT EXISTS ne touche
// pas une table existante).
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "users", column: "auth_provider", ddl: "TEXT NOT NULL DEFAULT 'local'" },
  { table: "sessions", column: "expires_at", ddl: "TEXT" },
];

function migrate(db: Database.Database): void {
  for (const { table, column, ddl } of COLUMN_MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.length > 0 && !cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
  // Sessions antérieures à la v2 : expiration par défaut.
  db.exec(
    "UPDATE sessions SET expires_at = datetime('now', '+24 hours') WHERE expires_at IS NULL"
  );
  // Index dépendant des colonnes migrées (après ALTER TABLE).
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)");
}

export function openDb(file: string): Database.Database {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
