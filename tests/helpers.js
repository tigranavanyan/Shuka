import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fresh data dir with migrations applied and a couple of categories. */
export async function makeDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shuka-test-'));
  process.env.DATA_DIR = dir; // used by openDb() in tests that touch SQLite directly
  const { openDb, migrate } = await import('../server/db.js');
  const db = openDb(path.join(dir, 'shuka.db'));
  migrate(db);
  db.prepare("INSERT INTO categories (name, slug) VALUES ('Electronics', 'electronics'), ('Books', 'books')").run();
  db.close();
  return dir;
}

/** Start a real server process on the given data dir. Several may share one DB file. */
export async function startServer(dataDir, port) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), BACKUP_DAILY: '0', BCRYPT_ROUNDS: '4', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { base, child, log: () => log, stop: () => new Promise((r) => { child.once('exit', r); child.kill('SIGTERM'); }) };
}

/** Minimal API client with a cookie jar. */
export class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async req(method, url, body, { form } = {}) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(this.base + '/api' + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) {
      const [pair] = c.split(';');
      if (pair.endsWith('=')) this.cookie = ''; else this.cookie = pair;
    }
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b); }
  patch(u, b) { return this.req('PATCH', u, b); }
  del(u) { return this.req('DELETE', u); }
}

let n = 0;
export async function register(base, extra = {}) {
  const c = new Client(base);
  const id = `${Date.now()}${++n}${Math.random().toString(36).slice(2, 6)}`;
  const r = await c.post('/auth/register', { email: `u${id}@test.am`, password: 'password123', name: `User ${n}`, phone: '+374 91 000000', ...extra });
  if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.data));
  c.user = r.data.user;
  return c;
}

export async function makeSeller(base, store) {
  const c = await register(base);
  const r = await c.post('/seller/activate', { storeName: store || `Store ${Math.random().toString(36).slice(2, 8)}`, phone: '+374 93 000000' });
  if (r.status !== 200) throw new Error('activate failed ' + JSON.stringify(r.data));
  return c;
}

export async function pngBuffer(color = '#c2410c') {
  return sharp({ create: { width: 600, height: 600, channels: 3, background: color } }).png().toBuffer();
}

/** Create a published product with one image. */
export async function makeProduct(seller, { title = 'Test product', priceAmd = 1000, stock = 10 } = {}) {
  const r = await seller.post('/seller/products', { title, description: 'A product made for tests.', categoryId: 1, priceAmd, stock });
  if (r.status !== 201) throw new Error('create product failed ' + JSON.stringify(r.data));
  const id = r.data.product.id;
  const form = new FormData();
  form.append('images', new Blob([await pngBuffer()], { type: 'image/png' }), 'photo.png');
  const up = await seller.req('POST', `/seller/products/${id}/images`, undefined, { form });
  if (up.status !== 201) throw new Error('upload failed ' + JSON.stringify(up.data));
  const pub = await seller.patch(`/seller/products/${id}`, { isPublished: true });
  if (pub.status !== 200) throw new Error('publish failed ' + JSON.stringify(pub.data));
  return pub.data.product;
}

export const ADDRESS = {
  recipient: 'Test Buyer', phone: '+374 91 123456', region: 'Yerevan', city: 'Yerevan',
  street: 'Tumanyan 5', apartment: '12', note: '',
};
export const key = () => `k${Date.now()}${Math.random().toString(36).slice(2)}`;

export async function checkout(client, requestKey = key()) {
  return client.post('/orders', { ...ADDRESS, requestKey });
}
