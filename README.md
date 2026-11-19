# Shuka — Amazon-style marketplace for Armenia

Anyone can register, sell products and buy from several sellers in one cart.
Prices are in AMD, delivery is inside Armenia, and payment is **cash on delivery**.

One Node.js process serves the REST JSON API, the uploaded images and the built
React frontend, and reads one SQLite file.

| Part | Tech |
|---|---|
| Frontend | React 18 + Vite + React Router (responsive, works on a phone) |
| Backend | Node.js 20+ / Express, every permission checked on the server |
| Database | SQLite via better-sqlite3 — WAL, `foreign_keys = ON`, 5 s busy timeout, STRICT tables |
| Images | multer (memory, 5 MB limit) + sharp → 1200 px large + 400 px thumbnail WebP in `uploads/` |
| Auth | bcrypt-hashed passwords, signed httpOnly session cookie |

## Run it locally — one command

```bash
npm install && npm run local
```

Open <http://localhost:3000>. This builds the frontend, applies migrations, seeds
demo data on first run (10 categories, 3 sellers, 2 buyers, 45 products with
images, a few orders and reviews) and starts the server.

For development with hot reload: `npm run dev` → <http://localhost:5173>.

**Demo accounts** (password `shuka12345`):

| Email | Role |
|---|---|
| ani@shuka.am | seller — Ani Home & Craft |
| tigran@shuka.am | seller — TechPoint Yerevan |
| lilit@shuka.am | seller — Lilit Market |
| buyer1@shuka.am, buyer2@shuka.am | buyers |

Other scripts: `npm run seed:reset` (wipe and reseed), `npm run migrate`,
`npm run backup`, `npm test`.

## Project layout

```
migrations/001_init.sql   the ten tables (numbered .sql files, applied by scripts/migrate.js)
server/
  index.js                entry point: migrate, listen, schedule the daily backup
  app.js                  Express app: /api, /uploads, built SPA
  db.js                   connection pragmas + migration runner
  auth.js                 session cookie, requireUser / requireSeller, same-origin check
  orders.js               the allowed status moves + changeStatus() transaction
  images.js               upload limits, content check, resize, file storage
  routes/                 auth, catalog, cart, orders (checkout + reviews), seller
scripts/                  migrate, seed, backup, dev, breakit-live
client/src/               React app: pages/ (storefront) and seller/ (dashboard)
tests/                    break-it tests (node:test) against real server processes
```

## How the hard parts are handled

| # | Problem | Where | How |
|---|---|---|---|
| 1 | Overselling | `server/routes/orders.js` (checkout) | The whole checkout is one `BEGIN IMMEDIATE` transaction in plain SQL. Stock is taken with `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?` and the changed-row count is checked; any failure throws, rolling back the whole order, and returns 409 naming the product. Cancelling restores stock inside the same transaction as the status change (`server/orders.js`). |
| 2 | "Database is locked" | `server/db.js` | `journal_mode = WAL`, `busy_timeout = 5000`. Transactions contain only SQL — image resizing and file writes happen before the transaction starts. |
| 3 | Prices change after purchase | checkout + `order_items` | Title and unit price are copied into `order_items`, the address into `orders`. `cart_items.price_when_added` is compared with the current price; if it differs checkout returns 409 `PRICE_CHANGED` with the new price, and the cart shows "Accept new price". |
| 4 | One cart, many sellers | checkout | One `orders` row, one `seller_orders` row per seller, each with its own status and history. |
| 5 | Status changes not allowed | `server/orders.js` | `SELLER_MOVES` / `BUYER_MOVES` lists. Anything else → 409. `POST /seller/orders/:id/status` is the only way to change a status, and the update is guarded with `WHERE status = <old>`. Every move inserts a `status_history` row (a trigger makes the table insert-only). |
| 6 | Seeing other people's data | all seller/buyer queries | Every query is scoped: `WHERE so.id = ? AND so.seller_id = ?`, `WHERE id = ? AND buyer_id = ?`. Other users get 404. |
| 7 | Double checkout | checkout page + `orders.request_key UNIQUE` | The page creates one random key per attempt and the button locks after one click. A repeat with the same key returns the existing order (200) instead of creating a new one. |
| 8 | Broken references | `server/db.js`, schema | `PRAGMA foreign_keys = ON` on every connection; `order_items.product_id … ON DELETE RESTRICT`; sellers unpublish, there is no product delete. |
| 9 | Images | `server/images.js` | MIME allow-list, 5 MB limit, the real content is decoded by sharp (a renamed .exe fails), resized to large + thumbnail WebP files; only the file name is stored in SQLite. |

Order lifecycle (per seller order):

```
placed ──seller──▶ confirmed ──seller──▶ shipped ──seller──▶ delivered
   │                   │
   └──buyer/seller──▶ cancelled ◀──buyer/seller──┘      (stock restored)
```

## Break-it tests

```bash
npm test
```

