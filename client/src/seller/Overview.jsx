import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Spinner, StatusBadge, amd, useTitle } from '../components.jsx';

export default function Overview() {
  useTitle('Seller overview');
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/seller/overview').then((d) => setO(d.overview)).catch((e) => setErr(e.message)); }, []);
  if (err) return <Alert>{err}</Alert>;
  if (!o) return <Spinner />;
  return (
    <>
      <div className="stat-grid">
        <Link to="/seller/orders?status=placed" className="card stat stat-alert">
          <div className="stat-label">Orders to confirm</div>
          <div className="stat-value">{o.toConfirm}</div>
        </Link>
        <Link to="/seller/orders?status=confirmed" className="card stat">
          <div className="stat-label">Orders to ship</div>
          <div className="stat-value">{o.toShip}</div>
        </Link>
        <div className="card stat">
          <div className="stat-label">Revenue, last 30 days</div>
          <div className="stat-value">{amd(o.revenueLast30DaysAmd)}</div>
          <div className="muted small">From delivered orders · all time {amd(o.revenueAllTimeAmd)}</div>
        </div>
        <Link to="/seller/products" className="card stat">
          <div className="stat-label">Products</div>
          <div className="stat-value">{o.products.published}<span className="stat-of"> / {o.products.total} published</span></div>
          {o.products.soldOut > 0 && <div className="small stock-out">{o.products.soldOut} sold out</div>}
        </Link>
      </div>

      <section className="card">
        <h2 className="h3">Orders by status</h2>
        <div className="status-bars">
          {Object.entries(o.ordersByStatus).map(([s, n]) => (
            <Link key={s} to={`/seller/orders?status=${s}`} className="status-bar">
              <StatusBadge status={s} /><strong>{n}</strong>
            </Link>
          ))}
        </div>
      </section>

      <div className="row-actions">
        <Link to="/seller/products/new" className="btn btn-primary">+ Add a product</Link>
        <Link to="/seller/orders" className="btn btn-light">View all orders</Link>
      </div>
    </>
  );
}
