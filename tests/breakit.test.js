// Break-it tests from the project brief. Run with `npm test`.
// They start real server processes against a temporary SQLite file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  makeDataDir, startServer, Client, register, makeSeller, makeProduct, checkout, key, pngBuffer,
} from './helpers.js';

let dataDir;
let s1;
let s2;

before(async () => {
  dataDir = await makeDataDir();
  // Two processes share one database file, so the locking is real, not just Node's event loop.
  [s1, s2] = await Promise.all([startServer(dataDir, 4101), startServer(dataDir, 4102)]);
});

after(async () => {
  await Promise.all([s1?.stop(), s2?.stop()]);
});

test('1. Last units: 30 concurrent checkouts for stock 3 → exactly 3 orders, 27 × 409, stock 0, no lock errors', async () => {
  const seller = await makeSeller(s1.base);
  const product = await makeProduct(seller, { title: 'Last Units Lamp', stock: 3, priceAmd: 5000 });

  const buyers = await Promise.all(Array.from({ length: 30 }, (_, i) => register(i % 2 ? s2.base : s1.base)));
  for (const b of buyers) {
    const r = await b.put(`/cart/items/${product.id}`, { quantity: 1 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }

  // Fire all 30 at once, split across the two server processes.
  const results = await Promise.all(buyers.map((b) => checkout(b)));
  const statuses = results.map((r) => r.status);
  const created = statuses.filter((s) => s === 201).length;
  const conflicts = results.filter((r) => r.status === 409);

  assert.equal(created, 3, `statuses: ${statuses.join(',')}`);
  assert.equal(conflicts.length, 27);
  for (const c of conflicts) {
    assert.equal(c.data.error.code, 'OUT_OF_STOCK');
    assert.match(c.data.error.message, /Last Units Lamp/); // 409 names the product
  }
  assert.ok(!statuses.some((s) => s >= 500), 'no server errors');
  const logs = s1.log() + s2.log();
  assert.doesNotMatch(logs, /database is locked|SQLITE_BUSY/i);

  const after = await seller.get(`/seller/products/${product.id}`);
  assert.equal(after.data.product.stock, 0);
});

test('2. Double click: the same request key twice → one order', async () => {
  const seller = await makeSeller(s1.base);
  const product = await makeProduct(seller, { stock: 10 });
  const buyer = await register(s1.base);
  await buyer.put(`/cart/items/${product.id}`, { quantity: 2 });

  const k = key();
  const [a, b] = await Promise.all([checkout(buyer, k), checkout(buyer, k)]);
  const c = await checkout(buyer, k); // and once more afterwards
  const ids = [a, b, c].map((r) => r.data.order?.id);
  assert.deepEqual([a.status, b.status, c.status].sort(), [200, 200, 201]);
  assert.equal(new Set(ids).size, 1, `ids ${ids}`);

  const list = await buyer.get('/orders');
  assert.equal(list.data.orders.length, 1);
  const p = await seller.get(`/seller/products/${product.id}`);
  assert.equal(p.data.product.stock, 8, 'stock taken only once');
});

test('3. Price changed: seller raises the price after add-to-cart → checkout stops and shows the new price', async () => {
  const seller = await makeSeller(s1.base);
  const product = await makeProduct(seller, { priceAmd: 10000, stock: 5 });
  const buyer = await register(s1.base);
  await buyer.put(`/cart/items/${product.id}`, { quantity: 1 });

  await seller.patch(`/seller/products/${product.id}`, { priceAmd: 12500 });
  const r = await checkout(buyer);
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, 'PRICE_CHANGED');
  assert.equal(r.data.error.details.items[0].newPriceAmd, 12500);
  assert.equal(r.data.error.details.items[0].oldPriceAmd, 10000);

  const cart = await buyer.get('/cart');
  assert.equal(cart.data.cart.groups[0].items[0].warnings.priceChanged, true);
  assert.equal((await buyer.get('/orders')).data.orders.length, 0);
  assert.equal((await seller.get(`/seller/products/${product.id}`)).data.product.stock, 5, 'stock untouched');

  // Accepting the new price (re-setting the quantity) lets the buyer check out.
  await buyer.put(`/cart/items/${product.id}`, { quantity: 1 });
  const ok = await checkout(buyer);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.order.totalAmd, 12500);
});

