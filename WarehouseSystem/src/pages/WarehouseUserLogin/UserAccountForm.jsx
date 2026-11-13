import React, { useState } from 'react';
import { api, SYSTEM } from '../../api.js';
import { validateAccountForm } from '../../helper/validation.js';
import { APP } from '../../appSettings.js';
import { ErrorNotice, Field, FormFooter, Modal, PhotoField } from '../../components/UI.jsx';

export default function UserAccountForm({ record, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', username: '', cpnumber: '', email: '', photo: '',
    role: APP.workerRole, isActive: true, ...record, password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const body = {
      name: form.name.trim(), username: form.username.trim(), cpnumber: (form.cpnumber || '').trim(),
      email: (form.email || '').trim(), photo: form.photo || '', role: form.role, isActive: form.isActive,
    };
    if (form.password) body.password = form.password;
    try {
      validateAccountForm(body, { create: !record });
      const result = await api('/api/warehouse/users' + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body });
      if (result.record?.system !== SYSTEM) throw new Error('The server returned an account for another application.');
      onSaved(result.record);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={record ? 'Edit user account' : 'New user account'} subtitle={APP.userTable} onClose={onClose} busy={busy}>
    <form onSubmit={submit}>
      <div className="modal-body"><ErrorNotice message={error} />
        <fieldset className="form-grid" disabled={busy}>
          <PhotoField value={form.photo} name={form.name} onChange={value => set('photo', value)} />
          <Field label="Full name *"><input required maxLength={150} autoComplete="name" value={form.name} onChange={event => set('name', event.target.value)} /></Field>
          <Field label="Username *" hint="Use letters, numbers, underscores, dots, or hyphens."><input required minLength={3} maxLength={80} autoComplete="off" value={form.username} onChange={event => set('username', event.target.value)} /></Field>
          <Field label="Mobile number"><input type="tel" maxLength={30} value={form.cpnumber || ''} onChange={event => set('cpnumber', event.target.value)} /></Field>
          <Field label="Email"><input type="email" maxLength={254} value={form.email || ''} onChange={event => set('email', event.target.value)} /></Field>
          <Field label="Role *"><select value={form.role} onChange={event => set('role', event.target.value)}><option value={APP.workerRole}>{APP.workerLabel}</option><option value="admin">Administrator</option></select></Field>
          <Field label={record ? 'New password (optional)' : 'Password *'} hint={record ? 'Leave blank to keep the current password.' : 'Use at least 6 characters.'}><input type="password" minLength={6} maxLength={128} required={!record} autoComplete="new-password" value={form.password} onChange={event => set('password', event.target.value)} /></Field>
          <label className="checkbox span-2"><input type="checkbox" checked={Boolean(form.isActive)} onChange={event => set('isActive', event.target.checked)} />Account is active</label>
        </fieldset>
      </div>
      <FormFooter onClose={onClose} busy={busy} label="Save user" />
    </form>
  </Modal>;
}
