import ThemeToggle from '../../components/ThemeToggle.jsx';
import React, { useState } from 'react';
import { Icon } from '../../components/Icons.jsx';
import { APP } from '../../appSettings.js';
import { validateLoginForm } from '../../helper/validation.js';

export default function Login({ onLogin, initialError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    setError('');
    try {
      const credentials = validateLoginForm({ username, password, remember });
      setBusy(true);
      await onLogin(credentials);
    } catch (error) {
      setError(error.message);
      if (error.field) formElement.elements.namedItem(error.field)?.focus();
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <ThemeToggle />
    <section className="login-story">
      <div className="brand"><div className="brand-mark">T</div><div><strong>TLP COMPANY</strong><span>{APP.appName}</span></div></div>
      <div className="login-story-body">
        <span className="eyebrow">{APP.eyebrow}</span>
        <h1>{APP.headline[0]}<br />{APP.headline[1]}</h1>
        <p>{APP.description}</p>
        <div className="workflow-visual">{APP.steps.map((step, index) => <React.Fragment key={step.label}>{index > 0 && <i />}<div><Icon name={step.icon} /><span>{step.label}</span></div></React.Fragment>)}</div>
        <div className="login-caption"><Icon name="shield" size={18} /><span>Your company account. Your dedicated workspace.</span></div>
      </div>
      <span className="login-footer">TLP Company · {APP.appName}</span>
    </section>
    <section className="login-form-side"><div className="login-card">
      <span className="eyebrow">WELCOME BACK</span><h2>Sign in to {APP.appName}</h2><p>Use your ConfigurationSystem account.</p>
      <form onSubmit={submit} noValidate>
        {(error || initialError) && <div className="notice error" role="alert">{error || initialError}</div>}
        <label className="field">Username<input name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} disabled={busy} required maxLength={80} autoFocus /></label>
        <label className="field">Password<div className="password-input"><input name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required maxLength={128} /><button type="button" className="icon-button" disabled={busy} aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button></div></label>
        <label className="checkbox"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={busy} />Keep me signed in for 7 days</label>
        <button className="button primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<Icon name="arrowRight" size={18} /></button>
      </form>
      <div className="login-help"><Icon name="lock" size={15} />Your account access is protected by your company server.</div>
    </div></section>
  </main>;
}
