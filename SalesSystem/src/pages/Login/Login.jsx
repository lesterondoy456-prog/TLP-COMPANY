import React, { useState } from 'react';
import { Icon } from '../../components/Icons.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';

export default function Login({ onLogin, initialError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onLogin({ username: username.trim(), password, remember }); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <main className="login-page">
    <ThemeToggle />
    <section className="login-story">
      <div className="brand"><div className="brand-mark">T</div><div><strong>TLP COMPANY</strong><span>SalesSystem</span></div></div>
      <div className="login-story-body"><span className="eyebrow">YOUR SALES, CONNECTED</span><h1>Every sale.<br />One clear view.</h1><p>Manage customers, products, orders, invoices, and deliveries in your sales workspace.</p>
        <div className="workflow-visual"><div><Icon name="users" /><span>Customers</span></div><i /><div><Icon name="bag" /><span>Sales orders</span></div><i /><div><Icon name="box" /><span>Deliveries</span></div></div>
        <div className="login-caption"><Icon name="shield" size={18} /><span>A dedicated workspace for your team.</span></div>
      </div><span className="login-footer">TLP Company · SalesSystem</span>
    </section>
    <section className="login-form-side"><div className="login-card"><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your workspace</h2><p>Use the account provided by your administrator.</p>
      <form onSubmit={submit}>
        {(error || initialError) && <div className="notice error" role="alert">{error || initialError}</div>}
        <label className="field">Username<input name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required maxLength={80} autoFocus /></label>
        <label className="field">Password<div className="password-input"><input name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button></div></label>
        <label className="checkbox"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Keep me signed in for 7 days</label>
        <button className="button primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<Icon name="arrowRight" size={18} /></button>
      </form><div className="login-help"><Icon name="lock" size={15} />Your records are saved to your company database.</div>
    </div></section>
  </main>;
}
