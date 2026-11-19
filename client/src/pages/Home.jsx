import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { ProductCard, Spinner, useTitle } from '../components.jsx';

const ICONS = {
  electronics: '⌁', 'home-kitchen': '☕', clothing: '✂', books: '❦', 'food-drinks': '❀',
  handmade: '✿', 'beauty-health': '❋', 'sports-outdoors': '⛰', 'toys-kids': '✦', garden: '❧',
};

export default function Home() {
  useTitle();
  const { categories, user } = useApp();
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.get('/products?sort=newest').then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);

  return (
    <div className="container page">
      <section className="hero">
        <div>
          <h1>Everything from Armenian sellers, <em>delivered to your door.</em></h1>
          <p>Shop from local stores in one cart. Pay cash when it arrives — anywhere from Yerevan to Syunik.</p>
          <div className="hero-actions">
            <Link to="/search" className="btn btn-primary btn-lg">Browse all products</Link>
            {user?.isSeller
              ? <Link to="/seller" className="btn btn-light btn-lg">Seller dashboard</Link>
              : <Link to="/sell" className="btn btn-light btn-lg">Start selling</Link>}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="pom pom-1" /><div className="pom pom-2" /><div className="pom pom-3" />
        </div>
      </section>

      <section>
        <h2 className="section-title">Shop by category</h2>
        <div className="category-grid">
          {categories.map((c) => (
            <Link key={c.id} to={`/search?category=${c.slug}`} className="category-tile">
              <span className="category-icon">{ICONS[c.slug] || '◆'}</span>
              <span className="category-name">{c.name}</span>
              <span className="category-count">{c.productCount} products</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">New arrivals</h2>
          <Link to="/search?sort=newest">See all →</Link>
        </div>
        {items === null ? <Spinner /> : (
          <div className="product-grid">
            {items.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}
