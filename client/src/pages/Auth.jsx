import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, Field, useTitle } from '../components.jsx';

const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export function Login() {
  useTitle('Sign in');
  const { setUser, setCart } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { user } = await api.post('/auth/login', form);
      setUser(user); setCart({ itemCount: user.cartCount });
      nav(safeNext(params.get('next')), { replace: true });
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="container page auth">
      <form className="card form-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <Alert>{err}</Alert>
        <Field label="Email" id="email"><input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Password" id="password"><input id="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted center">New to Shuka? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Create an account</Link></p>
      </form>
    </div>
  );
}

export function Register() {
  useTitle('Create account');
  const { setUser, setCart } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setErrors({});
    try {
      const { user } = await api.post('/auth/register', form);
      setUser(user); setCart({ itemCount: 0 });
      nav(safeNext(params.get('next')), { replace: true });
    } catch (e2) {
      setErrors(e2.fields); if (!Object.keys(e2.fields).length) setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <div className="container page auth">
      <form className="card form-card" onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <Alert>{err}</Alert>
        <Field label="Full name" error={errors.name} id="name"><input id="name" autoComplete="name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Email" error={errors.email} id="email"><input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone" error={errors.phone} id="phone"><input id="phone" type="tel" autoComplete="tel" placeholder="+374 91 123456" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Password" error={errors.password} id="password" hint="At least 8 characters"><input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="muted center">Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Sign in</Link></p>
      </form>
    </div>
  );
}
