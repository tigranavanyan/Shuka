// Seed: categories, 3 sellers, 2 demo buyers, 40+ products with generated images,
// plus a few delivered orders with reviews so ratings and revenue show up.
//   node scripts/seed.js            seed (fails if data exists)
//   node scripts/seed.js --if-empty seed only when there are no users
//   node scripts/seed.js --reset    wipe the database + uploads, then seed
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { openDb, migrate } from '../server/db.js';
import { DB_PATH, UPLOADS_DIR } from '../server/config.js';

const args = new Set(process.argv.slice(2));

if (args.has('--reset')) {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
}

const db = openDb();
migrate(db);
const { processImage } = await import('../server/images.js');

const userCount = db.prepare('SELECT COUNT(*) FROM users').pluck().get();
if (userCount > 0) {
  if (args.has('--if-empty')) {
    console.log('Database already has data — skipping seed.');
    process.exit(0);
  }
  console.error('Database is not empty. Use --reset to wipe and reseed.');
  process.exit(1);
}

const CATEGORIES = [
  ['Electronics', 'electronics', '#1d4ed8'],
  ['Home & Kitchen', 'home-kitchen', '#b45309'],
  ['Clothing', 'clothing', '#be185d'],
  ['Books', 'books', '#4d7c0f'],
  ['Food & Drinks', 'food-drinks', '#b91c1c'],
  ['Handmade & Crafts', 'handmade', '#7c3aed'],
  ['Beauty & Health', 'beauty-health', '#0f766e'],
  ['Sports & Outdoors', 'sports-outdoors', '#15803d'],
  ['Toys & Kids', 'toys-kids', '#c2410c'],
  ['Garden', 'garden', '#3f6212'],
];

const PASSWORD = 'shuka12345';
const SELLERS = [
  { email: 'ani@shuka.am', name: 'Ani Petrosyan', phone: '+374 91 111111', store: 'Ani Home & Craft' },
  { email: 'tigran@shuka.am', name: 'Tigran Hakobyan', phone: '+374 93 222222', store: 'TechPoint Yerevan' },
  { email: 'lilit@shuka.am', name: 'Lilit Sargsyan', phone: '+374 94 333333', store: 'Lilit Market' },
];
const BUYERS = [
  { email: 'buyer1@shuka.am', name: 'Aram Grigoryan', phone: '+374 77 444444' },
  { email: 'buyer2@shuka.am', name: 'Mariam Vardanyan', phone: '+374 98 555555' },
];