test('4. Old order after edit: editing title and price never changes a past order', async () => {
  const seller = await makeSeller(s1.base);
  const product = await makeProduct(seller, { title: 'Original Title', priceAmd: 7000 });
  const buyer = await register(s1.base);
  await buyer.put(`/cart/items/${product.id}`, { quantity: 1 });
  const order = (await checkout(buyer)).data.order;

  await seller.patch(`/seller/products/${product.id}`, { title: 'Renamed Product', priceAmd: 9999 });

  const o = (await buyer.get(`/orders/${order.id}`)).data.order;
  assert.equal(o.sellerOrders[0].items[0].title, 'Original Title');
  assert.equal(o.sellerOrders[0].items[0].unitPriceAmd, 7000);
  assert.equal(o.totalAmd, 7000);
  const so = (await seller.get(`/seller/orders/${o.sellerOrders[0].id}`)).data.order;
  assert.equal(so.items[0].title, 'Original Title');
  assert.equal(so.items[0].unitPriceAmd, 7000);
});

test("5. Someone else's order: seller A ↛ seller B's order, buyer A ↛ buyer B's order", async () => {
  const sellerA = await makeSeller(s1.base);
  const sellerB = await makeSeller(s1.base);
  const product = await makeProduct(sellerB);
  const buyerA = await register(s1.base);
  const buyerB = await register(s1.base);
  await buyerB.put(`/cart/items/${product.id}`, { quantity: 1 });
  const order = (await checkout(buyerB)).data.order;
  const soId = order.sellerOrders[0].id;

  const tries = [
    await sellerA.get(`/seller/orders/${soId}`),
    await sellerA.post(`/seller/orders/${soId}/status`, { to: 'confirmed' }),
    await buyerA.get(`/orders/${order.id}`),
    await buyerA.post(`/orders/${order.id}/sellers/${soId}/cancel`),
    await sellerA.patch(`/seller/products/${product.id}`, { priceAmd: 1 }),
  ];
  for (const r of tries) {
    assert.ok([403, 404].includes(r.status), `got ${r.status}`);
    assert.ok(r.data.error, 'error shape');
    assert.equal(JSON.stringify(r.data).includes('Tumanyan'), false, 'no address leaked');
  }
  const still = (await sellerB.get(`/seller/orders/${soId}`)).data.order;
  assert.equal(still.status, 'placed');
  // Guests get 401
  const guest = new Client(s1.base);
  assert.equal((await guest.get(`/orders/${order.id}`)).status, 401);
  assert.equal((await guest.put(`/cart/items/${product.id}`, { quantity: 1 })).status, 401);
});

test('6. Move not allowed: placed → delivered and buyer cancelling a shipped order both return 409 and change nothing', async () => {
  const seller = await makeSeller(s1.base);
  const product = await makeProduct(seller, { stock: 10 });
  const buyer = await register(s1.base);
  await buyer.put(`/cart/items/${product.id}`, { quantity: 1 });
  const order = (await checkout(buyer)).data.order;
  const soId = order.sellerOrders[0].id;

  const jump = await seller.post(`/seller/orders/${soId}/status`, { to: 'delivered' });
  assert.equal(jump.status, 409);
  assert.equal(jump.data.error.code, 'STATUS_NOT_ALLOWED');
  let so = (await seller.get(`/seller/orders/${soId}`)).data.order;
  assert.equal(so.status, 'placed');
  assert.equal(so.history.length, 1);

  assert.equal((await seller.post(`/seller/orders/${soId}/status`, { to: 'confirmed' })).status, 200);
  assert.equal((await seller.post(`/seller/orders/${soId}/status`, { to: 'shipped' })).status, 200);

  const cancel = await buyer.post(`/orders/${order.id}/sellers/${soId}/cancel`);
  assert.equal(cancel.status, 409);
  so = (await seller.get(`/seller/orders/${soId}`)).data.order;
  assert.equal(so.status, 'shipped');
  assert.equal(so.history.length, 3);
  assert.equal((await seller.get(`/seller/products/${product.id}`)).data.product.stock, 9, 'stock not returned');

  // Backwards moves are refused too.
  assert.equal((await seller.post(`/seller/orders/${soId}/status`, { to: 'placed' })).status, 409);
});

