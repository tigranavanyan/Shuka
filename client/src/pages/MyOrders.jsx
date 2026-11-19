import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Spinner, StatusBadge, amd, date, useTitle } from '../components.jsx';

export default function MyOrders() {
  useTitle('My orders');
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/orders').then((d) => setOrders(d.orders)).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="container page"><Alert>{err}</Alert></div>;
  if (!orders) return <div className="container page"><Spinner /></div>;
  return (
    <div className="container page narrow">
      <h1>My orders</h1>
      {orders.length === 0 ? (
        <div className="empty card"><p>You have no orders yet.</p><Link to="/search" className="btn btn-primary">Start shopping</Link></div>
      ) : (
        <ul className="order-list">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="card order-row">
                <div>
                  <div className="order-no">Order #{o.id}</div>
                  <div className="muted small">{date(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}</div>
                </div>
                <div className="order-parts">
                  {o.sellerOrders.map((s) => (
                    <div key={s.id} className="order-part"><span className="muted small">{s.storeName}</span> <StatusBadge status={s.status} /></div>
                  ))}
                </div>
                <div className="order-total">{amd(o.totalAmd)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
