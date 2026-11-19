import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, UPLOADS_DIR, IS_PROD } from './config.js';
import { loadUser, sameOriginWrites } from './auth.js';
import { errorHandler, notFound } from './errors.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import sellerRoutes from './routes/seller.js';

/** One process: JSON API under /api, uploaded images, and the built SPA. */
export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (IS_PROD) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/healthz', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(sameOriginWrites);
  api.use(loadUser(db));
  api.use(authRoutes(db));
  api.use(catalogRoutes(db));
  api.use(cartRoutes(db));
  api.use(orderRoutes(db));
  api.use(sellerRoutes(db));
  api.use((req, res, next) => next(notFound('No such endpoint.')));
  api.use(errorHandler);
  app.use('/api', api);

  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));
  app.use('/uploads', (err, req, res, _next) => res.status(404).end());

  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('Frontend not built. Run `npm run build` or use `npm run dev`.'));
  }
  return app;
}
