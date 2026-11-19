// Daily backup with VACUUM INTO: a consistent copy taken while the app keeps running.
// CLI: `npm run backup`. The server also schedules this once a day.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKUP_DIR } from '../server/config.js';

const KEEP = Number(process.env.BACKUP_KEEP || 14);

export function backupNow(db) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `shuka-${stamp}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^shuka-.*\.db$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  return file;
}

export function scheduleDailyBackup(db) {
  const run = () => {
    try { console.log('Backup written:', backupNow(db)); } catch (e) { console.error('Backup failed:', e); }
  };
  setTimeout(run, 60_000).unref(); // one shortly after start
  setInterval(run, 24 * 3600 * 1000).unref();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { openDb } = await import('../server/db.js');
  const db = openDb();
  console.log('Backup written:', backupNow(db));
  db.close();
}
