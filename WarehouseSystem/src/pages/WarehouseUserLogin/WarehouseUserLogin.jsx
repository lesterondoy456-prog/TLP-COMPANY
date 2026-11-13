import React, { useEffect, useRef, useState } from 'react';
import { api, SYSTEM } from '../../api.js';
import { APP } from '../../appSettings.js';
import { Avatar, Badge, ErrorNotice, LoadingSkeleton, roleLabel } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import UserAccountForm from './UserAccountForm.jsx';
import { useRealtimeRefresh } from '../../hooks/useRealtime.js';

export default function WarehouseUserLogin({ user, onUser, onNotice }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const sequence = useRef(0);

  async function load({ background = false } = {}) {
    const request = ++sequence.current;
    if (!background) setLoading(true);
    setError('');
    try {
      const result = await api('/api/warehouse/users');
      if (request === sequence.current) setRecords((result.records || []).filter(record => record.system === SYSTEM));
    } catch (error) {
      if (request === sequence.current) setError(error.message);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (user.role === 'admin' && user.system === SYSTEM) load();
    return () => { sequence.current++; };
  }, [user.role, user.system]);

  useRealtimeRefresh(() => load({ background: true }));

  function saved(record) {
    const ownAccount = record.system === user.system && record.id === user.id;
    if (ownAccount) onUser(record);
    setDialog(null);
    onNotice?.('User account saved.');
    if (!ownAccount || record.role === 'admin') load();
  }

  if (user.role !== 'admin' || user.system !== SYSTEM) return <ErrorNotice message="Only this application's administrators can manage its accounts." />;
  const filtered = records.filter(record => [record.name, record.username, record.email, record.cpnumber].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);

  return <section>
    <div className="page-heading"><div><span className="eyebrow">{APP.label.toUpperCase()} ACCOUNTS</span><h1>{APP.userTable}</h1><p>Manage accounts and access for {APP.appName}.</p></div><button className="button primary" disabled={loading} onClick={() => setDialog({})}><span className="plus" aria-hidden="true">+</span>New user</button></div>
    <ErrorNotice message={error} />
    <section className="records-card" aria-label={APP.userTable + ' accounts'}>
      <div className="records-toolbar"><div className="records-title"><h2>User accounts</h2><span>{records.length}</span></div><div className="records-tools"><label className="search-input"><Icon name="search" size={17} /><input type="search" aria-label="Search user accounts" placeholder="Search accounts…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><button className="icon-button refresh-button" aria-label="Refresh accounts" disabled={loading} onClick={load}><Icon name="refresh" size={17} /></button></div></div>
      {loading && !records.length ? <LoadingSkeleton label="Loading accounts" /> : <div className="table-scroll"><table className="records-table"><thead><tr><th>Team member</th><th>Username</th><th>Mobile number</th><th>Role</th><th>Status</th><th className="actions-heading">Actions</th></tr></thead><tbody>
        {visible.map(record => <tr key={record.system + '-' + record.id}><td><div className="entity-cell"><Avatar user={record} /><div><strong>{record.name}{record.system === user.system && record.id === user.id && <span className="you-label">you</span>}</strong><small>{record.email || '—'}</small></div></div></td><td>{record.username}</td><td>{record.cpnumber || '—'}</td><td><Badge value={record.role}>{roleLabel(record.role)}</Badge></td><td><Badge value={record.isActive ? 'active' : 'inactive'}>{record.isActive ? 'Active' : 'Inactive'}</Badge></td><td><div className="row-actions"><button className="text-button" onClick={() => setDialog({ record })}>Edit</button></div></td></tr>)}
        {!visible.length && <tr><td colSpan={6} style={{ padding: '35px', textAlign: 'center' }}>No matching accounts.</td></tr>}
      </tbody></table></div>}
      <div className="table-footer"><span>{filtered.length} accounts</span><div><button className="icon-button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {currentPage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
    {dialog && <UserAccountForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} />}
  </section>;
}
