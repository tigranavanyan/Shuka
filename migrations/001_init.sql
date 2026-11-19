-- 001_init.sql — Shuka schema: ten STRICT tables.
-- Money is always INTEGER dram. Dates are ISO-8601 TEXT. Booleans are 0/1.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  store_name    TEXT    UNIQUE COLLATE NOCASE,          -- NULL until the user becomes a seller
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE products (
  id           INTEGER PRIMARY KEY,
  seller_id    INTEGER NOT NULL REFERENCES users(id),
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  price_amd    INTEGER NOT NULL CHECK (price_amd > 0),
  stock        INTEGER NOT NULL CHECK (stock >= 0),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  rating_avg   REAL    NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX idx_products_browse ON products (category_id, is_published, created_at);
CREATE INDEX idx_products_seller ON products (seller_id);

CREATE TABLE product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path  TEXT    NOT NULL,          -- file name inside uploads/{large,thumb}/
  position   INTEGER NOT NULL,          -- 0 = main image
  UNIQUE (product_id, position)
) STRICT;

CREATE TABLE cart_items (
  user_id          INTEGER NOT NULL REFERENCES users(id),
  product_id       INTEGER NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  price_when_added INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_id)
) STRICT;

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  buyer_id    INTEGER NOT NULL REFERENCES users(id),
  recipient   TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  region      TEXT    NOT NULL,
  city        TEXT    NOT NULL,
  street      TEXT    NOT NULL,
  apartment   TEXT    NOT NULL DEFAULT '',
  note        TEXT    NOT NULL DEFAULT '',
  total_amd   INTEGER NOT NULL CHECK (total_amd > 0),
  request_key TEXT    NOT NULL UNIQUE,  -- stops double orders
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX idx_orders_buyer ON orders (buyer_id, created_at);

CREATE TABLE seller_orders (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  seller_id    INTEGER NOT NULL REFERENCES users(id),
  status       TEXT    NOT NULL DEFAULT 'placed'
               CHECK (status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  subtotal_amd INTEGER NOT NULL CHECK (subtotal_amd > 0),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (order_id, seller_id)
) STRICT;
CREATE INDEX idx_seller_orders_seller_status ON seller_orders (seller_id, status);

CREATE TABLE order_items (
  id              INTEGER PRIMARY KEY,
  seller_order_id INTEGER NOT NULL REFERENCES seller_orders(id),
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title           TEXT    NOT NULL,     -- copied at purchase time
  unit_price_amd  INTEGER NOT NULL CHECK (unit_price_amd > 0),
  quantity        INTEGER NOT NULL CHECK (quantity > 0)
) STRICT;
CREATE INDEX idx_order_items_seller_order ON order_items (seller_order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

CREATE TABLE status_history (
  id              INTEGER PRIMARY KEY,
  seller_order_id INTEGER NOT NULL REFERENCES seller_orders(id),
  from_status     TEXT,                 -- NULL for the initial 'placed' row
  to_status       TEXT    NOT NULL,
  changed_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX idx_status_history_so ON status_history (seller_order_id);

-- status_history is insert-only.
CREATE TRIGGER status_history_no_update BEFORE UPDATE ON status_history
BEGIN SELECT RAISE(ABORT, 'status_history is insert-only'); END;
CREATE TRIGGER status_history_no_delete BEFORE DELETE ON status_history
BEGIN SELECT RAISE(ABORT, 'status_history is insert-only'); END;

CREATE TABLE reviews (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  buyer_id   INTEGER NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, buyer_id)
) STRICT;
CREATE INDEX idx_reviews_product ON reviews (product_id, created_at);
