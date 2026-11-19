import { Router } from 'express';
import { h, badRequest, conflict, notFound } from '../errors.js';
import { V, PHONE, positiveIntParam } from '../validate.js';
import { requireUser, requireSeller, publicUser } from '../auth.js';
import { upload, processImage, deleteImageFiles, imageUrls } from '../images.js';
import { SELLER_MOVES, STATUSES, changeStatus, historyFor } from '../orders.js';
import { MAIN_IMAGE_SQL } from './catalog.js';

const MAX_IMAGES = 5;

export default function sellerRoutes(db) {
  const r = Router();

  // POST /seller/activate { storeName, phone } — signed in. Active at once.
  r.post('/seller/activate', requireUser, h((req, res) => {
    if (req.user.store_name) throw conflict('ALREADY_SELLER', 'Your seller account is already active.');
    const v = new V(req.body)
      .str('storeName', { label: 'Store name', min: 2, max: 60 })
      .str('phone', { label: 'Phone', max: 30, pattern: PHONE, patternMsg: 'Enter a valid phone number, e.g. +374 91 123456.' })
      .done();
    try {
      db.prepare('UPDATE users SET store_name = ?, phone = ? WHERE id = ? AND store_name IS NULL').run(v.storeName, v.phone, req.user.id);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw conflict('STORE_NAME_TAKEN', 'This store name is taken.', { fields: { storeName: 'This store name is taken.' } });
      }
      throw e;
    }
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  }));

  r.use('/seller', requireSeller);

  // GET /seller/overview — seller. Plain SQL, scoped to the seller.
  r.get('/seller/overview', (req, res) => {
    const sid = req.user.id;
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(sid)) {
      byStatus[row.status] = row.n;
    }
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    // Revenue = delivered seller orders whose delivery happened in the last 30 days.
    const revenue30 = db.prepare(`
      SELECT COALESCE(SUM(so.subtotal_amd), 0) FROM seller_orders so
      WHERE so.seller_id = ? AND so.status = 'delivered'
        AND (SELECT MAX(h.created_at) FROM status_history h
             WHERE h.seller_order_id = so.id AND h.to_status = 'delivered') >= ?`).pluck().get(sid, since);
    const revenueAll = db.prepare(`SELECT COALESCE(SUM(subtotal_amd), 0) FROM seller_orders
      WHERE seller_id = ? AND status = 'delivered'`).pluck().get(sid);
    const products = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(is_published), 0) AS published,
      COALESCE(SUM(CASE WHEN is_published = 1 AND stock = 0 THEN 1 ELSE 0 END), 0) AS sold_out
      FROM products WHERE seller_id = ?`).get(sid);
    res.json({
      overview: {
        toConfirm: byStatus.placed,
        toShip: byStatus.confirmed,
        ordersByStatus: byStatus,
        revenueLast30DaysAmd: revenue30,
        revenueAllTimeAmd: revenueAll,
        products: { total: products.total, published: products.published, soldOut: products.sold_out },
      },
    });
  });

  // ------------------------------------------------------------- products
  const ownProduct = (id, sellerId) => {
    const p = db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(id, sellerId);
    if (!p) throw notFound('Product not found.');
    return p;
  };
  const imagesOf = (id) => db.prepare('SELECT id, file_path, position FROM product_images WHERE product_id = ? ORDER BY position').all(id);

  const editorView = (p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    categoryId: p.category_id,
    priceAmd: p.price_amd,
    stock: p.stock,
    isPublished: !!p.is_published,
    ratingAvg: p.rating_avg,
    ratingCount: p.rating_count,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    images: imagesOf(p.id).map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) })),
  });

  // GET /seller/products — seller, own products only
  r.get('/seller/products', (req, res) => {
    const rows = db.prepare(`
      SELECT p.*, ${MAIN_IMAGE_SQL} AS main_image, c.name AS category_name,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi
           JOIN seller_orders so ON so.id = oi.seller_order_id
          WHERE oi.product_id = p.id AND so.status != 'cancelled') AS units_sold
      FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.seller_id = ? ORDER BY p.created_at DESC, p.id DESC`).all(req.user.id);
    res.json({
      products: rows.map((p) => ({
        id: p.id, title: p.title, priceAmd: p.price_amd, stock: p.stock, isPublished: !!p.is_published,
        unitsSold: p.units_sold, image: imageUrls(p.main_image), categoryName: p.category_name,
        ratingAvg: Math.round(p.rating_avg * 10) / 10, ratingCount: p.rating_count,
      })),
    });
  });

  r.get('/seller/products/:id', h((req, res) => {
    res.json({ product: editorView(ownProduct(positiveIntParam(req.params.id), req.user.id)) });
  }));

  const productFields = (body, partial) => {
    const opt = { optional: partial };
    const v = new V(body);
    const has = (k) => !partial || body?.[k] !== undefined;
    if (has('title')) v.str('title', { label: 'Title', min: 3, max: 120 });
    if (has('description')) v.str('description', { label: 'Description', min: 10, max: 5000 });
    if (has('categoryId')) v.int('categoryId', { label: 'Category', min: 1, ...opt });
    if (has('priceAmd')) v.int('priceAmd', { label: 'Price', min: 1, max: 100_000_000, ...opt });
    if (has('stock')) v.int('stock', { label: 'Stock', min: 0, max: 100_000, ...opt });
    v.bool('isPublished');
    const out = v.done();
    if (out.categoryId !== undefined && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(out.categoryId)) {
      throw badRequest('Choose a valid category.', { fields: { categoryId: 'Choose a valid category.' } });
    }
    return out;
  };

  // POST /seller/products — seller. Created unpublished until it has at least one image.
  r.post('/seller/products', h((req, res) => {
    const v = productFields(req.body, false);
    if (v.isPublished) {
      throw badRequest('Add at least one image before publishing.', { fields: { images: 'Add at least one image before publishing.' } });
    }
    const now = new Date().toISOString();
    const id = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(req.user.id, v.categoryId, v.title, v.description, v.priceAmd, v.stock, now, now).lastInsertRowid;
    res.status(201).json({ product: editorView(ownProduct(id, req.user.id)) });
  }));

  // PATCH /seller/products/:id — seller, own product only. Editing never touches past orders.
  r.patch('/seller/products/:id', h((req, res) => {
    const id = positiveIntParam(req.params.id);
    const v = productFields(req.body, true);
    const imageOrder = req.body?.imageOrder;
    db.transaction(() => {
      const p = ownProduct(id, req.user.id);
      const imgs = imagesOf(id);
      if (v.isPublished === true && imgs.length === 0) {
        throw badRequest('Add at least one image before publishing.', { fields: { images: 'Add at least one image before publishing.' } });
      }
      const sets = [];
      const params = [];
      const map = { title: 'title', description: 'description', categoryId: 'category_id', priceAmd: 'price_amd', stock: 'stock' };
      for (const [k, col] of Object.entries(map)) {
        if (v[k] !== undefined) { sets.push(`${col} = ?`); params.push(v[k]); }
      }
      if (v.isPublished !== undefined) { sets.push('is_published = ?'); params.push(v.isPublished ? 1 : 0); }
      if (sets.length) {
        sets.push('updated_at = ?');
        params.push(new Date().toISOString());
        db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ? AND seller_id = ?`).run(...params, p.id, req.user.id);
      }
      if (imageOrder !== undefined) {
        const ids = imgs.map((i) => i.id).sort((a, b) => a - b);
        const given = Array.isArray(imageOrder) ? imageOrder.map(Number) : [];
        if (given.length !== ids.length || [...given].sort((a, b) => a - b).some((x, i) => x !== ids[i])) {
          throw badRequest('imageOrder must list every image of the product once.');
        }
        const setPos = db.prepare('UPDATE product_images SET position = ? WHERE id = ? AND product_id = ?');
        given.forEach((imgId, i) => setPos.run(-1 - i, imgId, id)); // temp positions avoid UNIQUE clashes
        given.forEach((imgId, i) => setPos.run(i, imgId, id));
      }
    }).immediate();
    res.json({ product: editorView(ownProduct(id, req.user.id)) });
  }));

  // POST /seller/products/:id/images — seller, own product. Multipart field "images".
  r.post('/seller/products/:id/images', (req, res, next) => {
    // Check ownership before accepting any bytes.
    try { ownProduct(positiveIntParam(req.params.id), req.user.id); } catch (e) { return next(e); }
    next();
  }, upload.array('images', MAX_IMAGES), h(async (req, res) => {
    const id = positiveIntParam(req.params.id);
    const files = req.files || [];
    if (!files.length) throw badRequest('Choose at least one image.');
    const current = imagesOf(id).length;
    if (current + files.length > MAX_IMAGES) {
      throw badRequest(`A product can have at most ${MAX_IMAGES} images (it has ${current}).`);
    }
    // Resize and save files OUTSIDE the transaction — keep transactions short.
    const names = [];
    try {
      for (const f of files) names.push(await processImage(f.buffer, f.originalname));
    } catch (e) {
      names.forEach(deleteImageFiles);
      throw e;
    }
    try {
      db.transaction(() => {
        ownProduct(id, req.user.id);
        const max = db.prepare('SELECT COALESCE(MAX(position), -1) FROM product_images WHERE product_id = ?').pluck().get(id);
        const count = db.prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ?').pluck().get(id);
        if (count + names.length > MAX_IMAGES) throw badRequest(`A product can have at most ${MAX_IMAGES} images.`);
        const ins = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?, ?, ?)');
        names.forEach((n, i) => ins.run(id, n, max + 1 + i));
        db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
      }).immediate();
    } catch (e) {
      names.forEach(deleteImageFiles);
      throw e;
    }
    res.status(201).json({ product: editorView(ownProduct(id, req.user.id)) });
  }));

  // DELETE /seller/products/:id/images?imageId= — seller, own product
  r.delete('/seller/products/:id/images', h((req, res) => {
    const id = positiveIntParam(req.params.id);
    const imageId = positiveIntParam(req.query.imageId ?? req.body?.imageId, 'imageId');
    let removed;
    db.transaction(() => {
      const p = ownProduct(id, req.user.id);
      const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(imageId, id);
      if (!img) throw notFound('Image not found.');
      const count = db.prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ?').pluck().get(id);
      if (p.is_published && count === 1) {
        throw conflict('LAST_IMAGE', 'A published product needs at least one image. Upload another one first or unpublish.');
      }
      db.prepare('DELETE FROM product_images WHERE id = ?').run(imageId);
      // Compact positions so the first remaining image becomes main.
      const rest = db.prepare('SELECT id FROM product_images WHERE product_id = ? ORDER BY position').pluck().all(id);
      const setPos = db.prepare('UPDATE product_images SET position = ? WHERE id = ?');
      rest.forEach((rid, i) => setPos.run(-1 - i, rid));
      rest.forEach((rid, i) => setPos.run(i, rid));
      removed = img.file_path;
    }).immediate();
    deleteImageFiles(removed);
    res.json({ product: editorView(ownProduct(id, req.user.id)) });
  }));

  // ------------------------------------------------------------- orders
  // GET /seller/orders?status= — seller, own orders only, newest first, with counts per status
  r.get('/seller/orders', h((req, res) => {
    const status = req.query.status || '';
    if (status && !STATUSES.includes(status)) throw badRequest('Unknown status.');
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(req.user.id)) {
      counts[row.status] = row.n;
    }
    const rows = db.prepare(`
      SELECT so.id, so.order_id, so.status, so.subtotal_amd, so.updated_at, o.created_at,
             o.recipient, o.city, o.region,
             (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE seller_order_id = so.id) AS item_count
      FROM seller_orders so JOIN orders o ON o.id = so.order_id
      WHERE so.seller_id = ? ${status ? 'AND so.status = ?' : ''}
      ORDER BY o.created_at DESC, so.id DESC LIMIT 500`).all(...(status ? [req.user.id, status] : [req.user.id]));
    res.json({
      counts,
      orders: rows.map((r) => ({
        id: r.id, orderId: r.order_id, status: r.status, subtotalAmd: r.subtotal_amd, createdAt: r.created_at,
        updatedAt: r.updated_at, recipient: r.recipient, city: r.city, region: r.region, itemCount: r.item_count,
      })),
    });
  }));

  const loadSellerOrder = (id, sellerId) => {
    // Scoped: WHERE so.id = ? AND so.seller_id = ?
    const so = db.prepare(`
      SELECT so.*, o.recipient, o.phone, o.region, o.city, o.street, o.apartment, o.note, o.created_at,
             u.name AS buyer_name, u.phone AS buyer_account_phone
      FROM seller_orders so JOIN orders o ON o.id = so.order_id JOIN users u ON u.id = o.buyer_id
      WHERE so.id = ? AND so.seller_id = ?`).get(id, sellerId);
    if (!so) throw notFound('Order not found.');
    const items = db.prepare(`SELECT oi.*, (SELECT file_path FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY position LIMIT 1) AS main_image
      FROM order_items oi WHERE oi.seller_order_id = ? ORDER BY oi.id`).all(so.id);
    return {
      id: so.id,
      orderId: so.order_id,
      status: so.status,
      createdAt: so.created_at,
      updatedAt: so.updated_at,
      subtotalAmd: so.subtotal_amd,
      cashToCollectAmd: so.status === 'cancelled' ? 0 : so.subtotal_amd,
      allowedMoves: SELLER_MOVES[so.status],
      buyer: { name: so.buyer_name, accountPhone: so.buyer_account_phone },
      delivery: {
        recipient: so.recipient, phone: so.phone, region: so.region, city: so.city,
        street: so.street, apartment: so.apartment, note: so.note,
      },
      items: items.map((i) => ({
        id: i.id, productId: i.product_id, title: i.title, unitPriceAmd: i.unit_price_amd,
        quantity: i.quantity, lineTotalAmd: i.unit_price_amd * i.quantity, image: imageUrls(i.main_image),
      })),
      history: historyFor(db, so.id),
    };
  };

  // GET /seller/orders/:id — seller, own orders only
  r.get('/seller/orders/:id', h((req, res) => {
    res.json({ order: loadSellerOrder(positiveIntParam(req.params.id), req.user.id) });
  }));

  // POST /seller/orders/:id/status { to } — the only way to change a status
  r.post('/seller/orders/:id/status', h((req, res) => {
    const id = positiveIntParam(req.params.id);
    const to = req.body?.to;
    if (!STATUSES.includes(to)) throw badRequest(`"to" must be one of: ${STATUSES.join(', ')}.`);
    changeStatus(db, { sellerOrderId: id, to, actorId: req.user.id, moves: SELLER_MOVES, scope: 'seller' });
    res.json({ order: loadSellerOrder(id, req.user.id) });
  }));

  return r;
}

