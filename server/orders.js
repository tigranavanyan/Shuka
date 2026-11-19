import { conflict, notFound } from './errors.js';

/**
 * The single source of truth for status moves. Anything not listed returns 409.
 *   placed → confirmed → shipped → delivered
 *   placed | confirmed → cancelled (stock restored)
 */
export const SELLER_MOVES = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
export const BUYER_MOVES = {
  placed: ['cancelled'],
  confirmed: ['cancelled'],
  shipped: [],
  delivered: [],
  cancelled: [],
};
export const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

/**
 * Move one seller order to `to`. Runs in a single BEGIN IMMEDIATE transaction:
 * re-reads the row, checks the move, updates with a status guard, restores stock
 * on cancel, and appends status_history. `scope` limits the row to its owner.
 */
export function changeStatus(db, { sellerOrderId, to, actorId, moves, scope }) {
  return db.transaction(() => {
    const so = scope === 'seller'
      ? db.prepare('SELECT id, status FROM seller_orders WHERE id = ? AND seller_id = ?').get(sellerOrderId, actorId)
      : db.prepare(`SELECT so.id, so.status FROM seller_orders so JOIN orders o ON o.id = so.order_id
                    WHERE so.id = ? AND o.buyer_id = ?`).get(sellerOrderId, actorId);
    if (!so) throw notFound('Order not found.');

    const allowed = moves[so.status] || [];
    if (!allowed.includes(to)) {
      throw conflict('STATUS_NOT_ALLOWED', `Cannot change an order from "${so.status}" to "${to}".`, {
        from: so.status, to, allowed,
      });
    }

    const now = new Date().toISOString();
    const changed = db.prepare('UPDATE seller_orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
      .run(to, now, so.id, so.status).changes;
    if (changed !== 1) throw conflict('STATUS_NOT_ALLOWED', 'The order changed meanwhile, reload and try again.');

    if (to === 'cancelled') {
      // Return the stock in the same transaction as the status change.
      const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE seller_order_id = ?').all(so.id);
      const restore = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const it of items) restore.run(it.quantity, it.product_id);
    }

    db.prepare(`INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at)
                VALUES (?, ?, ?, ?, ?)`).run(so.id, so.status, to, actorId, now);
    return { id: so.id, from: so.status, to };
  }).immediate();
}

export function historyFor(db, sellerOrderId) {
  return db.prepare(`
    SELECT h.from_status, h.to_status, h.created_at, u.name, h.changed_by
    FROM status_history h JOIN users u ON u.id = h.changed_by
    WHERE h.seller_order_id = ? ORDER BY h.id`).all(sellerOrderId)
    .map((h) => ({ from: h.from_status, to: h.to_status, at: h.created_at, by: h.name, byId: h.changed_by }));
}
