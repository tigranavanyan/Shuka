import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, Field, Spinner, useTitle } from '../components.jsx';

const MAX_IMAGES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const { categories } = useApp();
  useTitle(isNew ? 'New product' : 'Edit product');

  const [product, setProduct] = useState(null);
  const [form, setForm] = useState({ title: '', categoryId: '', description: '', priceAmd: '', stock: '1', isPublished: true });
  const [pending, setPending] = useState([]); // files chosen but not uploaded yet
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.get(`/seller/products/${id}`).then((d) => {
      setProduct(d.product);
      const p = d.product;
      setForm({ title: p.title, categoryId: String(p.categoryId), description: p.description, priceAmd: String(p.priceAmd), stock: String(p.stock), isPublished: p.isPublished });
    }).catch((e) => setErr(e.status === 404 ? 'Product not found.' : e.message));
  }, [id, isNew]);

  const previews = useMemo(() => pending.map((f) => ({ f, url: URL.createObjectURL(f) })), [pending]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const images = product?.images || [];
  const slotsLeft = MAX_IMAGES - images.length - pending.length;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const pick = (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    const bad = files.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) {
      setErrors({ ...errors, images: !TYPES.includes(bad.type) ? `"${bad.name}" is not a JPEG, PNG or WebP image.` : `"${bad.name}" is larger than 5 MB.` });
      return;
    }
    if (files.length > slotsLeft) { setErrors({ ...errors, images: `You can add ${Math.max(0, slotsLeft)} more image(s) (max ${MAX_IMAGES}).` }); return; }
    setErrors({ ...errors, images: undefined });
    setPending([...pending, ...files]);
  };

  const uploadPending = async (productId) => {
    if (!pending.length) return null;
    const fd = new FormData();
    pending.forEach((f) => fd.append('images', f));
    const d = await api.upload(`/seller/products/${productId}/images`, fd);
    setPending([]);
    return d.product;
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setErr(''); setOk('');
    const body = {
      title: form.title, description: form.description,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      priceAmd: form.priceAmd.replace(/\s/g, ''), stock: form.stock,
    };
    if (form.isPublished && images.length + pending.length === 0) {
      setErrors({ images: 'Add at least one image to publish the product.' });
      setBusy(false);
      return;
    }
    let pid = product?.id;
    try {
      // 1. save fields (new products start unpublished), 2. upload images, 3. publish
      const d = isNew
        ? await api.post('/seller/products', body)
        : await api.patch(`/seller/products/${pid}`, form.isPublished ? body : { ...body, isPublished: false });
      pid = d.product.id;
      let p = d.product;
      setProduct(p);
      p = (await uploadPending(pid)) || p;
      if (form.isPublished && !p.isPublished) p = (await api.patch(`/seller/products/${pid}`, { isPublished: true })).product;
      setProduct(p);
      if (isNew) nav(`/seller/products/${pid}`, { replace: true });
      setOk(p.isPublished ? 'Saved and published.' : 'Saved (not published).');
    } catch (e2) {
      setErrors(e2.fields || {});
      if (!Object.keys(e2.fields || {}).length) setErr(e2.message);
      if (isNew && pid) nav(`/seller/products/${pid}`, { replace: true });
    }
    setBusy(false);
  };

  const removeImage = async (img) => {
    setErr('');
    try { setProduct((await api.del(`/seller/products/${product.id}/images?imageId=${img.id}`)).product); } catch (e) { setErr(e.message); }
  };
  const makeMain = async (img) => {
    const order = [img.id, ...images.filter((i) => i.id !== img.id).map((i) => i.id)];
    try { setProduct((await api.patch(`/seller/products/${product.id}`, { imageOrder: order })).product); } catch (e) { setErr(e.message); }
  };

  if (!isNew && !product) return err ? <Alert>{err}</Alert> : <Spinner />;

  return (
    <form className="editor" onSubmit={save} noValidate>
      <div className="section-head">
        <h2 className="section-title">{isNew ? 'Add a product' : 'Edit product'}</h2>
        {!isNew && product.isPublished && <Link to={`/p/${product.id}`}>View in store →</Link>}
      </div>
      <Alert>{err}</Alert>
      <Alert kind="success">{ok}</Alert>
      <div className="editor-layout">
        <section className="card form-card">
          <Field label="Title" error={errors.title} id="title"><input id="title" value={form.title} onChange={set('title')} maxLength={120} /></Field>
          <Field label="Category" error={errors.categoryId} id="categoryId">
            <select id="categoryId" value={form.categoryId} onChange={set('categoryId')}>
              <option value="">Choose a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Description" error={errors.description} id="description">
            <textarea id="description" rows={6} value={form.description} onChange={set('description')} maxLength={5000} />
          </Field>
          <div className="grid-2">
            <Field label="Price, AMD" error={errors.priceAmd} id="priceAmd" hint="Whole dram, e.g. 12500">
              <input id="priceAmd" inputMode="numeric" value={form.priceAmd} onChange={set('priceAmd')} />
            </Field>
            <Field label="Stock" error={errors.stock} id="stock"><input id="stock" inputMode="numeric" value={form.stock} onChange={set('stock')} /></Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.isPublished} onChange={set('isPublished')} /> Published (visible in the store)
          </label>
        </section>

        <section className="card form-card">
          <h3>Images <span className="muted small">({images.length + pending.length}/{MAX_IMAGES}) · first one is the main image</span></h3>
          <div className="image-grid">
            {images.map((img, i) => (
              <div key={img.id} className={`image-tile ${i === 0 ? 'main' : ''}`}>
                <img src={img.thumb} alt="" />
                {i === 0 ? <span className="tag">Main</span> : <button type="button" className="tile-btn" onClick={() => makeMain(img)}>Make main</button>}
                <button type="button" className="tile-x" aria-label="Remove image" onClick={() => removeImage(img)}>×</button>
              </div>
            ))}
            {previews.map((p, i) => (
              <div key={p.url} className="image-tile pending">
                <img src={p.url} alt="" />
                <span className="tag">{images.length === 0 && i === 0 ? 'Main · ' : ''}Not saved</span>
                <button type="button" className="tile-x" aria-label="Remove" onClick={() => setPending(pending.filter((f) => f !== p.f))}>×</button>
              </div>
            ))}
            {slotsLeft > 0 && (
              <label className="image-tile add">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pick} hidden />
                <span>+ Add photos</span>
                <span className="muted small">JPEG, PNG, WebP · up to 5 MB</span>
              </label>
            )}
          </div>
          {errors.images && <div className="field-error">{errors.images}</div>}
        </section>
      </div>
      <div className="row-actions sticky-actions">
        <Link to="/seller/products" className="btn btn-ghost">Back to products</Link>
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
      </div>
    </form>
  );
}
