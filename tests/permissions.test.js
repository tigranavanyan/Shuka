// Extra checks: permissions, demo-script flow, reviews and stats.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeDataDir, startServer, Client, register, makeSeller, makeProduct, checkout } from './helpers.js';

let s;
before(async () => { s = await startServer(await makeDataDir(), 4103); });
after(async () => { await s?.stop(); });

test('error shape, guests and non-sellers', async () => {
  const guest = new Client(s.base);
  const r = await guest.get('/cart');
  assert.equal(r.status, 401);
  assert.deepEqual(Object.keys(r.data.error).sort(), ['code', 'message']);

  const buyer = await register(s.base);
  assert.equal((await buyer.get('/seller/products')).status, 403);
  assert.equal((await buyer.post('/seller/products', {})).status, 403);
  const bad = await buyer.post('/auth/register', { email: 'nope', password: '1', name: '', phone: 'x' });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error.details.fields.email);
});

test('seller cannot buy own product; cart quantity cannot exceed stock', async () => {
  const seller = await makeSeller(s.base);
  const p = await makeProduct(seller, { stock: 2 });
  assert.equal((await seller.put(`/cart/items/${p.id}`, { quantity: 1 })).status, 403);
  const buyer = await register(s.base);
  const r = await buyer.put(`/cart/items/${p.id}`, { quantity: 3 });
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, 'NOT_ENOUGH_STOCK');
});

test('demo flow: two sellers, one cart, split order, lifecycle, review, stats', async () => {
  const a = await makeSeller(s.base, 'Demo Store A');
  const b = await makeSeller(s.base, 'Demo Store B');
  const pa = await makeProduct(a, { title: 'Walnut Board', priceAmd: 6000, stock: 5 });
  const pb = await makeProduct(b, { title: 'Apricot Jam', priceAmd: 2500, stock: 9 });

  // discoverable by search and category
  const found = await new Client(s.base).get('/products?q=walnut&category=electronics');
  assert.ok(found.data.items.some((i) => i.id === pa.id));

  const buyer = await register(s.base);
  await buyer.put(`/cart/items/${pa.id}`, { quantity: 1 });
  await buyer.put(`/cart/items/${pb.id}`, { quantity: 2 });
  const cart = (await buyer.get('/cart')).data.cart;
  assert.equal(cart.groups.length, 2);
  assert.equal(cart.totalAmd, 6000 + 5000);

  const order = (await checkout(buyer)).data.order;
  assert.equal(order.sellerOrders.length, 2);
  assert.equal((await buyer.get('/cart')).data.cart.groups.length, 0);
  assert.equal((await buyer.get('/me')).data.user.lastAddress.street, 'Tumanyan 5');

  const soA = order.sellerOrders.find((x) => x.storeName === 'Demo Store A').id;
  const listA = (await a.get('/seller/orders')).data;
  assert.equal(listA.orders.length, 1, 'seller A sees only their part');
  const detail = (await a.get(`/seller/orders/${soA}`)).data.order;
  assert.equal(detail.items.length, 1);
  assert.equal(detail.delivery.phone, '+374 91 123456');
  assert.equal(detail.cashToCollectAmd, 6000);
  assert.deepEqual(detail.allowedMoves, ['confirmed', 'cancelled']);

  // review before delivery is refused
  assert.equal((await buyer.post(`/products/${pa.id}/reviews`, { rating: 5, body: 'x' })).status, 403);

  for (const to of ['confirmed', 'shipped', 'delivered']) {
    assert.equal((await a.post(`/seller/orders/${soA}/status`, { to })).status, 200);
  }
  const mine = (await buyer.get(`/orders/${order.id}`)).data.order;
  const partA = mine.sellerOrders.find((x) => x.id === soA);
  assert.equal(partA.status, 'delivered');
  assert.deepEqual(partA.history.map((h) => h.to), ['placed', 'confirmed', 'shipped', 'delivered']);
  assert.equal(partA.items[0].canReview, true);
  assert.equal(mine.sellerOrders.find((x) => x.id !== soA).status, 'placed', 'other seller part independent');

  const rev = await buyer.post(`/products/${pa.id}/reviews`, { rating: 4, body: 'Solid board.' });
  assert.equal(rev.status, 201);
  assert.equal(rev.data.ratingAvg, 4);
  assert.equal((await buyer.post(`/products/${pa.id}/reviews`, { rating: 5 })).status, 409, 'one per buyer');
  const pub = (await new Client(s.base).get(`/products/${pa.id}`)).data.product;
  assert.equal(pub.ratingCount, 1);
  assert.equal(pub.stock, 4);

  const ov = (await a.get('/seller/overview')).data.overview;
  assert.equal(ov.revenueLast30DaysAmd, 6000);
  assert.equal(ov.ordersByStatus.delivered, 1);
  const prods = (await a.get('/seller/products')).data.products;
  assert.equal(prods[0].unitsSold, 1);

  // unpublish hides it from the store but keeps it for the seller
  await a.patch(`/seller/products/${pa.id}`, { isPublished: false });
  assert.equal((await new Client(s.base).get(`/products/${pa.id}`)).status, 404);
  assert.equal((await a.get(`/products/${pa.id}`)).status, 200);
});
