import { withConfigurationValidation } from '../helper/validation.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import { Empty, ErrorNotice } from '../components/UI.jsx';
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

export default function AuditTrail() {
  const kind = 'audit-trail';
  const [metadata, setMetadata] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true); setError('');
    try {
      const [definition, result] = await Promise.all([api('/api/configuration/masters'), api('/api/configuration/masters/audit-trail')]);
      if (id !== sequence.current) return;
      const module = definition.modules?.find(item => item.kind === kind);
      if (!module) throw new Error('Configuration fields could not be loaded. Please refresh.');
      setMetadata(withConfigurationValidation(module)); setRecords(result.records || []);
    } catch (failure) { if (id === sequence.current) setError(failure.message); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [kind]);
  useEffect(() => { load(); return () => { sequence.current++; }; }, [load]);
  const fields = metadata?.fields || [];
  const filtered = records.filter(row => fields.some(field => String(row[field.key] ?? '').toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 15));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * 15, safePage * 15);
  return <div className="configuration-workspace">
    <div className="page-heading"><div><span className="eyebrow">CONFIGURATION SYSTEM</span><h1>Audit Trail</h1><p>Review the recorded changes made in this system.</p></div></div>
    <ErrorNotice message={error} />
    <section className="records-card" aria-label={metadata?.title || kind}>
      <div className="records-toolbar"><div className="records-title"><h2>{metadata?.title || 'Records'}</h2><span>{records.length}</span></div><div className="records-tools">
        <label className="search-input"><Icon name="search" size={18} /><input type="search" aria-label="Search configuration records" placeholder="Search records…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        <button className="icon-button" aria-label="Refresh configuration" disabled={loading} onClick={load}><Icon name="refresh" size={18} /></button>
      </div></div>
      {loading ? <div className="loading-state" role="status"><span className="spinner" />Loading records…</div> : !visible.length ? <Empty icon="grid" title={query ? 'No matching records' : 'No records yet'} detail="Recorded system changes will appear here." /> : <div className="table-scroll"><table className="records-table configuration-table"><thead><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{visible.map(record => <tr key={record.id}>{fields.map(field => <td key={field.key}>{display(record[field.key], field)}</td>)}</tr>)}</tbody></table></div>}
      <div className="table-footer"><span>{filtered.length} records - Most recent 1,000 changes</span><div><button className="icon-button" aria-label="Previous configuration page" disabled={safePage <= 1 || loading} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next configuration page" disabled={safePage >= pages || loading} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
  </div>;
}
