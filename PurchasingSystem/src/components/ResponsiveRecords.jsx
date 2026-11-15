import React, { useLayoutEffect, useRef, useState } from 'react';
import './ResponsiveRecords.css';

export default function ResponsiveRecords({ rows, columns, titleKey, primaryKeys = [], subtitle, rowKey, actions, label = 'Records', tableClassName = '', empty = 'No matching records.' }) {
  const scroll = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const title = columns.find(column => column.key === titleKey) || columns[0];
  const status = columns.find(column => column.key === 'status');
  const fields = columns.filter(column => column !== title && column !== status);
  const primary = fields.filter(column => primaryKeys.includes(column.key));
  const remaining = fields.filter(column => !primaryKeys.includes(column.key));
  const value = (column, row) => column.render(row) ?? '\u2014';
  useLayoutEffect(() => {
    const container = scroll.current;
    if (!container) return;
    const measure = () => setOverflow(container.scrollWidth > container.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, [rows, columns]);
  return <div className="responsive-records">
    <div className="records-desktop">
      <div className="table-scroll" ref={scroll} tabIndex={overflow ? 0 : undefined} role="region" aria-label={label + ' table'}>
        <table className={'records-table ' + tableClassName}><thead><tr>{columns.map(column => <th key={column.key} className={column.numeric ? 'numeric' : undefined} scope="col">{column.label}</th>)}<th className="actions-heading" scope="col">Actions</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={rowKey(row, index)}>{columns.map(column => <td key={column.key} className={column.numeric ? 'numeric' : undefined}>{value(column, row)}</td>)}<td>{actions(row)}</td></tr>)}{!rows.length && <tr><td colSpan={columns.length + 1} className="responsive-records-empty">{empty}</td></tr>}</tbody>
        </table>
      </div>
      {overflow && <p className="table-scroll-hint">Scroll horizontally to see all columns and actions.</p>}
    </div>
    <div className="records-mobile" aria-label={label}>
      {rows.map((row, index) => <article className="record-card" key={rowKey(row, index)}>
        <div className="record-card-heading"><div className="record-card-identity"><span className="record-card-title-label">{title.label}</span><h3 className="record-card-title">{value(title, row)}</h3>{subtitle && <p className="record-card-subtitle">{subtitle(row)}</p>}</div>{status && <div className="record-card-status" aria-label={status.label}>{value(status, row)}</div>}</div>
        {!!primary.length && <dl className="record-card-fields">{primary.map(column => <div key={column.key}><dt>{column.label}</dt><dd>{value(column, row)}</dd></div>)}</dl>}
        {!!remaining.length && <details className="record-card-details"><summary>More details</summary><dl className="record-card-fields">{remaining.map(column => <div key={column.key}><dt>{column.label}</dt><dd>{value(column, row)}</dd></div>)}</dl></details>}
        <div className="record-card-actions" aria-label="Record actions">{actions(row)}</div>
      </article>)}
      {!rows.length && <p className="responsive-records-empty">{empty}</p>}
    </div>
  </div>;
}
