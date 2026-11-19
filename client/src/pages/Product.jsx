import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, QtyStepper, Spinner, Stars, amd, date, stockLabel, useTitle } from '../components.jsx';

export default function Product() {
  const { id } = useParams();
  const { user, setCart } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [p, setP] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [inCart, setInCart] = useState(0);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  useTitle(p?.title);

  useEffect(() => {
    setP(null); setErr(''); setActive(0); setQty(1); setMsg({});
    api.get(`/products/${id}`).then((d) => setP(d.product)).catch((e) => setErr(e.status === 404 ? 'This product does not exist or is no longer available.' : e.message));
    api.get(`/products/${id}/reviews`).then((d) => setReviews(d.reviews)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!user) { setInCart(0); return; }
    api.get('/cart').then((d) => {
      const it = d.cart.groups.flatMap((g) => g.items).find((i) => i.productId === Number(id));
      setInCart(it?.quantity || 0);
    }).catch(() => {});
  }, [user, id]);

  if (err) return <div className="container page empty"><h1>Not available</h1><p>{err}</p><Link className="btn btn-primary" to="/search">Browse products</Link></div>;
  if (!p) return <div className="container page"><Spinner /></div>;

  const s = stockLabel(p.stock);
  const canAddMax = Math.max(0, p.stock - inCart);

  const add = async () => {
    if (!user) { nav(`/login?next=${encodeURIComponent(loc.pathname)}`); return; }
    setBusy(true); setMsg({});
    try {
      const d = await api.put(`/cart/items/${p.id}`, { quantity: inCart + qty });
      setCart(d.cart);
      setInCart(inCart + qty);
      setQty(1);
      setMsg({ ok: `Added to cart (${inCart + qty} in cart).` });
    } catch (e) {
      setMsg({ error: e.message });
      if (e.details?.stock !== undefined) setP({ ...p, stock: e.details.stock });
    } finally { setBusy(false); }
  };

  const img = p.images[active];

  return (
    <div className="container page">
      <nav className="crumbs">
        <Link to="/">Home</Link> › <Link to={`/search?category=${p.category.slug}`}>{p.category.name}</Link>
      </nav>
      {!p.isPublished && <Alert kind="info">This product is unpublished — only you can see it.</Alert>}
      <div className="product-layout">
        <div className="gallery">
          <div className="gallery-main card">
            {img ? <img src={img.large} alt={p.title} /> : <div className="img-placeholder" />}
          </div>
          {p.images.length > 1 && (
            <div className="gallery-thumbs">
              {p.images.map((im, i) => (
                <button key={im.id} className={i === active ? 'active' : ''} onClick={() => setActive(i)} aria-label={`Image ${i + 1}`}>
                  <img src={im.thumb} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-info">
          <h1>{p.title}</h1>
          <div className="product-sub">
            <Stars value={p.ratingAvg} count={p.ratingCount} size="md" />
            <span className="muted">Sold by <strong>{p.storeName}</strong></span>
          </div>
          <div className="product-price">{amd(p.priceAmd)}</div>
          <div className={`stock ${s.cls}`}>{s.text}</div>

          <div className="buy-box card">
            {p.isOwn ? (
              <>
                <p className="muted">This is your product.</p>
                <Link className="btn btn-light" to={`/seller/products/${p.id}`}>Edit product</Link>
              </>
            ) : p.stock > 0 ? (
              <>
                <div className="buy-row">
                  <QtyStepper value={Math.min(qty, Math.max(1, canAddMax))} max={Math.max(1, canAddMax)} onChange={setQty} disabled={canAddMax === 0} />
                  <button className="btn btn-primary btn-lg grow" onClick={add} disabled={busy || canAddMax === 0}>
                    {busy ? 'Adding…' : 'Add to cart'}
                  </button>
                </div>
                {inCart > 0 && canAddMax === 0 && <div className="field-hint">All available units are already in your cart.</div>}
                {inCart > 0 && canAddMax > 0 && <div className="field-hint">{inCart} already in your cart.</div>}
              </>
            ) : <p className="stock-out">This product is sold out.</p>}
            <Alert kind="success">{msg.ok && <>{msg.ok} <Link to="/cart">Go to cart →</Link></>}</Alert>
            <Alert>{msg.error}</Alert>
            <div className="buy-notes">
              <span>💵 Cash on delivery</span>
              <span>🚚 Delivery inside Armenia</span>
            </div>
          </div>

          <h2 className="h3">Description</h2>
          <p className="description">{p.description}</p>
        </div>
      </div>

      <section className="reviews">
        <h2 className="section-title">Reviews</h2>
        {reviews.length === 0 ? <p className="muted">No reviews yet. Reviews can be written by buyers after delivery.</p> : (
          <ul className="review-list">
            {reviews.map((r) => (
              <li key={r.id} className="card review">
                <div className="review-head"><Stars value={r.rating} /> <strong>{r.author}</strong> <span className="muted">{date(r.createdAt)}</span></div>
                {r.body && <p>{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
