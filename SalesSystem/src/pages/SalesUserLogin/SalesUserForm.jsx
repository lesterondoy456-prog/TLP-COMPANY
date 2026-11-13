import React, { useState } from 'react';
import { api, money, unitMoney, today, dateInput, dateLabel } from '../../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../../salesPricing.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, FormFooter, ErrorNotice, Badge, PhotoField, roleLabel } from '../../components/UI.jsx';
import useSave from '../../hooks/useSave.js';

const trimFields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));

export default function SalesUserForm({ record, profile = false, actorRole = 'sales', onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', username: '', cpnumber: '', email: '', photo: '', role: 'sales', isActive: true, ...record, password: '' });
  const { busy, error, save } = useSave(onSaved);
  const canAssignRoles = actorRole === 'admin';
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  function submit(event) {
    event.preventDefault();
    if (!profile && ((!canAssignRoles && record) || (!canAssignRoles && actorRole !== 'saleshead'))) {
      save(() => Promise.reject(new Error('You do not have permission to manage this user account.')));
      return;
    }
    const body = trimFields({ name: form.name, username: form.username, cpnumber: form.cpnumber, email: form.email, photo: form.photo });
    for (const key of ['cpnumber', 'email', 'photo']) if (!body[key]) body[key] = null;
    if (!profile) { body.role = canAssignRoles ? form.role : 'sales'; body.isActive = record ? form.isActive : true; if (form.password) body.password = form.password; }
    save(() => api(profile ? '/api/sales/auth/profile' : record ? '/api/sales/users/' + record.id : '/api/sales/users', { method: profile || record ? 'PUT' : 'POST', body }));
  }
  return <Modal title={profile ? 'My profile' : record ? 'Edit user account' : 'New user account'} subtitle={profile ? 'Your details in the TTI Laguna Philippines Inc. workspace.' : 'Manage access to your sales system.'} onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <PhotoField value={form.photo} name={form.name} onChange={value => set('photo', value)} />
      <Field label="Full name *"><input required maxLength={150} value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" /></Field>
      <Field label="Username *" hint="Use letters, numbers, underscores, dots, or hyphens."><input required maxLength={80} minLength={3} value={form.username} onChange={e => set('username', e.target.value)} autoComplete="off" /></Field>
      <Field label="Mobile number"><input type="tel" maxLength={30} value={form.cpnumber || ''} onChange={e => set('cpnumber', e.target.value)} autoComplete="tel" /></Field>
      <Field label="Email"><input type="email" maxLength={254} value={form.email || ''} onChange={e => set('email', e.target.value)} autoComplete="email" /></Field>
      {profile ? <Field label="Role" wide><input value={roleLabel(form.role)} disabled /></Field> : <>
        <Field label="Role *"><select value={canAssignRoles ? form.role : 'sales'} disabled={!canAssignRoles} onChange={e => set('role', e.target.value)}><option value="sales">Sales</option>{canAssignRoles && <><option value="saleshead">Sales Head</option><option value="admin">Administrator</option></>}</select></Field>
        <Field label={record ? 'New password (optional)' : 'Password *'} hint={record ? 'Leave blank to keep the current password. New passwords need at least 6 characters.' : 'Use at least 6 characters.'}><input type="password" minLength={6} maxLength={128} required={!record} value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" /></Field>
        {record && <label className="checkbox span-2"><input type="checkbox" checked={Boolean(form.isActive)} onChange={e => set('isActive', e.target.checked)} />Account is active</label>}
      </>}
    </fieldset></div><FormFooter onClose={onClose} busy={busy} label={profile ? 'Save profile' : 'Save user'} /></form>
  </Modal>;
}
