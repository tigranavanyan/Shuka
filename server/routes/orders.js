import { Router } from 'express';
import { h, badRequest, conflict, notFound, forbidden } from '../errors.js';
import { V, PHONE, positiveIntParam } from '../validate.js';
import { requireUser } from '../auth.js';
import { REGIONS } from '../config.js';
import { BUYER_MOVES, changeStatus, historyFor } from '../orders.js';
import { imageUrls } from '../images.js';

export default function orderRoutes(db) {
  const r = Router();

  // ---------------------------------------------------------------- checkout
  const findByKey = db.prepare('SELECT id, buyer_id FROM orders WHERE request_key = ?');

  /**
   * The checkout transaction — plain SQL, one BEGIN IMMEDIATE transaction.
   * Any failing line throws, which rolls back the whole order.
   */
  const checkout = db.transaction((buyerId, addr, requestKey) => {
    // A repeat of the same request returns the order that already exists.
    const existing = findByKey.get(requestKey);
    if (existing) return { orderId: existing.id, buyerId: existing.buyer_id, duplicate: true };

    const lines = db.prepare(`
      SELECT ci.product_id, ci.quantity, ci.price_when_added,
             p.title, p.price_amd, p.stock, p.is_published, p.seller_id
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ?
      ORDER BY p.seller_id, p.id`).all(buyerId);
    if (lines.length === 0) throw badRequest('Your cart is empty.');

    // 1. Prices must match what the buyer saw when adding to the cart.
    const changed = lines.filter((l) => l.price_amd !== l.price_when_added);
    if (changed.length) {
      throw conflict('PRICE_CHANGED',
        changed.map((l) => `The price of "${l.title}" changed from ${l.price_when_added} to ${l.price_amd} AMD.`).join(' '),
        { items: changed.map((l) => ({ productId: l.product_id, title: l.title, oldPriceAmd: l.price_when_added, newPriceAmd: l.price_amd })) });
    }
    for (const l of lines) {
      if (!l.is_published) throw conflict('UNAVAILABLE', `"${l.title}" is no longer available.`, { productId: l.product_id });
      if (l.seller_id === buyerId) throw forbidden('You cannot buy your own product.');
    }

    // 2. Reserve stock atomically. The WHERE stock >= ? guard + changes check
    //    is what makes overselling impossible.
    const takeStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? AND is_published = 1');
    for (const l of lines) {
      const res = takeStock.run(l.quantity, l.product_id, l.quantity);
      if (res.changes !== 1) {
        throw conflict('OUT_OF_STOCK', `Not enough stock left for "${l.title}".`, { productId: l.product_id, title: l.title });
      }
    }

    // 3. Create the order, copying the address, titles and prices.
    const total = lines.reduce((s, l) => s + l.price_amd * l.quantity, 0);
    const now = new Date().toISOString();
    const orderId = db.prepare(`
      INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd, request_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(buyerId, addr.recipient, addr.phone, addr.region, addr.city, addr.street, addr.apartment, addr.note, total, requestKey, now)
      .lastInsertRowid;

    const bySeller = new Map();
    for (const l of lines) {
      if (!bySeller.has(l.seller_id)) bySeller.set(l.seller_id, []);
      bySeller.get(l.seller_id).push(l);
    }
    const insSo = db.prepare('INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd, updated_at) VALUES (?, ?, \'placed\', ?, ?)');
    const insItem = db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, ?, ?, ?, ?)');
    const insHist = db.prepare('INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at) VALUES (?, NULL, \'placed\', ?, ?)');
    for (const [sellerId, items] of bySeller) {
      const subtotal = items.reduce((s, l) => s + l.price_amd * l.quantity, 0);
      const soId = insSo.run(orderId, sellerId, subtotal, now).lastInsertRowid;
      for (const l of items) insItem.run(soId, l.product_id, l.title, l.price_amd, l.quantity);
      insHist.run(soId, buyerId, now);
    }

    // 4. Empty the cart.
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(buyerId);
    return { orderId, buyerId, duplicate: false };
  });

  // POST /orders — signed in
  r.post('/orders', requireUser, h((req, res) => {
    const v = new V(req.body)
      .str('requestKey', { label: 'Request key', min: 8, max: 100, pattern: /^[A-Za-z0-9_-]+$/ })
      .str('recipient', { label: 'Recipient name', max: 100 })
      .str('phone', { label: 'Phone', max: 30, pattern: PHONE, patternMsg: 'Enter a valid phone number, e.g. +374 91 123456.' })
      .oneOf('region', REGIONS, { label: 'Region' })
      .str('city', { label: 'City or village', max: 100 })
      .str('street', { label: 'Street and building', max: 200 })
      .str('apartment', { label: 'Apartment', max: 50, optional: true })
      .str('note', { label: 'Note', max: 500, optional: true })
      .done();

    let result;
    try {
      result = checkout.immediate(req.user.id, v, v.requestKey);
    } catch (e) {
      // Two identical requests racing: the UNIQUE(request_key) constraint wins.
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' && /request_key/.test(e.message)) {
        const ex = findByKey.get(v.requestKey);
        result = { orderId: ex.id, buyerId: ex.buyer_id, duplicate: true };
      } else throw e;
    }
    if (result.buyerId !== req.user.id) throw conflict('REQUEST_KEY_USED', 'This request key was already used.');
    res.status(result.duplicate ? 200 : 201).json({ order: loadBuyerOrder(result.orderId, req.user.id), duplicate: result.duplicate });
  }));

  // ---------------------------------------------------------------- buyer orders
  function loadBuyerOrder(orderId, buyerId) {
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(orderId, buyerId);
    if (!o) return null;
    const parts = db.prepare(`
      SELECT so.*, u.store_name FROM seller_orders so JOIN users u ON u.id = so.seller_id
      WHERE so.order_id = ? ORDER BY so.id`).all(o.id);
    const itemsStmt = db.prepare(`
      SELECT oi.*, (SELECT file_path FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY position LIMIT 1) AS main_image,
             EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = oi.product_id AND r.buyer_id = ?) AS reviewed
      FROM order_items oi WHERE oi.seller_order_id = ? ORDER BY oi.id`);
    return {
      id: o.id,
      createdAt: o.created_at,
      totalAmd: o.total_amd,
      address: {
        recipient: o.recipient, phone: o.phone, region: o.region, city: o.city,
        street: o.street, apartment: o.apartment, note: o.note,
      },
      sellerOrders: parts.map((so) => ({
        id: so.id,
        sellerId: so.seller_id,
        storeName: so.store_name,
        status: so.status,
        subtotalAmd: so.subtotal_amd,
        updatedAt: so.updated_at,
        canCancel: BUYER_MOVES[so.status].includes('cancelled'),
        items: itemsStmt.all(buyerId, so.id).map((i) => ({
          id: i.id,
          productId: i.product_id,
          title: i.title,
          unitPriceAmd: i.unit_price_amd,
          quantity: i.quantity,
          lineTotalAmd: i.unit_price_amd * i.quantity,
          image: imageUrls(i.main_image),
          reviewed: !!i.reviewed,
          canReview: so.status === 'delivered' && !i.reviewed,
        })),
        history: historyFor(db, so.id),
      })),
    };
  }

  // GET /orders — owner
  r.get('/orders', requireUser, (req, res) => {
    const orders = db.prepare('SELECT id, created_at, total_amd FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 200').all(req.user.id);
    const partsStmt = db.prepare(`SELECT so.id, so.status, so.subtotal_amd, u.store_name
      FROM seller_orders so JOIN users u ON u.id = so.seller_id WHERE so.order_id = ? ORDER BY so.id`);
    const countStmt = db.prepare(`SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi
      JOIN seller_orders so ON so.id = oi.seller_order_id WHERE so.order_id = ?`).pluck();
    res.json({
      orders: orders.map((o) => ({
        id: o.id,
        createdAt: o.created_at,
        totalAmd: o.total_amd,
        itemCount: countStmt.get(o.id),
        sellerOrders: partsStmt.all(o.id).map((p) => ({ id: p.id, status: p.status, subtotalAmd: p.subtotal_amd, storeName: p.store_name })),
      })),
    });
  });

  // GET /orders/:id — owner only (scoped by buyer_id; others get 404)
  r.get('/orders/:id', requireUser, h((req, res) => {
    const order = loadBuyerOrder(positiveIntParam(req.params.id), req.user.id);
    if (!order) throw notFound('Order not found.');
    res.json({ order });
  }));

  // POST /orders/:id/sellers/:sellerOrderId/cancel — owner, while placed or confirmed
  r.post('/orders/:id/sellers/:sellerOrderId/cancel', requireUser, h((req, res) => {
    const orderId = positiveIntParam(req.params.id);
    const soId = positiveIntParam(req.params.sellerOrderId);
    const belongs = db.prepare(`SELECT 1 FROM seller_orders so JOIN orders o ON o.id = so.order_id
      WHERE so.id = ? AND so.order_id = ? AND o.buyer_id = ?`).get(soId, orderId, req.user.id);
    if (!belongs) throw notFound('Order not found.');
    changeStatus(db, { sellerOrderId: soId, to: 'cancelled', actorId: req.user.id, moves: BUYER_MOVES, scope: 'buyer' });
    res.json({ order: loadBuyerOrder(orderId, req.user.id) });
  }));

  // ---------------------------------------------------------------- reviews
  // POST /products/:id/reviews — buyer with a delivered item, one per product
  r.post('/products/:id/reviews', requireUser, h((req, res) => {
    const productId = positiveIntParam(req.params.id);
    const v = new V(req.body)
      .int('rating', { label: 'Rating', min: 1, max: 5 })
      .str('body', { label: 'Review', max: 2000, optional: true })
      .done();

    const review = db.transaction(() => {
      const delivered = db.prepare(`
        SELECT 1 FROM order_items oi
        JOIN seller_orders so ON so.id = oi.seller_order_id
        JOIN orders o ON o.id = so.order_id
        WHERE oi.product_id = ? AND o.buyer_id = ? AND so.status = 'delivered' LIMIT 1`).get(productId, req.user.id);
      if (!delivered) throw forbidden('You can review a product only after it was delivered to you.');
      let id;
      try {
        id = db.prepare('INSERT INTO reviews (product_id, buyer_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(productId, req.user.id, v.rating, v.body, new Date().toISOString()).lastInsertRowid;
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('ALREADY_REVIEWED', 'You already reviewed this product.');
        throw e;
      }
      db.prepare(`UPDATE products SET
          rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?),
          rating_avg   = (SELECT AVG(rating) FROM reviews WHERE product_id = ?)
        WHERE id = ?`).run(productId, productId, productId);
      return { id };
    }).immediate();

    const p = db.prepare('SELECT rating_avg, rating_count FROM products WHERE id = ?').get(productId);
    res.status(201).json({ review: { id: review.id, rating: v.rating, body: v.body }, ratingAvg: Math.round(p.rating_avg * 10) / 10, ratingCount: p.rating_count });
  }));

  return r;
}
