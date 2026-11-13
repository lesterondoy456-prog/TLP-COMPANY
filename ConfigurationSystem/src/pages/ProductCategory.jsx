import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { validateConfiguration } from '../helper/validation.js';
import { Icon } from '../components/Icons.jsx';
import { Badge, Empty, ErrorNotice, Field, FormFooter, Modal } from '../components/UI.jsx';
import '../configuration.css';

const display = (value, field) => {
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  if (!value && value !== 0) return '—';
  if (field.key === 'createdAt') {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  }
  return String(value);
};

export default function ProductCategory({ user, onNotice }) {
  const kind = 'product-categories';
  const [metadata, setMetadata] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const sequence = useRef(0);
  const admin = user.role === 'admin';
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true); setError('');
    try {
      const [definition, result] = await Promise.all([api('/api/configuration/masters'), api('/api/configuration/masters/product-categories')]);
      if (id !== sequence.current) return;
      const module = definition.modules?.find(item => item.kind === kind);
      if (!module) throw new Error('Configuration fields could not be loaded. Please refresh.');
      setMetadata(module); setRecords(result.records || []);
    } catch (failure) { if (id === sequence.current) setError(failure.message); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [kind]);
  useEffect(() => { load(); return () => { sequence.current++; }; }, [load]);
  const fields = metadata?.fields || [];
  const readOnly = kind === 'audit-trail' || metadata?.readOnly;
  const filtered = records.filter(row => (readOnly || status === 'all' || Boolean(row.isActive) === (status === 'active')) && fields.some(field => String(row[field.key] ?? '').toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 15));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * 15, safePage * 15);
  async function changeStatus(record) {
    setSaving(true); setError('');
    try {
      await api('/api/configuration/masters/product-categories/' + record.id, { method: 'PUT', body: validateConfiguration(metadata, { ...record, isActive: !record.isActive }, record) });
      onNotice?.(record.isActive ? 'Configuration record deactivated.' : 'Configuration record activated.');
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }
  return <div className="configuration-workspace">
    <div className="page-heading"><div><span className="eyebrow">CONFIGURATION SYSTEM</span><h1>Product Category</h1><p>{readOnly ? 'Review the recorded changes made in this system.' : 'Maintain the reference records used across Sales, Purchasing, and Warehouse.'}</p></div>{admin && !readOnly && <button className="button primary" disabled={loading || !metadata} onClick={() => setDialog({ record: null })}><span className="plus">+</span>New record</button>}</div>
    <ErrorNotice message={error} />
    <section className="records-card" aria-label={metadata?.title || kind}>
      <div className="records-toolbar"><div className="records-title"><h2>{metadata?.title || 'Records'}</h2><span>{records.length}</span></div><div className="records-tools">
        {!readOnly && <label className="configuration-filter"><span className="sr-only">Configuration status</span><select aria-label="Configuration status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
        <label className="search-input"><Icon name="search" size={18} /><input type="search" aria-label="Search configuration records" placeholder="Search records…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        <button className="icon-button" aria-label="Refresh configuration" disabled={loading || saving} onClick={load}><Icon name="refresh" size={18} /></button>
      </div></div>
      {loading ? <div className="loading-state" role="status"><span className="spinner" />Loading records…</div> : !visible.length ? <Empty icon="grid" title={query ? 'No matching records' : 'No records yet'} detail={readOnly ? 'Recorded system changes will appear here.' : admin ? 'Select New record to add the configuration you need.' : 'An administrator can maintain these configuration records.'} /> : <div className="table-scroll"><table className="records-table configuration-table"><thead><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}{!readOnly && <><th>Status</th><th>Deleted Date</th></>}{admin && !readOnly && <th>Actions</th>}</tr></thead><tbody>{visible.map(record => <tr key={record.id}>{fields.map(field => <td key={field.key}>{display(record[field.key], field)}</td>)}{!readOnly && <><td><Badge value={record.isActive ? 'active' : 'inactive'}>{record.isActive ? 'Active' : 'Inactive'}</Badge></td><td>{display(record.deletedDate, { key: 'createdAt' })}</td></>}{admin && !readOnly && <td><div className="row-actions"><button className="text-button" disabled={saving} onClick={() => setDialog({ record })}>Edit</button><button className="text-button" disabled={saving} onClick={() => changeStatus(record)}>{record.isActive ? 'Deactivate' : 'Activate'}</button></div></td>}</tr>)}</tbody></table></div>}
      <div className="table-footer"><span>{filtered.length} records{readOnly ? ' · Most recent 1,000 changes' : ''}</span><div><button className="icon-button" aria-label="Previous configuration page" disabled={safePage <= 1 || loading} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next configuration page" disabled={safePage >= pages || loading} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
    {dialog && <ProductCategoryForm kind={kind} metadata={metadata} record={dialog.record} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onNotice?.('Configuration saved.'); load(); }} />}
  </div>;
}

function ProductCategoryForm({ kind, metadata, record, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({ ...Object.fromEntries(metadata.fields.map(field => [field.key, record?.[field.key] ?? field.default ?? ''])), isActive: record?.isActive ?? true }));
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
      await api(record ? '/api/configuration/masters/product-categories/' + record.id : '/api/configuration/masters/product-categories', { method: record ? 'PUT' : 'POST', body });
      onSaved();
    } catch (failure) {
      setError(failure.message); setBusy(false);
      if (failure.field) formElement.elements.namedItem(failure.field)?.focus();
    }
  }
  return <Modal title={(record ? 'Edit ' : 'New ') + metadata.title} onClose={onClose} busy={busy} wide={metadata.fields.length > 5} className="configuration-modal"><form onSubmit={save} noValidate>
    <div className="modal-body"><ErrorNotice message={error} /><div className="form-grid">{metadata.fields.map(field => field.type === 'boolean' ? <label className="configuration-checkbox" key={field.key}><input name={field.key} type="checkbox" checked={Boolean(values[field.key])} disabled={busy} onChange={event => change(field.key, event.target.checked)} /><span>{field.label}</span></label> : <Field key={field.key} label={field.label + (field.required ? ' *' : '')} wide={field.maxLength > 300}>
      {field.type === 'select' ? <select name={field.key} required={field.required} disabled={busy} value={values[field.key]} onChange={event => change(field.key, event.target.value)}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : field.maxLength > 300 ? <textarea name={field.key} required={field.required} disabled={busy} maxLength={field.maxLength} rows={3} value={values[field.key]} onChange={event => change(field.key, event.target.value)} /> : <input name={field.key} type={field.type === 'number' ? 'number' : 'text'} required={field.required || field.type === 'number'} disabled={busy} maxLength={field.maxLength} min={field.min} max={field.max} step={field.step} value={values[field.key]} onChange={event => change(field.key, event.target.value)} />}
    </Field>)}<label className="configuration-checkbox"><input name="isActive" type="checkbox" checked={values.isActive} disabled={busy} onChange={event => change('isActive', event.target.checked)} /><span>Active</span></label></div></div>
    <FormFooter onClose={onClose} busy={busy} />
  </form></Modal>;
}
