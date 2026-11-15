import React, { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Empty, LoadingSkeleton } from './UI.jsx';

export function PageHeading({ title, description, addLabel, loading, onAdd }) {
  return <div className="page-heading"><div><span className="eyebrow">SALES</span><h1>{title}</h1><p>{description}</p></div><button className="button primary" disabled={loading} onClick={onAdd}><span className="plus">+</span>{addLabel}</button></div>;
}

function tableCells(children) {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement(child)) return [];
    return child.type === React.Fragment ? tableCells(child.props.children) : [child];
  }).map((cell, index) => React.cloneElement(cell, { key: index }));
}

export function MobileRecordCard({ title, titleLabel, fields, status, actions, preview, children }) {
  const primary = preview?.length ? fields.filter(field => preview.includes(field.label)) : fields.slice(0, 3);
  const remaining = fields.filter(field => !primary.includes(field));
  const fieldList = values => <dl className="record-mobile-fields">{values.map((field, index) => <div className={/address|description|remarks/i.test(String(field.label)) ? 'record-mobile-field-wide' : ''} key={field.label + index}><dt>{field.label}</dt><dd>{field.value ?? '—'}</dd></div>)}</dl>;
  return <article className="record-mobile-card">
    <div className="record-mobile-heading"><div className="record-mobile-identity">{titleLabel && <span className="record-mobile-eyebrow">{titleLabel}</span>}<div className="record-mobile-title">{title}</div></div>{status && <div className="record-mobile-status">{status}</div>}</div>
    {primary.length > 0 && fieldList(primary)}
    {remaining.length > 0 && <details className="record-mobile-details"><summary>More details<Icon name="chevronDown" size={15} /></summary>{fieldList(remaining)}</details>}
    {actions && <div className="record-mobile-actions">{actions}</div>}
    {children}
  </article>;
}

export default function RecordsCard({ title, label, icon, addLabel, rows, loading, loaded, onRefresh, headers, renderRow, mobilePreview }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const table = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const filtered = rows.filter(row => Object.values(row).some(value => ['string', 'number'].includes(typeof value) && String(value).toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * 10, safePage * 10);
  const columns = tableCells(headers);
  const rendered = visible.map(row => ({ id: row.id, cells: tableCells(renderRow(row)) }));
  const statusIndex = columns.findIndex(column => column.props.children === 'Status');
  const actionIndex = columns.findIndex(column => column.props.children === 'Actions' || column.props.className?.includes('actions-heading'));
  useLayoutEffect(() => {
    const element = table.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [loading, loaded, visible.length]);
  return <section className="records-card" aria-label={title} aria-busy={loading && !loaded}>
    <div className="records-toolbar"><div className="records-title"><h2>{label}</h2>{loaded && <span>{rows.length}</span>}</div><div className="records-tools"><label className="search-input"><Icon name="search" size={18} /><input type="search" aria-label={'Search ' + label.toLowerCase()} placeholder={'Search ' + label.toLowerCase() + '…'} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><button className={'icon-button refresh-button ' + (loading ? 'spinning' : '')} title="Refresh records" aria-label="Refresh records" onClick={onRefresh} disabled={loading}><Icon name="refresh" size={18} /></button></div></div>
    {loading && !loaded ? <LoadingSkeleton label={'Loading your ' + label.toLowerCase()} /> : !visible.length ? <Empty icon={icon} title={query ? 'No matching records' : 'Your ' + label.toLowerCase() + ' start here'} detail={query ? 'Try another name, code, or document number.' : 'Select “' + addLabel + '” to add your first record.'} /> : <>
      {overflow && <p className="table-scroll-hint"><Icon name="arrowRight" size={14} />Scroll sideways to see all columns.</p>}
      <div className="table-scroll records-desktop-table" ref={table} tabIndex={0} role="region" aria-label={label + ' table'}><table className="records-table"><thead><tr>{headers}</tr></thead><tbody>{rendered.map(row => <tr key={row.id}>{row.cells}</tr>)}</tbody></table></div>
      <div className="record-mobile-list">{rendered.map(row => <MobileRecordCard key={row.id} titleLabel={columns[0]?.props.children} title={row.cells[0]?.props.children} status={statusIndex >= 0 ? row.cells[statusIndex]?.props.children : null} actions={actionIndex >= 0 ? row.cells[actionIndex]?.props.children : null} preview={mobilePreview} fields={row.cells.flatMap((cell, index) => index === 0 || index === statusIndex || index === actionIndex ? [] : [{ label: columns[index]?.props.children || 'Details', value: cell.props.children }])} />)}</div>
    </>}
    <div className="table-footer"><span>{filtered.length ? ((safePage - 1) * 10 + 1) + '–' + Math.min(safePage * 10, filtered.length) : '0'} of {filtered.length.toLocaleString('en-PH')} records</span><div><button className="icon-button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
  </section>;
}
