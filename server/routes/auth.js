import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { h, unauthorized, conflict } from '../errors.js';
import { V, PHONE, EMAIL } from '../validate.js';
import { setSession, clearSession, requireUser, publicUser } from '../auth.js';
import { BCRYPT_ROUNDS } from '../config.js';

export default function authRoutes(db) {
  const r = Router();
  const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

  const lastAddress = db.prepare(`
    SELECT recipient, phone, region, city, street, apartment
    FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 1`);
  const cartCount = db.prepare('SELECT COALESCE(SUM(quantity), 0) FROM cart_items WHERE user_id = ?').pluck();

  const me = (u) => publicUser(u, {
    lastAddress: lastAddress.get(u.id) || null,
    cartCount: cartCount.get(u.id),
  });

  // POST /auth/register — anyone
  r.post('/auth/register', h(async (req, res) => {
    const v = new V(req.body)
      .str('email', { label: 'Email', max: 254, pattern: EMAIL, patternMsg: 'Enter a valid email address.' })
      .str('password', { label: 'Password', min: 8, max: 200 })
      .str('name', { label: 'Name', max: 100 })
      .str('phone', { label: 'Phone', max: 30, pattern: PHONE, patternMsg: 'Enter a valid phone number, e.g. +374 91 123456.' })
      .done();
    const hash = await bcrypt.hash(v.password, BCRYPT_ROUNDS);
    let id;
    try {
      id = db.prepare('INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)')
        .run(v.email.toLowerCase(), hash, v.name, v.phone).lastInsertRowid;
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw conflict('EMAIL_TAKEN', 'An account with this email already exists.', { fields: { email: 'An account with this email already exists.' } });
      }
      throw e;
    }
    setSession(res, id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json({ user: me(u) });
  }));

  // POST /auth/login — anyone
  r.post('/auth/login', h(async (req, res) => {
    const v = new V(req.body).str('email', { label: 'Email', max: 254 }).str('password', { label: 'Password', max: 200 }).done();
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(v.email);
    // Compare against a dummy hash when the user doesn't exist to keep timing similar.
    const ok = await bcrypt.compare(v.password, u?.password_hash || DUMMY_HASH);
    if (!u || !ok) throw unauthorized('Wrong email or password.');
    setSession(res, u.id);
    res.json({ user: me(u) });
  }));

  // POST /auth/logout — signed in (harmless if not)
  r.post('/auth/logout', (req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  // GET /me — signed in. Returns { user: null } for guests so the SPA can boot without a 401.
  r.get('/me', (req, res) => {
    res.json({ user: req.user ? me(req.user) : null });
  });

  // PATCH /me — signed in: edit name and phone
  r.patch('/me', requireUser, h((req, res) => {
    const v = new V(req.body)
      .str('name', { label: 'Name', max: 100 })
      .str('phone', { label: 'Phone', max: 30, pattern: PHONE, patternMsg: 'Enter a valid phone number, e.g. +374 91 123456.' })
      .done();
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(v.name, v.phone, req.user.id);
    res.json({ user: me(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  }));

  return r;
}
