import { Router } from 'express';
import { h, notFound, forbidden, conflict } from '../errors.js';
import { V, positiveIntParam } from '../validate.js';
import { requireUser } from '../auth.js';
import { imageUrls } from '../images.js';
import { MAIN_IMAGE_SQL } from './catalog.js';

/** Builds the cart view: items grouped by seller, with warnings. Used by GET /cart and checkout. */
export function loadCart(db, userId) {
  const rows = db.prepare(`
    SELECT ci.product_id, ci.quantity, ci.price_when_added,
           p.title, p.price_amd, p.stock, p.is_published, p.seller_id,
           u.store_name, ${MAIN_IMAGE_SQL} AS main_image
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN users u ON u.id = p.seller_id
    WHERE ci.user_id = ?
    ORDER BY u.store_name, p.title`).all(userId);

  const groups = new Map();
  let total = 0;
  let count = 0;
  let problems = 0;
  for (const r of rows) {
    const unavailable = !r.is_published;
    const soldOut = !unavailable && r.stock === 0;
    const notEnoughStock = !unavailable && !soldOut && r.quantity > r.stock;
    const priceChanged = r.price_amd !== r.price_when_added;
    if (unavailable || soldOut || notEnoughStock || priceChanged) problems++;
    const item = {
      productId: r.product_id,
      title: r.title,
      image: imageUrls(r.main_image),
      quantity: r.quantity,
      priceAmd: r.price_amd,
      priceWhenAdded: r.price_when_added,
      lineTotalAmd: r.price_amd * r.quantity,
      stock: r.stock,
      warnings: { priceChanged, soldOut, notEnoughStock, unavailable },
    };
    if (!groups.has(r.seller_id)) {
      groups.set(r.seller_id, { sellerId: r.seller_id, storeName: r.store_name, items: [], subtotalAmd: 0 });
    }
    const g = groups.get(r.seller_id);
    g.items.push(item);
    if (!unavailable && !soldOut) {
      g.subtotalAmd += item.lineTotalAmd;
      total += item.lineTotalAmd;
    }
    count += r.quantity;
  }
  return { groups: [...groups.values()], totalAmd: total, itemCount: count, hasProblems: problems > 0, canCheckout: rows.length > 0 && problems === 0 };
}

export default function cartRoutes(db) {
  const r = Router();
  r.use('/cart', requireUser);

  // GET /cart — signed in
  r.get('/cart', (req, res) => res.json({ cart: loadCart(db, req.user.id) }));

  // PUT /cart/items/:productId { quantity } — signed in. Sets the quantity and
  // refreshes price_when_added to the current price (this is how a buyer accepts a new price).
  r.put('/cart/items/:productId', h((req, res) => {
    const productId = positiveIntParam(req.params.productId, 'product id');
    const { quantity } = new V(req.body).int('quantity', { label: 'Quantity', min: 1, max: 999 }).done();
    const p = db.prepare('SELECT id, seller_id, title, price_amd, stock, is_published FROM products WHERE id = ?').get(productId);
    if (!p || !p.is_published) throw notFound('Product not found.');
    if (p.seller_id === req.user.id) throw forbidden('You cannot buy your own product.');
    if (p.stock === 0) throw conflict('OUT_OF_STOCK', `"${p.title}" is out of stock.`, { productId, stock: 0 });
    if (quantity > p.stock) {
      throw conflict('NOT_ENOUGH_STOCK', `Only ${p.stock} of "${p.title}" left.`, { productId, stock: p.stock });
    }
    db.prepare(`
      INSERT INTO cart_items (user_id, product_id, quantity, price_when_added) VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = excluded.quantity, price_when_added = excluded.price_when_added`)
      .run(req.user.id, productId, quantity, p.price_amd);
    res.json({ cart: loadCart(db, req.user.id) });
  }));

  // DELETE /cart/items/:productId — signed in
  r.delete('/cart/items/:productId', h((req, res) => {
    const productId = positiveIntParam(req.params.productId, 'product id');
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, productId);
    res.json({ cart: loadCart(db, req.user.id) });
  }));

  return r;
}
