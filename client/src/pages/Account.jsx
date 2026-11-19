import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, Field, useTitle } from '../components.jsx';

export default function Account() {
  useTitle('Account');
  const { user, setUser } = useApp();
  const [form, setForm] = useState({ name: user.name, phone: user.phone });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMsg('');
    try {
      const d = await api.patch('/me', form);
      setUser(d.user); setMsg('Saved.');
    } catch (e2) { setErrors(e2.fields); if (!Object.keys(e2.fields).length) setErrors({ name: e2.message }); }
    setBusy(false);
  };

  return (
    <div className="container page auth">
      <form className="card form-card" onSubmit={submit} noValidate>
        <h1>Your account</h1>
        <p className="muted">{user.email}{user.isSeller && <> · Seller: <strong>{user.storeName}</strong></>}</p>
        <Alert kind="success">{msg}</Alert>
        <Field label="Name" error={errors.name} id="name"><input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Phone" error={errors.phone} id="phone"><input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <button className="btn btn-primary btn-block" disabled={busy}>Save changes</button>
        <p className="center"><Link to="/orders">My orders</Link>{' · '}{user.isSeller ? <Link to="/seller">Seller dashboard</Link> : <Link to="/sell">Sell on Shuka</Link>}</p>
      </form>
    </div>
  );
}
