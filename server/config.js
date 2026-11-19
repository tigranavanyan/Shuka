import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The SQLite file and the uploads folder live together in DATA_DIR
// (a persistent volume in production, ./data locally).
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const DB_PATH = path.join(DATA_DIR, 'shuka.db');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const IS_PROD = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT || 3000);
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per photo
export const PAGE_SIZE = 24;

let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (IS_PROD) throw new Error('SESSION_SECRET must be set in production');
  // Dev only: a stable secret kept in the data dir so sessions survive restarts.
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const f = path.join(DATA_DIR, '.dev-secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'));
  secret = fs.readFileSync(f, 'utf8').trim();
}
export const SESSION_SECRET = secret;

export const REGIONS = [
  'Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk',
  'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor',
];
