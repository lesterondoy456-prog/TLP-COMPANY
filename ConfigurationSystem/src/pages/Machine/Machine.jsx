import { useRealtimeRefresh } from '../../hooks/useRealtime.js';
import MachineForm from './MachineForm.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { validateConfiguration, withConfigurationValidation } from '../../helper/validation.js';
import { Icon } from '../../components/Icons.jsx';
import { MobileRecordCards, TableScroll, LoadingSkeleton, Badge, Empty, ErrorNotice } from '../../components/UI.jsx';
import '../../configuration.css';

const display = (value, field) => {
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  if (!value && value !== 0) return '—';
  if (field.key === 'createdAt') {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  }
  return String(value);
};

export default function Machine({ user, onNotice }) {
  const kind = 'machines';
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
  const hasLoaded = useRef(false);
  const admin = user.role === 'admin';
  const load = useCallback(async (quiet = false) => {
    const background = quiet === true && hasLoaded.current;
    const id = ++sequence.current;
    if (!background) { setLoading(true); setError(''); }
    try {
      const [definition, result] = await Promise.all([api('/api/configuration/masters'), api('/api/configuration/masters/machines')]);
      if (id !== sequence.current) return;
      const module = definition.modules?.find(item => item.kind === kind);
      if (!module) throw new Error('Configuration fields could not be loaded. Please refresh.');
      setMetadata(withConfigurationValidation(module)); setRecords(result.records || []);
      hasLoaded.current = true; setError('');
    } catch (failure) { if (id === sequence.current && !background) setError(failure.message); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [kind]);
  useRealtimeRefresh(() => load(true));
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
      await api('/api/configuration/masters/machines/' + record.id, { method: 'PUT', body: validateConfiguration(metadata, { ...record, isActive: !record.isActive }, record) });
      onNotice?.(record.isActive ? 'Configuration record deactivated.' : 'Configuration record activated.');
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }
  return <div className="configuration-workspace">
    <div className="page-heading"><div><span className="eyebrow">CONFIGURATION SYSTEM</span><h1>Machines</h1><p>{readOnly ? 'Review the recorded changes made in this system.' : 'Maintain machine reference records for production planning and process flow.'}</p></div>{admin && !readOnly && <button className="button primary" disabled={loading || !metadata} onClick={() => setDialog({ record: null })}><span className="plus">+</span>New record</button>}</div>
    <ErrorNotice message={error} />
    <section className="records-card" aria-label={metadata?.title || kind}>
      <div className="records-toolbar"><div className="records-title"><h2>{metadata?.title || 'Records'}</h2><span>{records.length}</span></div><div className="records-tools">
        {!readOnly && <label className="configuration-filter"><span className="sr-only">Configuration status</span><select aria-label="Configuration status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
        <label className="search-input"><Icon name="search" size={18} /><input type="search" aria-label="Search configuration records" placeholder="Search records…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        <button className="icon-button" aria-label="Refresh configuration" disabled={loading || saving} onClick={load}><Icon name="refresh" size={18} /></button>
      </div></div>
      {loading && !hasLoaded.current ? <LoadingSkeleton /> : loading ? <div className="loading-state" role="status"><span className="spinner" />Loading records…</div> : !visible.length ? <Empty icon="grid" title={query ? 'No matching records' : 'No records yet'} detail={readOnly ? 'Recorded system changes will appear here.' : admin ? 'Select New record to add the configuration you need.' : 'An administrator can maintain these configuration records.'} /> : <><TableScroll className="desktop-records" label="Configuration record columns"><table className="records-table configuration-table"><thead><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}{!readOnly && <><th>Status</th><th>Deleted Date</th></>}{admin && !readOnly && <th>Actions</th>}</tr></thead><tbody>{visible.map(record => <tr key={record.id}>{fields.map(field => <td key={field.key}>{display(record[field.key], field)}</td>)}{!readOnly && <><td><Badge value={record.isActive ? 'active' : 'inactive'}>{record.isActive ? 'Active' : 'Inactive'}</Badge></td><td>{display(record.deletedDate, { key: 'createdAt' })}</td></>}{admin && !readOnly && <td><div className="row-actions"><button className="text-button" disabled={saving} onClick={() => setDialog({ record })}>Edit</button><button className="text-button" disabled={saving} onClick={() => changeStatus(record)}>{record.isActive ? 'Deactivate' : 'Activate'}</button></div></td>}</tr>)}</tbody></table></TableScroll>
        <MobileRecordCards records={visible} fields={[...fields, { key: 'deletedDate', label: 'Deleted Date' }]} title={record => display(record[fields[0]?.key], fields[0] || {})} status={record => <Badge value={record.isActive ? 'active' : 'inactive'}>{record.isActive ? 'Active' : 'Inactive'}</Badge>} renderField={(record, field) => display(record[field.key], field.key === 'deletedDate' ? { key: 'createdAt' } : field)} actions={admin && !readOnly ? record => <><button className="text-button" disabled={saving} onClick={() => setDialog({ record })}>Edit</button><button className="text-button" disabled={saving} onClick={() => changeStatus(record)}>{record.isActive ? 'Deactivate' : 'Activate'}</button></> : undefined} /></>}
      <div className="table-footer"><span>{filtered.length} records{readOnly ? ' · Most recent 1,000 changes' : ''}</span><div><button className="icon-button" aria-label="Previous configuration page" disabled={safePage <= 1 || loading} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next configuration page" disabled={safePage >= pages || loading} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
    {dialog && <MachineForm kind={kind} metadata={metadata} record={dialog.record} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onNotice?.('Configuration saved.'); load(); }} />}
  </div>;
}