// [sellerIndex, categorySlug, title, priceAmd, stock, description]
const PRODUCTS = [
  [1, 'electronics', 'Wireless Earbuds Pro', 18900, 25, 'Bluetooth 5.3 earbuds with active noise cancellation, 30 hours of battery with the case, and USB-C charging.'],
  [1, 'electronics', 'USB-C Fast Charger 65W', 9500, 40, 'Compact GaN charger with two USB-C ports and one USB-A. Charges a laptop and a phone at the same time.'],
  [1, 'electronics', 'Mechanical Keyboard (Armenian layout)', 32000, 8, 'Hot-swappable mechanical keyboard with brown switches and printed Armenian and English legends.'],
  [1, 'electronics', 'Smartwatch Fit 2', 27500, 12, 'Heart rate, sleep tracking, GPS and 7-day battery. Works with Android and iPhone.'],
  [1, 'electronics', 'Portable Power Bank 20000 mAh', 12900, 30, 'Two-way fast charging power bank with a small display that shows the remaining charge.'],
  [1, 'electronics', '4K Action Camera', 45000, 5, 'Waterproof to 30 m with the case, image stabilisation, and a wide-angle lens for hiking and cycling.'],
  [1, 'electronics', 'Wi-Fi 6 Router', 24000, 10, 'Dual-band Wi-Fi 6 router that covers a three-room apartment. Easy setup from your phone.'],
  [1, 'electronics', 'Bluetooth Speaker Mini', 8900, 3, 'Small speaker with a big sound, splash resistant, and a 12-hour battery.'],
  [1, 'sports-outdoors', 'Fitness Tracker Band', 11500, 20, 'Step counter, heart rate and sleep monitoring in a light silicone band.'],
  [1, 'electronics', 'Laptop Stand Aluminium', 7900, 15, 'Adjustable aluminium stand that lifts your laptop to eye level. Folds flat for travel.'],
  [1, 'electronics', 'HD Webcam 1080p', 10500, 18, 'Full HD webcam with a built-in microphone and privacy cover. Plug and play over USB.'],
  [1, 'toys-kids', 'Kids Drawing Tablet', 6500, 22, 'LCD drawing tablet for kids. Draw, then erase with one button. No paper needed.'],
  [1, 'electronics', 'Phone Tripod with Remote', 5200, 35, 'Extendable tripod and selfie stick with a Bluetooth remote.'],
  [1, 'electronics', 'Gaming Mouse RGB', 9900, 14, 'Light gaming mouse with a 16000 DPI sensor and six programmable buttons.'],
  [0, 'handmade', 'Handwoven Armenian Carpet (small)', 85000, 2, 'Hand-knotted wool carpet with a traditional pattern, 80 x 120 cm. Made in Goris.'],
  [0, 'home-kitchen', 'Ceramic Coffee Set (Jazve + 6 cups)', 16500, 9, 'Hand-painted ceramic cups with a copper jazve for Armenian coffee.'],
  [0, 'home-kitchen', 'Copper Jazve Large', 7500, 20, 'Traditional copper coffee pot with a wooden handle, for 4 cups.'],
  [0, 'handmade', 'Pomegranate Wall Decor', 12000, 6, 'Hand-painted wooden wall decoration with pomegranate motifs.'],
  [0, 'handmade', 'Silver Pomegranate Pendant', 22000, 7, 'Sterling silver pendant on a chain, handmade in Yerevan.'],
  [0, 'home-kitchen', 'Lavash Baking Mat', 4500, 25, 'Reusable silicone mat for baking lavash and flatbread at home.'],
  [0, 'handmade', 'Embroidered Table Runner', 9800, 10, 'Cotton table runner with traditional Armenian embroidery, 40 x 160 cm.'],
  [0, 'home-kitchen', 'Clay Tonir Pot', 14000, 4, 'Unglazed clay pot for slow cooking stews and khashlama in the oven.'],
  [0, 'handmade', 'Wooden Backgammon (Nardi) Set', 28000, 5, 'Hand-carved walnut nardi board with dice and pieces.'],
  [0, 'home-kitchen', 'Apricot Wood Cutting Board', 6900, 16, 'Thick apricot wood board, oiled and ready for daily use.'],
  [0, 'garden', 'Terracotta Herb Pots (set of 3)', 5600, 12, 'Small terracotta pots for basil, tarragon and mint on the windowsill.'],
  [0, 'books', 'Armenian Cookbook: Family Recipes', 8500, 14, 'Over 120 home recipes from all regions of Armenia, in English with photos.'],
  [0, 'handmade', 'Felt Slippers (handmade)', 7200, 11, 'Warm wool felt slippers made by hand. Sizes 36 to 44.'],
  [0, 'beauty-health', 'Natural Herbal Soap Set', 4800, 30, 'Six bars of handmade soap with thyme, rose and sea buckthorn.'],
  [2, 'food-drinks', 'Dried Apricots 1 kg', 5500, 50, 'Sun-dried apricots from the Ararat valley, no sugar added.'],
  [2, 'food-drinks', 'Wild Thyme Tea (Urts) 100 g', 2200, 60, 'Mountain thyme hand-picked in Syunik. Brew 5 minutes.'],
  [2, 'food-drinks', 'Gata Sweet Bread', 2800, 20, 'Fresh Armenian gata with a buttery koritz filling. Baked to order.'],
  [2, 'food-drinks', 'Sujukh Walnut Sweet (6 pcs)', 4200, 25, 'Walnuts dipped in thickened grape juice and dried. A classic treat.'],
  [2, 'food-drinks', 'Mountain Honey 500 g', 6500, 18, 'Raw wildflower honey from apiaries in Tavush.'],
  [2, 'food-drinks', 'Armenian Coffee Ground 250 g', 3100, 40, 'Finely ground roasted coffee with cardamom, ready for the jazve.'],
  [2, 'beauty-health', 'Rosehip Oil 30 ml', 5900, 15, 'Cold-pressed rosehip oil for skin and hair.'],
  [2, 'clothing', 'Wool Scarf with Ornament', 9500, 13, 'Soft merino wool scarf with a woven Armenian ornament.'],
  [2, 'clothing', 'Cotton T-shirt "Yerevan"', 6500, 40, 'Organic cotton t-shirt with a minimal Yerevan print. Sizes S–XXL.'],
  [2, 'clothing', 'Knitted Winter Hat', 4500, 3, 'Warm handmade knitted hat with a pompom.'],
  [2, 'books', 'Learn Armenian: Beginner Workbook', 7800, 20, 'Exercises for the Armenian alphabet and everyday phrases.'],
  [2, 'books', 'Children Fairy Tales of Armenia', 6200, 9, 'Illustrated collection of classic Armenian folk tales for kids.'],
  [2, 'toys-kids', 'Wooden Puzzle Alphabet', 5400, 17, 'Wooden puzzle with all 39 letters of the Armenian alphabet.'],
  [2, 'sports-outdoors', 'Hiking Backpack 30 L', 21000, 7, 'Light backpack with a rain cover and hydration sleeve. Great for Aragats.'],
  [2, 'sports-outdoors', 'Yoga Mat Eco', 8800, 0, 'Non-slip natural rubber yoga mat, 6 mm thick.'],
  [2, 'garden', 'Tomato Seeds Heirloom Mix', 1500, 80, 'Seeds from local heirloom tomato varieties. Packet of about 50 seeds.'],
  [2, 'beauty-health', 'Apricot Kernel Face Scrub', 3900, 22, 'Gentle face scrub with ground apricot kernels and honey.'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, max = 18) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Generates a simple illustrated product photo (no network needed). */
async function makeImage(title, color, variant) {
  const lines = wrap(title);
  const shapes = [
    `<rect x="250" y="170" width="300" height="300" rx="48" fill="${color}" opacity="0.92"/>
     <rect x="290" y="210" width="220" height="40" rx="20" fill="white" opacity="0.35"/>`,
    `<circle cx="400" cy="320" r="160" fill="${color}" opacity="0.92"/>
     <circle cx="340" cy="260" r="40" fill="white" opacity="0.35"/>`,
    `<path d="M400 140 L570 460 L230 460 Z" fill="${color}" opacity="0.92"/>
     <circle cx="400" cy="340" r="36" fill="white" opacity="0.35"/>`,
  ];
  const label = ['Front view', 'Detail', 'In use'][variant];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 800 800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbf7f2"/><stop offset="1" stop-color="#efe6da"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/>
    <ellipse cx="400" cy="520" rx="200" ry="26" fill="#000" opacity="0.07"/>
    ${shapes[variant]}
    ${lines.map((l, i) => `<text x="400" y="${590 + i * 50}" font-family="sans-serif" font-size="42" font-weight="600" fill="#2b2118" text-anchor="middle">${esc(l)}</text>`).join('')}
    <text x="40" y="60" font-family="sans-serif" font-size="24" fill="#8a7a6a">${label}</text>
    <text x="760" y="60" font-family="sans-serif" font-size="24" font-weight="700" fill="${color}" text-anchor="end">Shuka</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  return processImage(png, `${title}.jpg`);
}

const hash = bcrypt.hashSync(PASSWORD, 10);
const daysAgo = (d, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000).toISOString();

// --- users and categories
const insCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
const catIds = {};
const catColor = {};
db.transaction(() => {
  for (const [name, slug, color] of CATEGORIES) {
    catIds[slug] = insCat.run(name, slug).lastInsertRowid;
    catColor[slug] = color;
  }
})();

const insUser = db.prepare('INSERT INTO users (email, password_hash, name, phone, store_name, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const sellerIds = SELLERS.map((s) => insUser.run(s.email, hash, s.name, s.phone, s.store, daysAgo(60)).lastInsertRowid);
const buyerIds = BUYERS.map((b) => insUser.run(b.email, hash, b.name, b.phone, null, daysAgo(50)).lastInsertRowid);

// --- products with images (image processing happens outside transactions)
console.log(`Generating images for ${PRODUCTS.length} products...`);
const insProduct = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`);
const insImage = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?, ?, ?)');
const productIds = [];
for (let i = 0; i < PRODUCTS.length; i++) {
  const [si, slug, title, price, stock, desc] = PRODUCTS[i];
  const nImages = 1 + (i % 3);
  const names = [];
  for (let v = 0; v < nImages; v++) names.push(await makeImage(title, catColor[slug], v));
  const created = daysAgo(PRODUCTS.length - i, i % 7);
  db.transaction(() => {
    const id = insProduct.run(sellerIds[si], catIds[slug], title, desc, price, stock, created, created).lastInsertRowid;
    names.forEach((n, pos) => insImage.run(id, n, pos));
    productIds.push(id);
  })();
}

// --- a few historical orders: delivered + reviewed, and some open ones
const addr = (b) => ({ recipient: b.name, phone: b.phone, region: 'Yerevan', city: 'Yerevan', street: 'Abovyan 12', apartment: '5', note: '' });
let keyN = 0;
function seedOrder(buyerIdx, lines, status, ageDays) {
  const buyerId = buyerIds[buyerIdx];
  const a = addr(BUYERS[buyerIdx]);
  return db.transaction(() => {
    const created = daysAgo(ageDays);
    const rows = lines.map(([pIdx, qty]) => {
      const p = db.prepare('SELECT id, seller_id, title, price_amd FROM products WHERE id = ?').get(productIds[pIdx]);
      if (status !== 'cancelled') db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').run(qty, p.id, qty);
      return { ...p, qty };
    });
    const total = rows.reduce((s, r) => s + r.price_amd * r.qty, 0);
    const orderId = db.prepare(`INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd, request_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(buyerId, a.recipient, a.phone, a.region, a.city, a.street, a.apartment, a.note, total, `seed-${++keyN}-xxxxxxxx`, created).lastInsertRowid;
    const bySeller = new Map();
    for (const r of rows) { if (!bySeller.has(r.seller_id)) bySeller.set(r.seller_id, []); bySeller.get(r.seller_id).push(r); }
    const path = ['placed', 'confirmed', 'shipped', 'delivered'];
    for (const [sellerId, items] of bySeller) {
      const sub = items.reduce((s, r) => s + r.price_amd * r.qty, 0);
      const soId = db.prepare('INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(orderId, sellerId, status, sub, daysAgo(Math.max(0, ageDays - 2))).lastInsertRowid;
      for (const r of items) db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, ?, ?, ?, ?)').run(soId, r.id, r.title, r.price_amd, r.qty);
      const hist = db.prepare('INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at) VALUES (?, ?, ?, ?, ?)');
      hist.run(soId, null, 'placed', buyerId, created);
      if (status === 'cancelled') { hist.run(soId, 'placed', 'cancelled', buyerId, daysAgo(ageDays - 0.1)); continue; }
      const upto = path.indexOf(status);
      for (let k = 1; k <= upto; k++) hist.run(soId, path[k - 1], path[k], sellerId, daysAgo(ageDays - k * 0.5));
    }
    return orderId;
  })();
}

