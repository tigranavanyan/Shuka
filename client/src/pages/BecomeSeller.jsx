import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, Field, useTitle } from '../components.jsx';

export default function BecomeSeller() {
  useTitle('Sell on Shuka');
  const { user, setUser } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ storeName: '', phone: user.phone });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user.isSeller) return <Navigate to="/seller" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setErr('');
    try {
      const d = await api.post('/seller/activate', form);
      setUser({ ...user, ...d.user });
      nav('/seller/products/new');
    } catch (e2) { setErrors(e2.fields); if (!Object.keys(e2.fields).length) setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="container page auth">
      <form className="card form-card" onSubmit={submit} noValidate>
        <h1>Sell on Shuka</h1>
        <p className="muted">Open your store in seconds. Buyers across Armenia order, you deliver and collect cash. No fees during the pilot.</p>
        <Alert>{err}</Alert>
        <Field label="Store name" error={errors.storeName} id="storeName" hint="Shown on your products, e.g. “Ani Home & Craft”">
          <input id="storeName" value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
        </Field>
        <Field label="Phone for buyers and orders" error={errors.phone} id="phone">
          <input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Activating…' : 'Activate my store'}</button>
      </form>
    </div>
  );
}
