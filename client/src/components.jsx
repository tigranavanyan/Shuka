import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from './store.jsx';

export const amd = (n) => `${Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ')} ֏`;
export const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const STATUS_LABEL = {
  placed: 'Placed', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const REGIONS = [
  'Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk',
  'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor',
];

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function Stars({ value = 0, count, size = 'sm' }) {
  const full = Math.round(value);
  return (
    <span className={`stars stars-${size}`} aria-label={`${value} out of 5 stars`}>
      <span className="stars-on">{'★'.repeat(full)}</span>
      <span className="stars-off">{'★'.repeat(5 - full)}</span>
      {count !== undefined && <span className="stars-count">{count ? `${value.toFixed(1)} (${count})` : 'No reviews'}</span>}
    </span>
  );
}

export function stockLabel(stock) {
  if (stock <= 0) return { text: 'Out of stock', cls: 'stock-out' };
  if (stock <= 5) return { text: `Only ${stock} left`, cls: 'stock-low' };
  return { text: 'In stock', cls: 'stock-ok' };
}

export function ProductCard({ p }) {
  const s = stockLabel(p.stock);
  return (
    <Link to={`/p/${p.id}`} className="card product-card">
      <div className="product-card-img">
        {p.image ? <img src={p.image.thumb} alt="" loading="lazy" /> : <div className="img-placeholder" />}
        {p.stock <= 0 && <span className="ribbon">Sold out</span>}
      </div>
      <div className="product-card-body">
        <div className="product-card-title">{p.title}</div>
        <Stars value={p.ratingAvg} count={p.ratingCount} />
        <div className="product-card-price">{amd(p.priceAmd)}</div>
        <div className={`product-card-meta ${s.cls}`}>{p.stock > 0 && p.stock <= 5 ? s.text : p.storeName}</div>
      </div>
    </Link>
  );
}

export function Field({ label, error, hint, children, id }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <nav className="pagination" aria-label="Pages">
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {nums.map((n) => (
        <button key={n} className={`btn ${n === page ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onPage(n)}>{n}</button>
      ))}
      <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
    </nav>
  );
}

export function QtyStepper({ value, max, min = 1, onChange, disabled }) {
  return (
    <div className="qty">
      <button type="button" aria-label="Decrease" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <input
        type="number" inputMode="numeric" min={min} max={max} value={value} disabled={disabled}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        aria-label="Quantity"
      />
      <button type="button" aria-label="Increase" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

/** Closes a <details> menu when clicking elsewhere or navigating. */
function useDetailsAutoClose() {
  const ref = useRef(null);
  const loc = useLocation();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [loc]);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) ref.current.open = false; };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);
  return ref;
}

export function Header() {
  const { user, categories, cartCount, logout } = useApp();
  const [params] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const catRef = useDetailsAutoClose();
  const accRef = useDetailsAutoClose();

  useEffect(() => { if (loc.pathname === '/search') setQ(params.get('q') || ''); }, [loc, params]);

  const submit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams(loc.pathname === '/search' ? params : undefined);
    if (q.trim()) p.set('q', q.trim()); else p.delete('q');
    p.delete('page');
    nav(`/search?${p.toString()}`);
  };

  return (
    <header className="site-header">
      <div className="header-row container">
        <Link to="/" className="logo" aria-label="Shuka home">
          <span className="logo-mark">◉</span>
          <span className="logo-word">shuka</span>
          <span className="logo-arm">շուկա</span>
        </Link>

        <form className="search" onSubmit={submit} role="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" />
          <button className="btn btn-primary" type="submit" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
        </form>

        <nav className="header-actions">
          <Link to="/cart" className="cart-link" aria-label={`Cart, ${cartCount} items`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            <span className="hide-sm">Cart</span>
          </Link>
          {user === null && <Link to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} className="btn btn-light">Sign in</Link>}
          {user && (
            <details className="menu" ref={accRef}>
              <summary className="btn btn-light">
                <span className="avatar">{user.name[0]}</span>
                <span className="hide-sm">{user.name.split(' ')[0]}</span> ▾
              </summary>
              <div className="menu-panel menu-right">
                <Link to="/orders">My orders</Link>
                <Link to="/account">Account</Link>
                {user.isSeller ? <Link to="/seller">Seller dashboard</Link> : <Link to="/sell">Sell on Shuka</Link>}
                <button onClick={async () => { await logout(); nav('/'); }}>Log out</button>
              </div>
            </details>
          )}
        </nav>
      </div>

      <div className="subnav">
        <div className="container subnav-row">
          <details className="menu" ref={catRef}>
            <summary>☰ All categories</summary>
            <div className="menu-panel">
              <Link to="/search">All products</Link>
              {categories.map((c) => <Link key={c.id} to={`/search?category=${c.slug}`}>{c.name}</Link>)}
            </div>
          </details>
          {categories.slice(0, 7).map((c) => (
            <NavLink key={c.id} className="subnav-link" to={`/search?category=${c.slug}`}>{c.name}</NavLink>
          ))}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-row">
        <span>© Shuka · Armenia's local marketplace</span>
        <span>Prices in AMD · Delivery inside Armenia · Cash on delivery</span>
      </div>
    </footer>
  );
}

export function useTitle(t) {
  useEffect(() => { document.title = t ? `${t} · Shuka` : 'Shuka — Armenia\'s marketplace'; }, [t]);
}
