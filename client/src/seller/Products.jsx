import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Spinner, amd, useTitle } from '../components.jsx';

export default function Products() {
  useTitle('My products');
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api.get('/seller/products').then((d) => setItems(d.products)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const toggle = async (p) => {
    setErr('');
    try { await api.patch(`/seller/products/${p.id}`, { isPublished: !p.isPublished }); load(); } catch (e) { setErr(e.message); }
  };

  if (!items) return err ? <Alert>{err}</Alert> : <Spinner />;
  return (
    <>
      <div className="section-head">
        <h2 className="section-title">Products ({items.length})</h2>
        <Link to="/seller/products/new" className="btn btn-primary">+ Add product</Link>
      </div>
      <Alert>{err}</Alert>
      {items.length === 0 ? (
        <div className="empty card"><p>You have no products yet.</p><Link to="/seller/products/new" className="btn btn-primary">Add your first product</Link></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th /><th>Title</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th><th className="num">Sold</th><th /></tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className={p.isPublished ? '' : 'dim'}>
                  <td className="thumb-cell">{p.image ? <img src={p.image.thumb} alt="" /> : <div className="img-placeholder" />}</td>
                  <td><Link to={`/seller/products/${p.id}`}>{p.title}</Link><div className="muted small">{p.categoryName}</div></td>
                  <td className="num">{amd(p.priceAmd)}</td>
                  <td className={`num ${p.stock === 0 ? 'stock-out' : p.stock <= 5 ? 'stock-low' : ''}`}>{p.stock}</td>
                  <td>{p.isPublished ? <span className="pill pill-on">Published</span> : <span className="pill">Unpublished</span>}</td>
                  <td className="num">{p.unitsSold}</td>
                  <td className="actions">
                    <Link className="btn btn-light btn-sm" to={`/seller/products/${p.id}`}>Edit</Link>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>{p.isPublished ? 'Unpublish' : 'Publish'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
