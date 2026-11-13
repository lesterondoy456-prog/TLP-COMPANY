import React, { useState } from 'react';
import { api } from '../../api.js';
import { ErrorNotice, Field, FormFooter, Modal, PhotoField, roleLabel } from '../../components/UI.jsx';
import { validateAccount } from '../../helper/validation.js';

export default function Profile({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user.name || '',
    username: user.username || '',
    cpnumber: user.cpnumber || '',
    email: user.email || '',
    photo: user.photo || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const invalid = validateAccount(form);
    if (Object.keys(invalid).length) { setError(Object.values(invalid)[0]); return; }
    setBusy(true);
    setError('');
    const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, ['name', 'username'].includes(key) ? value.trim() : value.trim() || null]));
    try {
      const result = await api('/api/purchasing/auth/profile', { method: 'PUT', body });
      onSaved(result.user);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="My profile" subtitle="Your account details." onClose={onClose} busy={busy}>
    <form onSubmit={submit}>
      <div className="modal-body">
        <ErrorNotice message={error} />
        <fieldset className="form-grid" disabled={busy}>
          <PhotoField value={form.photo} name={form.name} onChange={value => set('photo', value)} />
          <Field label="Full name *"><input required maxLength={150} autoComplete="name" value={form.name} onChange={event => set('name', event.target.value)} /></Field>
          <Field label="Username *" hint="Use letters, numbers, underscores, dots, or hyphens."><input required minLength={3} maxLength={80} autoComplete="username" value={form.username} onChange={event => set('username', event.target.value)} /></Field>
          <Field label="Mobile number"><input type="tel" maxLength={30} autoComplete="tel" value={form.cpnumber} onChange={event => set('cpnumber', event.target.value)} /></Field>
          <Field label="Email"><input type="email" maxLength={254} autoComplete="email" value={form.email} onChange={event => set('email', event.target.value)} /></Field>
          <Field label="Role" wide><input value={roleLabel(user.role)} disabled /></Field>
        </fieldset>
      </div>
      <FormFooter onClose={onClose} busy={busy} label="Save profile" />
    </form>
  </Modal>;
}