test('7. Cancel returns stock', async () => {
  const seller = await makeSeller(s1.base);
  const product = await makeProduct(seller, { stock: 10 });
  const buyer = await register(s1.base);
  await buyer.put(`/cart/items/${product.id}`, { quantity: 4 });
  const order = (await checkout(buyer)).data.order;
  assert.equal((await seller.get(`/seller/products/${product.id}`)).data.product.stock, 6);

  const r = await buyer.post(`/orders/${order.id}/sellers/${order.sellerOrders[0].id}/cancel`);
  assert.equal(r.status, 200);
  assert.equal(r.data.order.sellerOrders[0].status, 'cancelled');
  assert.equal((await seller.get(`/seller/products/${product.id}`)).data.product.stock, 10);
  assert.equal(r.data.order.sellerOrders[0].history.at(-1).to, 'cancelled');
});

test('8. Foreign keys: an order item for a product that does not exist is rejected by SQLite', async () => {
  const { openDb } = await import('../server/db.js');
  const db = openDb(path.join(dataDir, 'shuka.db'));
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  const so = db.prepare('SELECT id FROM seller_orders LIMIT 1').get();
  assert.throws(
    () => db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, 999999, ?, 100, 1)').run(so.id, 'Ghost'),
    (e) => e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY',
  );
  // An ordered product cannot be deleted either (ON DELETE RESTRICT).
  const ordered = db.prepare('SELECT product_id FROM order_items LIMIT 1').pluck().get();
  assert.throws(() => db.prepare('DELETE FROM products WHERE id = ?').run(ordered), (e) => e.code.startsWith('SQLITE_CONSTRAINT'));
  // STRICT tables reject a wrong type.
  assert.throws(() => db.prepare("UPDATE products SET price_amd = 'cheap' WHERE id = ?").run(ordered), /cannot store TEXT value in INTEGER column/);
  // status_history is insert-only.
  assert.throws(() => db.prepare("UPDATE status_history SET to_status = 'delivered'").run(), /insert-only/);
  db.close();
});

test('9. Bad upload: a 30 MB file and a renamed .exe are rejected with a clear message', async () => {
  const seller = await makeSeller(s1.base);
  const created = await seller.post('/seller/products', { title: 'Upload test', description: 'Testing uploads here.', categoryId: 1, priceAmd: 100, stock: 1 });
  const id = created.data.product.id;

  const big = new FormData();
  big.append('images', new Blob([Buffer.alloc(30 * 1024 * 1024, 0xff)], { type: 'image/jpeg' }), 'huge.jpg');
  const r1 = await seller.req('POST', `/seller/products/${id}/images`, undefined, { form: big });
  assert.equal(r1.status, 400);
  assert.match(r1.data.error.message, /5 MB/);

  // Windows executable header, renamed to .jpg with an image MIME type.
  const exe = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary'), Buffer.alloc(4096, 0x41)]);
  const fake = new FormData();
  fake.append('images', new Blob([exe], { type: 'image/jpeg' }), 'holiday.jpg');
  const r2 = await seller.req('POST', `/seller/products/${id}/images`, undefined, { form: fake });
  assert.equal(r2.status, 400);
  assert.match(r2.data.error.message, /not a valid image/);

  // The same .exe with its real type is refused before reading it.
  const raw = new FormData();
  raw.append('images', new Blob([exe], { type: 'application/x-msdownload' }), 'setup.exe');
  const r3 = await seller.req('POST', `/seller/products/${id}/images`, undefined, { form: raw });
  assert.equal(r3.status, 400);
  assert.match(r3.data.error.message, /not a JPEG, PNG or WebP/);

  const p = (await seller.get(`/seller/products/${id}`)).data.product;
  assert.equal(p.images.length, 0, 'nothing saved');

  // A valid image is resized into large + thumb files.
  const good = new FormData();
  good.append('images', new Blob([await pngBuffer()], { type: 'image/png' }), 'ok.png');
  const r4 = await seller.req('POST', `/seller/products/${id}/images`, undefined, { form: good });
  assert.equal(r4.status, 201);
  const img = r4.data.product.images[0];
  const thumb = await fetch(s1.base + img.thumb);
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get('content-type'), 'image/webp');
});
