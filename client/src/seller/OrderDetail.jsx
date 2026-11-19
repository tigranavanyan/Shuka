import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Spinner, StatusBadge, amd, dateTime, useTitle } from '../components.jsx';
import { History } from '../pages/OrderDetail.jsx';

const MOVE_LABEL = {
  confirmed: 'Confirm order',
  shipped: 'Mark as shipped',
  delivered: 'Mark as delivered (cash received)',
  cancelled: 'Cancel order',
};

export default function SellerOrderDetail() {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle(o ? `Order #${o.orderId}` : 'Order');

  const load = () => api.get(`/seller/orders/${id}`).then((d) => setO(d.order)).catch((e) => setErr(e.status === 404 ? 'Order not found.' : e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const move = async (to) => {
    if (to === 'cancelled' && !window.confirm('Cancel this order? The stock will be returned.')) return;
    setBusy(true); setErr('');
    try { setO((await api.post(`/seller/orders/${id}/status`, { to })).order); } catch (e) { setErr(e.message); load(); }
    setBusy(false);
  };

  if (!o) return err ? <Alert>{err}</Alert> : <Spinner />;
  const d = o.delivery;
  return (
    <div className="narrow-left">
      <nav className="crumbs"><Link to="/seller/orders">Orders</Link> › #{o.orderId}</nav>
      <div className="order-head">
        <h2 className="section-title">Order #{o.orderId} <StatusBadge status={o.status} /></h2>
        <span className="muted">Placed {dateTime(o.createdAt)}</span>
      </div>
      <Alert>{err}</Alert>

      {o.allowedMoves.length > 0 && (
        <div className="card move-bar">
          {o.allowedMoves.map((to) => (
            <button key={to} className={`btn ${to === 'cancelled' ? 'btn-danger-ghost' : 'btn-primary'}`} disabled={busy} onClick={() => move(to)}>
              {MOVE_LABEL[to]}
            </button>
          ))}
        </div>
      )}

      <div className="grid-2 top">
        <section className="card">
          <h3>Deliver to</h3>
          <p className="big">{d.recipient}</p>
          <p><a href={`tel:${d.phone.replace(/[^+\d]/g, '')}`} className="phone">📞 {d.phone}</a></p>
          <p>{d.street}{d.apartment && `, apt ${d.apartment}`}<br />{d.city}, {d.region}</p>
          {d.note && <p className="note">“{d.note}”</p>}
          <p className="muted small">Buyer account: {o.buyer.name} · {o.buyer.accountPhone}</p>
        </section>
        <section className="card cash">
          <h3>Cash to collect</h3>
          <div className="cash-amount">{amd(o.cashToCollectAmd)}</div>
          <p className="muted small">Payment: cash on delivery</p>
        </section>
      </div>

      <section className="card">
        <h3>Items (prices at purchase time)</h3>
        {o.items.map((it) => (
          <div key={it.id} className="line-item">
            <div className="thumb">{it.image ? <img src={it.image.thumb} alt="" /> : <div className="img-placeholder" />}</div>
            <div className="grow"><div>{it.title}</div><div className="muted small">{it.quantity} × {amd(it.unitPriceAmd)}</div></div>
            <div className="line-total">{amd(it.lineTotalAmd)}</div>
          </div>
        ))}
        <div className="seller-part-foot"><span>Subtotal</span><strong>{amd(o.subtotalAmd)}</strong></div>
      </section>

      <section className="card">
        <h3>Status history</h3>
        <History history={o.history} />
      </section>
    </div>
  );
}
