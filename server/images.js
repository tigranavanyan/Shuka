import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import multer from 'multer';
import { UPLOADS_DIR, MAX_IMAGE_BYTES } from './config.js';
import { badRequest } from './errors.js';

export const LARGE_DIR = path.join(UPLOADS_DIR, 'large');
export const THUMB_DIR = path.join(UPLOADS_DIR, 'thumb');
fs.mkdirSync(LARGE_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/** Multer keeps files in memory (bounded by the size limit); we never store BLOBs in SQLite. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 5 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(badRequest(`"${file.originalname}" is not a JPEG, PNG or WebP image.`));
    }
    cb(null, true);
  },
});

/**
 * Validate the real file content (not just the name/MIME header), then write a
 * 1200px large version and a 400px thumbnail. Returns the file name to store.
 */
export async function processImage(buffer, originalName = 'image') {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw badRequest(`"${originalName}" is not a valid image file.`);
  }
  if (!ALLOWED_FORMATS.has(meta.format)) {
    throw badRequest(`"${originalName}" is not a JPEG, PNG or WebP image.`);
  }
  if (!meta.width || !meta.height || meta.width * meta.height > 50_000_000) {
    throw badRequest(`"${originalName}" has invalid dimensions.`);
  }
  const name = `${crypto.randomBytes(12).toString('hex')}.webp`;
  const base = sharp(buffer, { failOn: 'error' }).rotate(); // honour EXIF orientation, strips metadata
  await base.clone().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toFile(path.join(LARGE_DIR, name));
  await base.clone().resize(400, 400, { fit: 'cover' })
    .webp({ quality: 78 }).toFile(path.join(THUMB_DIR, name));
  return name;
}

export function deleteImageFiles(name) {
  for (const dir of [LARGE_DIR, THUMB_DIR]) {
    fs.rm(path.join(dir, path.basename(name)), { force: true }, () => {});
  }
}

export const imageUrls = (name) => name
  ? { large: `/uploads/large/${name}`, thumb: `/uploads/thumb/${name}` }
  : null;