Starts **two** server processes on the same temporary database file (so the
locking is real, not just Node's single thread) and runs:

| Test | Expected | Result |
|---|---|---|
| Last units — stock 3, 30 simultaneous checkouts | 3 × 201, 27 × 409, stock 0, no lock errors | ✅ |
| Double click — same request key twice | one order | ✅ |
| Price changed — seller raises price after add-to-cart | 409 with the new price | ✅ |
| Old order after edit | old title and price kept | ✅ |
| Someone else's order (seller and buyer) | 404, no data | ✅ |
| Move not allowed — placed→delivered, buyer cancels shipped | 409, nothing changed | ✅ |
| Cancel returns stock | stock back up | ✅ |
| Foreign keys — order item for missing product | rejected by SQLite | ✅ |
| Bad upload — 30 MB file and renamed .exe | 400 with a clear message | ✅ |

Plus permission checks and the full teacher demo flow (`tests/permissions.test.js`).

To run the two concurrency tests against the **live** site:

```bash
npm run breakit:live -- https://your-app.fly.dev
```

## Deploy: frontend on Netlify, backend on Render

- **Render** runs the API + SQLite + uploads (`render.yaml`). It needs a paid
  instance (Starter) with a persistent disk mounted at `/var/data` — Free
  web services cannot keep files. Env: `NODE_ENV=production`, `NODE_VERSION=22`,
  `DATA_DIR=/var/data`, `SESSION_SECRET=<random>`, `FRONTEND_ORIGIN=https://<site>.netlify.app`.
  Build `npm ci`, start `npm run start:render` (migrates, seeds once if empty, starts).
- **Netlify** serves the built React app (`netlify.toml`) and proxies `/api/*`
  and `/uploads/*` to Render, so the browser only talks to the Netlify domain
  and the httpOnly cookie stays first-party (works in private windows too).
  Replace `YOUR-RENDER-SERVICE` in `netlify.toml` before deploying.

## Deploy alternative: everything on Fly.io (one process, as in the brief)

Serverless hosts without a disk would lose the database — use a machine with a volume.

```bash
fly launch --no-deploy          # pick a unique app name, then set it in fly.toml
fly volumes create shuka_data --size 1 --region fra
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)
fly deploy
fly ssh console -C "node scripts/seed.js --if-empty"   # demo data, once
```

`fly.toml` mounts the volume at `/data` (`DATA_DIR`), keeps exactly one machine
running (SQLite is single-writer) and health-checks `/healthz`. Fly terminates
HTTPS. A `render.yaml` is included for Render with a persistent disk as an
alternative. Secrets live only in environment variables (see `.env.example`).

**Backups.** The server writes `VACUUM INTO /data/backups/shuka-<timestamp>.db`
once a day and keeps the newest 14 (`BACKUP_KEEP`). Run one by hand with
`npm run backup`. To keep a copy off the machine:
`fly ssh sftp get /data/backups/<file>`.

## API

Errors always look like `{ "error": { "code", "message", "details"? } }` with
400 invalid input, 401 signed out, 403 not allowed, 404 not found, 409 conflict.
All paths are under `/api`.

| Endpoint | Who |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | anyone |
| `GET /me` (guest gets `{user:null}`), `PATCH /me` | signed in |
| `GET /categories`, `GET /products?q=&category=&minPrice=&maxPrice=&sort=&page=`, `GET /products/:id`, `GET /products/:id/reviews` | anyone |
| `GET /cart`, `PUT /cart/items/:productId {quantity}`, `DELETE /cart/items/:productId` | signed in |
| `POST /orders {requestKey, recipient, phone, region, city, street, apartment, note}` | signed in |
| `GET /orders`, `GET /orders/:id`, `POST /orders/:id/sellers/:sellerOrderId/cancel` | owner |
| `POST /products/:id/reviews {rating, body}` | buyer with a delivered item |
| `POST /seller/activate {storeName, phone}` | signed in |
| `GET /seller/overview` | seller |
| `GET/POST /seller/products`, `GET/PATCH /seller/products/:id`, `POST /seller/products/:id/images` (multipart `images`), `DELETE /seller/products/:id/images?imageId=` | seller, own products |
| `GET /seller/orders?status=`, `GET /seller/orders/:id`, `POST /seller/orders/:id/status {to}` | seller, own orders |

`PATCH /seller/products/:id` also accepts `isPublished` and `imageOrder: [imageId, …]`
(first = main image). `sort` is one of `newest`, `price_asc`, `price_desc`, `rating`.

## Notes on choices

- Sessions are a signed cookie (`userId.expiry.hmac`) so the schema stays at the
  ten tables in the brief; logging out clears the cookie. `schema_migrations`
  is the migration runner's bookkeeping table.
- Cookie auth is protected against CSRF by `SameSite=Lax` and by rejecting
  state-changing requests whose `Origin` is another site.
- `rating_avg` is recomputed from `reviews` in the same transaction as the insert.
- Revenue counts delivered seller orders whose `delivered` history row is in the last 30 days.
