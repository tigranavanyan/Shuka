import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, QtyStepper, Spinner, amd, useTitle } from '../components.jsx';

export function ItemWarnings({ item, onFix, busy }) {
  const w = item.warnings;
  if (w.unavailable) return <div className="warn">No longer available. <button className="link" disabled={busy} onClick={() => onFix('remove')}>Remove</button></div>;
  if (w.soldOut) return <div className="warn">Sold out since you added it. <button className="link" disabled={busy} onClick={() => onFix('remove')}>Remove</button></div>;
  return (
    <>
      {w.priceChanged && (
        <div className="warn">
          Price changed from <s>{amd(item.priceWhenAdded)}</s> to <strong>{amd(item.priceAmd)}</strong>.{' '}
          <button className="link" disabled={busy} onClick={() => onFix('accept')}>Accept new price</button>
        </div>
      )}
      {w.notEnoughStock && (
        <div className="warn">
          Only {item.stock} left. <button className="link" disabled={busy} onClick={() => onFix('reduce')}>Change to {item.stock}</button>
        </div>
      )}
    </>
  );
}

export default function Cart() {
  useTitle('Cart');
  const { setCart } = useApp();
  const nav = useNavigate();
  const [cart, setC] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = (c) => { setC(c); setCart(c); };
  useEffect(() => { api.get('/cart').then((d) => apply(d.cart)).catch((e) => setErr(e.message)); }, []); // eslint-disable-line

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { apply((await fn()).cart); } catch (e) {
      setErr(e.message);
      api.get('/cart').then((d) => apply(d.cart)).catch(() => {});
    } finally { setBusy(false); }
  };
  const setQty = (item, q) => run(() => api.put(`/cart/items/${item.productId}`, { quantity: q }));
  const remove = (item) => run(() => api.del(`/cart/items/${item.productId}`));
  const fix = (item, action) => {
    if (action === 'remove') return remove(item);
    if (action === 'reduce') return setQty(item, item.stock);
    return setQty(item, Math.min(item.quantity, item.stock) || 1);
  };

  if (!cart) return <div className="container page"><Alert>{err}</Alert>{!err && <Spinner />}</div>;

  if (cart.groups.length === 0) {
    return (
      <div className="container page empty card">
        <h1>Your cart is empty</h1>
        <p>Find something you like from Armenian sellers.</p>
        <Link to="/search" className="btn btn-primary">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="container page">
      <h1>Shopping cart</h1>
      <Alert>{err}</Alert>
      <div className="cart-layout">
        <div className="cart-groups">
          {cart.groups.map((g) => (
            <section key={g.sellerId} className="card cart-group">
              <header className="cart-group-head">
                <span>Sold by <strong>{g.storeName}</strong></span>
                <span>Subtotal: <strong>{amd(g.subtotalAmd)}</strong></span>
              </header>
              {g.items.map((it) => (
                <div key={it.productId} className={`cart-item ${it.warnings.soldOut || it.warnings.unavailable ? 'dim' : ''}`}>
                  <Link to={`/p/${it.productId}`} className="thumb">{it.image ? <img src={it.image.thumb} alt="" /> : <div className="img-placeholder" />}</Link>
                  <div className="cart-item-main">
                    <Link to={`/p/${it.productId}`} className="cart-item-title">{it.title}</Link>
                    <div className="muted">{amd(it.priceAmd)} each</div>
                    <ItemWarnings item={it} busy={busy} onFix={(a) => fix(it, a)} />
                    <div className="cart-item-controls">
                      {!it.warnings.soldOut && !it.warnings.unavailable && (
                        <QtyStepper value={it.quantity} max={Math.max(it.stock, 1)} onChange={(q) => setQty(it, q)} disabled={busy} />
                      )}
                      <button className="link" onClick={() => remove(it)} disabled={busy}>Remove</button>
                    </div>
                  </div>
                  <div className="cart-item-total">{amd(it.lineTotalAmd)}</div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <aside className="card summary">
          <div className="summary-row"><span>Items ({cart.itemCount})</span><span>{amd(cart.totalAmd)}</span></div>
          <div className="summary-row"><span>Delivery</span><span>Arranged by sellers</span></div>
          <div className="summary-row total"><span>Total</span><span>{amd(cart.totalAmd)}</span></div>
          {cart.hasProblems && <div className="warn">Fix the items marked above before checkout.</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={!cart.canCheckout || busy} onClick={() => nav('/checkout')}>
            Proceed to checkout
          </button>
          <div className="muted small">Payment: cash on delivery</div>
        </aside>
      </div>
    </div>
  );
}
