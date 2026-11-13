import React, { useState } from 'react';
import { Icon } from './Icons.jsx';
import { Empty } from './UI.jsx';

export function PageHeading({ title, description, addLabel, loading, onAdd }) {
  return <div className="page-heading"><div><span className="eyebrow">SALES WORKSPACE</span><h1>{title}</h1><p>{description}</p></div><button className="button primary" disabled={loading} onClick={onAdd}><span className="plus">+</span>{addLabel}</button></div>;
}

export default function RecordsCard({ title, label, icon, addLabel, rows, loading, loaded, onRefresh, headers, renderRow }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = rows.filter(row => Object.values(row).some(value => ['string', 'number'].includes(typeof value) && String(value).toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * 10, safePage * 10);
  return <section className="records-card" aria-label={title}>
    <div className="records-toolbar"><div className="records-title"><h2>{label}</h2><span>{rows.length}</span></div><div className="records-tools"><label className="search-input"><Icon name="search" size={18} /><input type="search" aria-label={'Search ' + label.toLowerCase()} placeholder={'Search ' + label.toLowerCase() + '…'} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><button className={'icon-button refresh-button ' + (loading ? 'spinning' : '')} title="Refresh records" aria-label="Refresh records" onClick={onRefresh} disabled={loading}><Icon name="refresh" size={18} /></button></div></div>
    {loading && !loaded ? <div className="loading-state" role="status"><span className="spinner" />Loading your {label.toLowerCase()}…</div> : !visible.length ? <Empty icon={icon} title={query ? 'No matching records' : 'Your ' + label.toLowerCase() + ' start here'} detail={query ? 'Try another name, code, or document number.' : 'Select “' + addLabel + '” to add your first record.'} /> : <div className="table-scroll"><table className="records-table"><thead><tr>{headers}</tr></thead><tbody>{visible.map(row => <tr key={row.id}>{renderRow(row)}</tr>)}</tbody></table></div>}
    <div className="table-footer"><span>{filtered.length ? ((safePage - 1) * 10 + 1) + '–' + Math.min(safePage * 10, filtered.length) : '0'} of {filtered.length.toLocaleString('en-PH')} records</span><div><button className="icon-button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
  </section>;
}
