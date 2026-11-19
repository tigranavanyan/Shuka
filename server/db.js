import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, DATA_DIR, ROOT } from './config.js';

/** Open a connection with the settings every connection must have. */
export function openDb(file = DB_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');   // readers don't block the writer
  db.pragma('busy_timeout = 5000');  // wait up to 5 s for a lock instead of SQLITE_BUSY
  db.pragma('foreign_keys = ON');    // off by default in SQLite
  db.pragma('synchronous = NORMAL'); // safe with WAL
  return db;
}

/** Apply numbered migrations/NNN_*.sql files that have not run yet. */
export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL
  ) STRICT`);
  const dir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
        .run(f, new Date().toISOString());
    }).immediate();
    applied.push(f);
  }
  return applied;
}

let shared;
export function getDb() {
  if (!shared) shared = openDb();
  return shared;
}

export { DATA_DIR };
