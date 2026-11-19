import crypto from 'node:crypto';
import { SESSION_SECRET, IS_PROD } from './config.js';
import { unauthorized, forbidden } from './errors.js';

// Stateless signed session cookie: "<userId>.<expiresMs>.<hmac>", httpOnly.
const COOKIE = 'shuka_sid';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

const sign = (payload) =>
  crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');

export function setSession(res, userId) {
  const exp = Date.now() + MAX_AGE_MS;
  const payload = `${userId}.${exp}`;
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/' });
}

function readSession(req) {
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, mac] = parts;
  const expected = sign(`${id}.${exp}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

/** Loads req.user (or null) on every request. */
export const loadUser = (db) => {
  const stmt = db.prepare('SELECT id, email, name, phone, store_name, created_at FROM users WHERE id = ?');
  return (req, _res, next) => {
    const id = readSession(req);
    req.user = id ? stmt.get(id) || null : null;
    next();
  };
};

export function requireUser(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireSeller(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.store_name) return next(forbidden('Activate your seller account first.'));
  next();
}

/**
 * Basic CSRF defence for cookie auth: state-changing requests must come from
 * our own origin (browsers always send Origin on cross-site POST/PUT/PATCH/DELETE).
 */
export function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // non-browser clients (tests, curl)
  try {
    const host = req.get('x-forwarded-host') || req.get('host');
    if (new URL(origin).host === host) return next();
  } catch { /* fallthrough */ }
  return next(forbidden('Cross-site request blocked.'));
}

export function publicUser(u, extra = {}) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    storeName: u.store_name,
    isSeller: !!u.store_name,
    createdAt: u.created_at,
    ...extra,
  };
}
