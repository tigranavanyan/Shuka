import { Router } from 'express';
import { h, notFound, badRequest } from '../errors.js';
import { positiveIntParam } from '../validate.js';
import { imageUrls } from '../images.js';
import { PAGE_SIZE } from '../config.js';

export const MAIN_IMAGE_SQL =
  '(SELECT file_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1)';

export const productCard = (row) => ({
  id: row.id,
  title: row.title,
  priceAmd: row.price_amd,
  stock: row.stock,
  ratingAvg: Math.round(row.rating_avg * 10) / 10,
  ratingCount: row.rating_count,
  image: imageUrls(row.main_image),
  category: row.category_slug ? { slug: row.category_slug, name: row.category_name } : undefined,
  storeName: row.store_name,
  createdAt: row.created_at,
});

const SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price_amd ASC, p.id DESC',
  price_desc: 'p.price_amd DESC, p.id DESC',
  rating: 'p.rating_avg DESC, p.rating_count DESC, p.id DESC',
};

const optionalAmount = (v, name) => {
  if (v === undefined || v === '') return null;
  if (!/^\d+$/.test(String(v))) throw badRequest(`${name} must be a whole number of dram.`);
  return Number(v);
};

export default function catalogRoutes(db) {
  const r = Router();

  // GET /categories — anyone
  r.get('/categories', (req, res) => {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.slug,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_published = 1) AS product_count
      FROM categories c ORDER BY c.name`).all();
    res.json({ categories: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, productCount: c.product_count })) });
  });

  // GET /products?q=&category=&minPrice=&maxPrice=&sort=&page= — anyone
  r.get('/products', h((req, res) => {
    const { q = '', category = '', sort = 'newest' } = req.query;
    const minPrice = optionalAmount(req.query.minPrice, 'minPrice');
    const maxPrice = optionalAmount(req.query.maxPrice, 'maxPrice');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    if (!SORTS[sort]) throw badRequest('Unknown sort.');

    const where = ['p.is_published = 1'];
    const params = [];
    const term = String(q).trim().slice(0, 100);
    if (term) {
      // Every word must appear in the title or description.
      for (const word of term.split(/\s+/).slice(0, 8)) {
        const like = `%${word.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        where.push("(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
        params.push(like, like);
      }
    }
    let cat = null;
    if (category) {
      cat = db.prepare('SELECT id, name, slug FROM categories WHERE slug = ? OR CAST(id AS TEXT) = ?').get(String(category), String(category));
      if (!cat) throw notFound('Category not found.');
      where.push('p.category_id = ?');
      params.push(cat.id);
    }
    if (minPrice !== null) { where.push('p.price_amd >= ?'); params.push(minPrice); }
    if (maxPrice !== null) { where.push('p.price_amd <= ?'); params.push(maxPrice); }

    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) FROM products p WHERE ${whereSql}`).pluck().get(...params);
    const rows = db.prepare(`
      SELECT p.*, ${MAIN_IMAGE_SQL} AS main_image, u.store_name, c.slug AS category_slug, c.name AS category_name
      FROM products p
      JOIN users u ON u.id = p.seller_id
      JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql}
      ORDER BY ${SORTS[sort]}
      LIMIT ? OFFSET ?`).all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);

    res.json({
      items: rows.map(productCard),
      total,
      page,
      pageSize: PAGE_SIZE,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      category: cat,
    });
  }));

  // GET /products/:id — anyone (unpublished products are visible only to their seller)
  r.get('/products/:id', h((req, res) => {
    const id = positiveIntParam(req.params.id);
    const p = db.prepare(`
      SELECT p.*, u.store_name, c.slug AS category_slug, c.name AS category_name
      FROM products p JOIN users u ON u.id = p.seller_id JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?`).get(id);
    if (!p || (!p.is_published && p.seller_id !== req.user?.id)) throw notFound('Product not found.');
    const images = db.prepare('SELECT id, file_path, position FROM product_images WHERE product_id = ? ORDER BY position').all(id);
    res.json({
      product: {
        id: p.id,
        title: p.title,
        description: p.description,
        priceAmd: p.price_amd,
        stock: p.stock,
        isPublished: !!p.is_published,
        ratingAvg: Math.round(p.rating_avg * 10) / 10,
        ratingCount: p.rating_count,
        sellerId: p.seller_id,
        storeName: p.store_name,
        isOwn: p.seller_id === req.user?.id,
        category: { id: p.category_id, slug: p.category_slug, name: p.category_name },
        images: images.map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) })),
        createdAt: p.created_at,
      },
    });
  }));

  // GET /products/:id/reviews — anyone, newest first
  r.get('/products/:id/reviews', h((req, res) => {
    const id = positiveIntParam(req.params.id);
    const exists = db.prepare('SELECT seller_id, is_published FROM products WHERE id = ?').get(id);
    if (!exists || (!exists.is_published && exists.seller_id !== req.user?.id)) throw notFound('Product not found.');
    const rows = db.prepare(`
      SELECT r.id, r.rating, r.body, r.created_at, u.name
      FROM reviews r JOIN users u ON u.id = r.buyer_id
      WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 100`).all(id);
    res.json({
      reviews: rows.map((r) => ({
        id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at,
        author: r.name.split(/\s+/)[0], // first name only
      })),
    });
  }));

  return r;
}
