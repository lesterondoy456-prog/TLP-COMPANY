import React, { useState } from 'react';
import { api } from '../../api.js';
import { validateAccountForm } from '../../helper/validation.js';
import { ErrorNotice, Field, FormFooter, Modal, PhotoField, roleLabel } from '../../components/UI.jsx';

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
    const formElement = event.currentTarget;
    setError('');
    try {
      const body = validateAccountForm(form, { profile: true });
      setBusy(true);
      const result = await api('/api/configuration/auth/profile', { method: 'PUT', body });
      onSaved(result.user);
    } catch (error) {
      setError(error.message);
      if (error.field) formElement.elements.namedItem(error.field)?.focus();
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="My profile" subtitle="Your account details." onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate>
      <div className="modal-body">
        <ErrorNotice message={error} />
        <fieldset className="form-grid" disabled={busy}>
          <PhotoField value={form.photo} name={form.name} onChange={value => set('photo', value)} />
          <Field label="Full name *"><input name="name" required maxLength={150} autoComplete="name" value={form.name} onChange={event => set('name', event.target.value)} /></Field>
          <Field label="Username" hint="Username cannot be changed."><input name="username" readOnly autoComplete="username" value={user.username || ''} /></Field>
          <Field label="Mobile number"><input name="cpnumber" type="tel" maxLength={30} autoComplete="tel" value={form.cpnumber} onChange={event => set('cpnumber', event.target.value)} /></Field>
          <Field label="Email"><input name="email" type="email" maxLength={254} autoComplete="email" value={form.email} onChange={event => set('email', event.target.value)} /></Field>
          <Field label="Role" wide><input value={roleLabel(user.role)} disabled /></Field>
        </fieldset>
      </div>
      <FormFooter onClose={onClose} busy={busy} label="Save profile" />
    </form>
  </Modal>;
}
