import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Field, Spinner, StatusBadge, STATUS_LABEL, amd, date, dateTime, useTitle } from '../components.jsx';

export function History({ history }) {
  return (
    <ol className="timeline">
      {history.map((h, i) => (
        <li key={i}>
          <span className={`dot dot-${h.to}`} />
          <span><strong>{STATUS_LABEL[h.to]}</strong>{h.from && <span className="muted"> from {STATUS_LABEL[h.from]}</span>}</span>
          <span className="muted small">{dateTime(h.at)} · {h.by}</span>
        </li>
      ))}
    </ol>
  );
}

function ReviewForm({ item, onDone }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.post(`/products/${item.productId}/reviews`, { rating, body }); onDone(); } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <form className="review-form" onSubmit={submit}>
      <div className="star-input" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} stars`} aria-checked={n === rating} role="radio">★</button>
        ))}
      </div>
      <Field error={err}>
        <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you like or dislike?" maxLength={2000} />
      </Field>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Submit review'}</button>
    </form>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  useTitle(`Order #${id}`);

  const load = () => api.get(`/orders/${id}`).then((d) => setOrder(d.order)).catch((e) => setErr(e.status === 404 ? 'Order not found.' : e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const cancel = async (so) => {
    if (!window.confirm(`Cancel the part of this order from ${so.storeName}?`)) return;
    setBusy(true); setErr('');
    try { setOrder((await api.post(`/orders/${id}/sellers/${so.id}/cancel`)).order); } catch (e) { setErr(e.message); load(); } finally { setBusy(false); }
  };

  if (!order) return <div className="container page">{err ? <Alert>{err}</Alert> : <Spinner />}</div>;
  const a = order.address;

  return (
    <div className="container page narrow">
      {params.get('placed') && (
        <div className="confirm-banner card">
          <div className="confirm-icon">✓</div>
          <div>
            <h1>Thank you! Your order is placed.</h1>
            <p>Order number <strong>#{order.id}</strong>. Pay <strong>{amd(order.totalAmd)}</strong> in cash when it arrives. Each seller will call you before delivery.</p>
          </div>
        </div>
      )}
      <nav className="crumbs"><Link to="/orders">My orders</Link> › Order #{order.id}</nav>
      <div className="order-head">
        <h1>Order #{order.id}</h1>
        <span className="muted">Placed {date(order.createdAt)} · Total {amd(order.totalAmd)}</span>
      </div>
      <Alert>{err}</Alert>

      <section className="card address-card">
        <h2 className="h3">Delivery address</h2>
        <p>{a.recipient} · {a.phone}<br />{a.street}{a.apartment && `, apt ${a.apartment}`}, {a.city}, {a.region}</p>
        {a.note && <p className="muted">Note: {a.note}</p>}
        <p className="muted small">Payment: cash on delivery</p>
      </section>

      {order.sellerOrders.map((so) => (
        <section key={so.id} className="card seller-part">
          <header className="seller-part-head">
            <div><span className="muted">Sold by</span> <strong>{so.storeName}</strong></div>
            <StatusBadge status={so.status} />
          </header>
          {so.items.map((it) => (
            <div key={it.id} className="line-item">
              <Link to={`/p/${it.productId}`} className="thumb">{it.image ? <img src={it.image.thumb} alt="" /> : <div className="img-placeholder" />}</Link>
              <div className="grow">
                <div>{it.title}</div>
                <div className="muted small">{it.quantity} × {amd(it.unitPriceAmd)}</div>
                {it.canReview && reviewing !== it.id && <button className="btn btn-light btn-sm" onClick={() => setReviewing(it.id)}>Write a review</button>}
                {it.reviewed && <span className="muted small">✓ You reviewed this</span>}
                {reviewing === it.id && <ReviewForm item={it} onDone={() => { setReviewing(null); load(); }} />}
              </div>
              <div className="line-total">{amd(it.lineTotalAmd)}</div>
            </div>
          ))}
          <div className="seller-part-foot">
            <span>Subtotal <strong>{amd(so.subtotalAmd)}</strong></span>
            {so.canCancel && <button className="btn btn-danger-ghost" disabled={busy} onClick={() => cancel(so)}>Cancel</button>}
          </div>
          <details className="history" open>
            <summary>Status history</summary>
            <History history={so.history} />
          </details>
        </section>
      ))}
    </div>
  );
}