seedOrder(0, [[14, 1], [28, 2]], 'delivered', 20);
seedOrder(1, [[0, 1], [15, 1]], 'delivered', 12);
seedOrder(0, [[3, 1], [32, 1]], 'delivered', 8);
seedOrder(1, [[28, 1]], 'shipped', 3);
seedOrder(0, [[1, 1], [35, 2]], 'placed', 1);
seedOrder(1, [[16, 1]], 'confirmed', 2);

const reviews = [
  [0, 14, 5, 'Beautiful carpet, the colours are even better in person.'],
  [0, 28, 4, 'Very tasty apricots, will order again.'],
  [1, 0, 5, 'Great sound and the noise cancelling works well on the metro.'],
  [1, 15, 4, 'Lovely cups, one was slightly chipped but the seller apologised.'],
  [0, 3, 3, 'Good watch but the strap could be softer.'],
  [0, 32, 5, 'Real mountain honey, thick and fragrant.'],
];
db.transaction(() => {
  for (const [b, pIdx, rating, body] of reviews) {
    const pid = productIds[pIdx];
    db.prepare('INSERT INTO reviews (product_id, buyer_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?)').run(pid, buyerIds[b], rating, body, daysAgo(5));
    db.prepare(`UPDATE products SET rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?),
      rating_avg = (SELECT AVG(rating) FROM reviews WHERE product_id = ?) WHERE id = ?`).run(pid, pid, pid);
  }
})();

console.log(`Seeded ${CATEGORIES.length} categories, ${SELLERS.length} sellers, ${BUYERS.length} buyers, ${PRODUCTS.length} products.`);
console.log(`Demo logins (password "${PASSWORD}"):`);
for (const u of [...SELLERS, ...BUYERS]) console.log(`  ${u.email}${u.store ? `  (seller: ${u.store})` : '  (buyer)'}`);
db.close();
