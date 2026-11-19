import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, Field, REGIONS, Spinner, amd, useTitle } from '../components.jsx';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

export default function Checkout() {
  useTitle('Checkout');
  const { user, setCart, refreshMe } = useApp();
  const nav = useNavigate();
  const [cart, setC] = useState(null);
  const [form, setForm] = useState(() => {
    const a = user.lastAddress; // the last address is pre-filled
    return {
      recipient: a?.recipient || user.name, phone: a?.phone || user.phone, region: a?.region || 'Yerevan',
      city: a?.city || (a ? '' : 'Yerevan'), street: a?.street || '', apartment: a?.apartment || '', note: '',
    };
  });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [placing, setPlacing] = useState(false);
  // One random key per checkout attempt. A double click or a retry after a
  // network error re-sends the same key, so the server returns the same order.
  const requestKey = useRef(newKey());

  const loadCart = () => api.get('/cart').then((d) => { setC(d.cart); setCart(d.cart); });
  useEffect(() => { loadCart().catch((e) => setErr({ message: e.message })); }, []); // eslint-disable-line

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const place = async (e) => {
    e.preventDefault();
    if (placing) return;
    setPlacing(true); // locks the button after one click
    setErr(null); setErrors({});
    try {
      const d = await api.post('/orders', { ...form, requestKey: requestKey.current });
      setCart({ itemCount: 0 });
      refreshMe();
      nav(`/orders/${d.order.id}?placed=1`, { replace: true });
    } catch (e2) {
      setErrors(e2.fields || {});
      setErr(e2);
      if (e2.status === 409 || e2.status === 400) {
        // The order was not created; a new attempt gets a fresh key.
        if (e2.status === 409) requestKey.current = newKey();
        loadCart().catch(() => {});
      }
      setPlacing(false);
    }
  };

  if (!cart) return <div className="container page"><Spinner /></div>;
  if (cart.groups.length === 0) {
    return <div className="container page empty card"><h1>Your cart is empty</h1><Link to="/search" className="btn btn-primary">Browse products</Link></div>;
  }

  return (
    <div className="container page">
      <h1>Checkout</h1>
      <form className="checkout-layout" onSubmit={place} noValidate>
        <section className="card form-card">
          <h2 className="h3">Delivery address</h2>
          <div className="grid-2">
            <Field label="Recipient name" error={errors.recipient} id="recipient">
              <input id="recipient" value={form.recipient} onChange={set('recipient')} autoComplete="name" required />
            </Field>
            <Field label="Phone" error={errors.phone} id="phone" hint="The seller calls this number before delivery">
              <input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+374 91 123456" required />
            </Field>
            <Field label="Region" error={errors.region} id="region">
              <select id="region" value={form.region} onChange={set('region')}>
                {REGIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="City or village" error={errors.city} id="city">
              <input id="city" value={form.city} onChange={set('city')} autoComplete="address-level2" required />
            </Field>
            <Field label="Street and building" error={errors.street} id="street">
              <input id="street" value={form.street} onChange={set('street')} autoComplete="street-address" placeholder="Abovyan 12" required />
            </Field>
            <Field label="Apartment (optional)" error={errors.apartment} id="apartment">
              <input id="apartment" value={form.apartment} onChange={set('apartment')} />
            </Field>
          </div>
          <Field label="Note for delivery (optional)" error={errors.note} id="note">
            <textarea id="note" rows={2} value={form.note} onChange={set('note')} placeholder="Entrance, floor, best time to call…" />
          </Field>
        </section>

        <aside className="card summary">
          <h2 className="h3">Your order</h2>
          {cart.groups.map((g) => (
            <div key={g.sellerId} className="summary-group">
              <div className="summary-seller">{g.storeName}</div>
              {g.items.map((it) => (
                <div key={it.productId} className="summary-row small">
                  <span>{it.quantity} × {it.title}</span><span>{amd(it.lineTotalAmd)}</span>
                </div>
              ))}
              <div className="summary-row small muted"><span>Subtotal</span><span>{amd(g.subtotalAmd)}</span></div>
            </div>
          ))}
          <div className="summary-row total"><span>Total</span><span>{amd(cart.totalAmd)}</span></div>
          <div className="pay-method">💵 Payment: <strong>cash on delivery</strong></div>

          {err && (
            <Alert>
              {err.code === 'PRICE_CHANGED' ? (
                <>
                  <strong>Prices changed since you added these items:</strong>
                  <ul>{err.details.items.map((i) => <li key={i.productId}>{i.title}: <s>{amd(i.oldPriceAmd)}</s> → <strong>{amd(i.newPriceAmd)}</strong></li>)}</ul>
                  <Link to="/cart">Review your cart</Link> to accept the new prices.
                </>
              ) : err.code === 'OUT_OF_STOCK' || err.code === 'UNAVAILABLE' ? (
                <>{err.message} <Link to="/cart">Update your cart</Link>.</>
              ) : err.message}
            </Alert>
          )}
          {cart.hasProblems && !err && <Alert>Some items changed. <Link to="/cart">Review your cart</Link> first.</Alert>}

          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={placing || cart.hasProblems}>
            {placing ? 'Placing order…' : `Place order · ${amd(cart.totalAmd)}`}
          </button>
        </aside>
      </form>
    </div>
  );
}
