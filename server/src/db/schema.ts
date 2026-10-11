import Database from "better-sqlite3";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('reader','author','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  family TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published')),
  current_version INTEGER NOT NULL DEFAULT 0,
  review_due TEXT,
  owner_email TEXT NOT NULL DEFAULT '',
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
  canvas TEXT NOT NULL DEFAULT '[]',
  UNIQUE (workflow_id, position)
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  annotations TEXT NOT NULL DEFAULT '[]',
  display_size TEXT NOT NULL DEFAULT 'medium' CHECK (display_size IN ('small','medium','large','full')),
  display_align TEXT NOT NULL DEFAULT 'center' CHECK (display_align IN ('left','center','right')),
  display_x REAL,
  display_y REAL,
  display_w REAL
);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  changelog TEXT NOT NULL DEFAULT '',
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
  { table: "users", column: "active", ddl: "INTEGER NOT NULL DEFAULT 1" },
  { table: "sessions", column: "expires_at", ddl: "TEXT" },
  { table: "workflows", column: "family", ddl: "TEXT NOT NULL DEFAULT ''" },
  { table: "photos", column: "annotations", ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { table: "photos", column: "display_size", ddl: "TEXT NOT NULL DEFAULT 'medium'" },
  { table: "photos", column: "display_align", ddl: "TEXT NOT NULL DEFAULT 'center'" },
  { table: "photos", column: "display_x", ddl: "REAL" },
  { table: "photos", column: "display_y", ddl: "REAL" },
  { table: "photos", column: "display_w", ddl: "REAL" },
  { table: "steps", column: "canvas", ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { table: "workflows", column: "review_due", ddl: "TEXT" },
  { table: "workflows", column: "owner_email", ddl: "TEXT NOT NULL DEFAULT ''" },
  { table: "versions", column: "changelog", ddl: "TEXT NOT NULL DEFAULT ''" },
];

// Réparation des pictos corrompus par le bug de l’ancien éditeur : la réponse
// brute du serveur (chaîne JSON) était étalée caractère par caractère dans le
// tableau des pictos, avec croissance exponentielle à chaque clic. Les débris sont
// des chaînes d’un seul caractère ; on ne conserve que les vraies entrées.
function repairPictosList(pictos: string[]): string[] {
  const out: string[] = [];
  for (const p of pictos) {
    if (typeof p === "string" && p.trim().length >= 2 && !out.includes(p)) out.push(p);
  }
  return out;
}

function repairCorruptedPictos(db: Database.Database): void {
  const rows = db.prepare("SELECT id, pictos FROM steps").all() as { id: number; pictos: string }[];
  const updateStep = db.prepare("UPDATE steps SET pictos = ? WHERE id = ?");
  for (const row of rows) {
    let pictos: unknown;
    try {
      pictos = JSON.parse(row.pictos);
    } catch {
      pictos = null;
    }
    if (!Array.isArray(pictos)) {
      updateStep.run("[]", row.id);
      continue;
    }
    const cleaned = repairPictosList(pictos as string[]);
    if (cleaned.length !== pictos.length || JSON.stringify(cleaned) !== JSON.stringify(pictos)) {
      updateStep.run(JSON.stringify(cleaned), row.id);
    }
  }
  // Les snapshots des versions déjà publiées portent la même corruption et
  // alimentent l’export .docx : on les répare aussi.
  const versions = db.prepare("SELECT id, snapshot FROM versions").all() as { id: number; snapshot: string }[];
  const updateVersion = db.prepare("UPDATE versions SET snapshot = ? WHERE id = ?");
  for (const v of versions) {
    let snap: { steps?: { pictos?: string[] }[] } | null = null;
    try {
      snap = JSON.parse(v.snapshot);
    } catch {
      continue;
    }
    if (!snap || !Array.isArray(snap.steps)) continue;
    let changed = false;
    for (const step of snap.steps) {
      if (!Array.isArray(step.pictos)) continue;
      const cleaned = repairPictosList(step.pictos);
      if (cleaned.length !== step.pictos.length || JSON.stringify(cleaned) !== JSON.stringify(step.pictos)) {
        step.pictos = cleaned;
        changed = true;
      }
    }
    if (changed) updateVersion.run(JSON.stringify(snap), v.id);
  }
}

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

  // Conversion unique : les annotations attachees aux photos (coordonnees
  // relatives a la photo) deviennent des objets du canevas de l'etape.
  const photos = db
    .prepare("SELECT p.id, p.step_id, p.annotations, p.display_x, p.display_w, p.display_align FROM photos p WHERE p.annotations != '[]'")
    .all() as { id: number; step_id: number; annotations: string; display_x: number | null; display_w: number | null; display_align: string | null }[];
  for (const ph of photos) {
    try {
      const shapes = JSON.parse(ph.annotations) as Record<string, unknown>[];
      const w = ph.display_w ?? 0.6;
      const x0 = ph.display_x ?? (ph.display_align === "left" ? 0 : ph.display_align === "right" ? 1 - w : (1 - w) / 2);
      const step = db.prepare("SELECT canvas FROM steps WHERE id = ?").get(ph.step_id) as { canvas: string };
      const canvas = JSON.parse(step.canvas || "[]") as Record<string, unknown>[];
      for (const sh of shapes) {
        canvas.push({
          ...sh,
          x1: x0 + Number(sh.x1 ?? 0) * w,
          y1: Number(sh.y1 ?? 0) * 0.8,
          x2: sh.x2 !== undefined ? x0 + Number(sh.x2) * w : undefined,
          y2: sh.y2 !== undefined ? Number(sh.y2) * 0.8 : undefined,
        });
      }
      db.prepare("UPDATE steps SET canvas = ? WHERE id = ?").run(JSON.stringify(canvas), ph.step_id);
      db.prepare("UPDATE photos SET annotations = '[]' WHERE id = ?").run(ph.id);
    } catch {
      // forme illisible : on passe (les donnees d'origine restent sur la photo)
    }
  }

  // Index dépendant des colonnes migrées (après ALTER TABLE).
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)");
  repairCorruptedPictos(db);
}

export function openDb(file: string): Database.Database {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
