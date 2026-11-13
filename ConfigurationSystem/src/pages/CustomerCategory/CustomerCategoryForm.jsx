import React, { useState } from 'react';
import { api } from '../../api.js';
import { validateConfiguration } from '../../helper/validation.js';
import { ErrorNotice, Field, FormFooter, Modal } from '../../components/UI.jsx';

export default function CustomerCategoryForm({ kind, metadata, record, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({ ...Object.fromEntries(metadata.fields.map(field => [field.key, record ? record[field.key] ?? (field.type === 'boolean' ? field.default ?? false : '') : field.type === 'boolean' || field.required ? field.default ?? '' : ''])), isActive: record?.isActive ?? true }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => setValues(previous => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault(); if (busy) return;
    const formElement = event.currentTarget;
    setError('');
    try {
      const body = validateConfiguration(metadata, values, record);
      setBusy(true);
      await api(record ? '/api/configuration/masters/customer-categories/' + record.id : '/api/configuration/masters/customer-categories', { method: record ? 'PUT' : 'POST', body });
      onSaved();
    } catch (failure) {
      setError(failure.message); setBusy(false);
      if (failure.field) formElement.elements.namedItem(failure.field)?.focus();
    }
  }
  return <Modal title={(record ? 'Edit ' : 'New ') + metadata.title} onClose={onClose} busy={busy} wide={metadata.fields.length > 5} className="configuration-modal"><form onSubmit={save} noValidate>
    <div className="modal-body"><ErrorNotice message={error} /><div className="form-grid">{metadata.fields.map(field => field.type === 'boolean' ? <label className="configuration-checkbox" key={field.key}><input name={field.key} type="checkbox" checked={Boolean(values[field.key])} disabled={busy} onChange={event => change(field.key, event.target.checked)} /><span>{field.label}</span></label> : <Field key={field.key} label={field.label + (field.required ? ' *' : '')} wide={field.maxLength > 300}>
      {field.type === 'select' ? <select name={field.key} required={field.required} disabled={busy} value={values[field.key]} onChange={event => change(field.key, event.target.value)}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : field.maxLength > 300 ? <textarea name={field.key} required={field.required} disabled={busy} maxLength={field.maxLength} rows={3} value={values[field.key]} onChange={event => change(field.key, event.target.value)} /> : <input name={field.key} type={field.type === 'number' ? 'number' : 'text'} required={field.required} disabled={busy} maxLength={field.maxLength} min={field.min} max={field.max} step={field.step} value={values[field.key]} onChange={event => change(field.key, event.target.value)} />}
    </Field>)}<label className="configuration-checkbox"><input name="isActive" type="checkbox" checked={values.isActive} disabled={busy} onChange={event => change('isActive', event.target.checked)} /><span>Active</span></label></div></div>
    <FormFooter onClose={onClose} busy={busy} />
  </form></Modal>;
}
