import { useRealtimeRefresh } from '../../hooks/useRealtime.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, dateLabel } from '../../api.js';
import { LoadingSkeleton, Badge, Empty, ErrorNotice, Modal } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import { PurchasingDocumentView, currencyLabel, quantityLabel, statusLabel, documentTitle } from '../../components/PurchasingDisplay.jsx';
import { receivingPostingIssue } from '../../helper/validation.js';
import { SuppliesForm } from './SuppliesForm.jsx';

function DeactivateDialog({ record, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function deactivate() {
    setBusy(true);
    setError('');
    try {
      const result = await api(`/api/purchasing/supplies/${record.id}`, { method: 'DELETE' });
      onSaved(result);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title="Deactivate this record?" subtitle={record.name} onClose={onClose} busy={busy}>
    <div className="modal-body"><ErrorNotice message={error} /><p className="purchase-action-description">The record remains in document history and becomes unavailable for new selections. You can reactivate it from Edit.</p></div>
    <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>Keep active</button><button className="button danger" disabled={busy} onClick={deactivate}>{busy ? 'Deactivating…' : 'Deactivate'}</button></div>
  </Modal>;
}

export default function Supplies({ user, onNotice }) {
  const current = { title: 'Supplies', icon: 'box', add: 'New supplies' };
  const master = true;
  const [records, setRecords] = useState([]);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [busyRow, setBusyRow] = useState(null);
  const requests = useRef(0);
  const hasLoaded = useRef(false);
  const detailRequests = useRef(0);

  const reload = useCallback(async (quiet = false) => {
    const background = quiet === true && hasLoaded.current;
    const request = ++requests.current;
    if (!background) { setLoading(true); setError(''); }
    try {
      const [listing, reference] = await Promise.all([
        api('/api/purchasing/supplies'),
        api('/api/purchasing/purchasing-options'),
      ]);
      if (request !== requests.current) return;
      setRecords(listing.records || []);
      setOptions(reference);
      hasLoaded.current = true;
      setError('');
      setLoaded(true);
    } catch (error) {
      if (request === requests.current && !background) setError(error.message);
    } finally {
      if (request === requests.current) setLoading(false);
    }
  }, []);

  useRealtimeRefresh(() => reload(true));

  useEffect(() => {
    reload();
    return () => { requests.current++; detailRequests.current++; };
  }, [reload]);


  async function open(record, type) {
    const request = ++detailRequests.current;
    setBusyRow(record.id);
    setError('');
    try {
      const result = await api(`/api/purchasing/supplies/${record.id}`);
      if (request === detailRequests.current) setDialog({ type, record: result.record });
    } catch (error) {
      if (request === detailRequests.current) setError(error.message);
    } finally {
      if (request === detailRequests.current) setBusyRow(null);
    }
  }

  function saved() {
    const message = dialog?.type === 'post' ? 'Document posted.' : dialog?.type === 'cancel' ? 'Document cancelled.' : dialog?.type === 'deactivate' ? 'Record deactivated.' : 'Changes saved.';
    setDialog(null);
    onNotice?.(message);
    reload();
  }

  const term = query.trim().toLowerCase();
  const filtered = records.filter(record => {
    const recordDate = String(record.prDate || record.poDate || record.srrDate || '').slice(0, 10);
    if (master && status && Boolean(record.isActive) !== (status === 'active')) return false;
    if (!master && status && record.status !== status) return false;
    if (!master && from && recordDate < from) return false;
    if (!master && to && recordDate > to) return false;
    return [record.name, record.shortName, record.code, record.description, record.number, record.supplierName, record.requestedBy, record.requestedDept, record.preparedBy, record.receivedBy, record.invoiceNumber,
      ...(record.items || []).flatMap(item => [item.suppliesCode, item.suppliesName, item.description, item.requestNumber])]
      .some(value => String(value || '').toLowerCase().includes(term));
  });
  const lines = master ? filtered.map(record => ({ record })) : filtered.flatMap(record => (record.items?.length ? record.items : [{}]).map(item => ({ record, item })));
  const pages = Math.max(1, Math.ceil(lines.length / 10));
  const safePage = Math.min(page, pages);
  const visible = lines.slice((safePage - 1) * 10, safePage * 10);
  const close = () => setDialog(null);

  function actions(record) {
    if (master) return <div className="row-actions"><button className="text-button" disabled={busyRow === record.id} onClick={() => open(record, 'edit')}>Edit</button>{record.isActive && <button className="text-button danger-text" onClick={() => setDialog({ type: 'deactivate', record })}>Deactivate</button>}</div>;
    return <div className="row-actions">
      <button className="text-button" disabled={busyRow === record.id} onClick={() => open(record, 'view')}>{busyRow === record.id ? 'Opening…' : 'View'}</button>
      {record.status === 'draft' && <><button className="text-button" disabled={busyRow === record.id} onClick={() => open(record, 'edit')}>Edit</button><button className="text-button" disabled={busyRow === record.id} onClick={() => open(record, 'post')}>Post</button><button className="text-button danger-text" disabled={busyRow === record.id} onClick={() => open(record, 'cancel')}>Cancel document</button></>}
    </div>;
  }

  return <section className="purchasing-workspace">
    <div className="page-heading"><div><span className="eyebrow">PURCHASING WORKSPACE</span><h1>{current.title}</h1><p>Maintain raw materials, supplier prices, units, and inventory schedules.</p></div><button className="button primary" disabled={loading || !loaded} onClick={() => setDialog({ type: 'new' })}><span className="plus" aria-hidden="true">+</span>{current.add}</button></div>
    <ErrorNotice message={error} />
    <section className="records-card" aria-label={current.title + ' records'}>
      <div className="records-toolbar purchasing-toolbar"><div className="records-title"><h2>{master ? current.title : 'Documents'}</h2><span>{filtered.length}</span></div><div className="purchasing-filters">
        <label className="search-input"><Icon name="search" size={17} /><input type="search" aria-label={'Search ' + current.title} placeholder="Search records…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        <label className="sr-only" htmlFor="purchasing-status-filter">Status</label><select id="purchasing-status-filter" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{master ? <><option value="active">Active</option><option value="inactive">Inactive</option></> : <><option value="draft">Not Yet Posted</option><option value="posted">Posted</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></>}</select>
        {!master && <><label className="purchase-filter-date">From<input type="date" aria-label="Covered Date from" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label><label className="purchase-filter-date">To<input type="date" aria-label="Covered Date to" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setPage(1); }} /></label></>}
        <button className={'icon-button refresh-button ' + (loading ? 'spinning' : '')} aria-label="Refresh purchasing records" title="Refresh records" disabled={loading} onClick={reload}><Icon name="refresh" size={18} /></button>
      </div></div>
      {loading && !loaded ? <LoadingSkeleton label="Loading purchasing records…" /> : !loaded ? <Empty icon="file" title="Records could not be loaded" detail="Use Refresh records to try again." /> : !visible.length ? <Empty icon={current.icon} title={query || status || from || to ? 'No matching records' : 'No records yet'} detail={query || status || from || to ? 'Try another search or filter.' : 'Select “' + current.add + '” to add a record.'} /> : <div className="table-scroll"><table className="records-table purchasing-monitor-table"><thead><tr>
        <><th>Supplies</th><th>Description</th><th>UOM</th><th className="numeric">Minimum Stock</th><th className="numeric">Stock</th></>
        <th>Status</th><th className="actions-heading">Actions</th>
      </tr></thead><tbody>{visible.map(({ record, item }, index) => <tr key={record.id + '-' + (item?.id ?? index)}>
        <><td><strong>{record.name}</strong><small>{record.code}</small></td><td>{record.description || '—'}</td><td>{record.unit}</td><td className="numeric">{quantityLabel(record.minimumStock)}</td><td className="numeric">{quantityLabel(record.stock)}</td></>
        <td><Badge value={master ? record.isActive ? 'active' : 'inactive' : record.status}>{master ? record.isActive ? 'Active' : 'Inactive' : statusLabel(record.status)}</Badge></td><td>{actions(record)}</td>
      </tr>)}</tbody></table></div>}
      <div className="table-footer"><span>{lines.length ? (safePage - 1) * 10 + 1 : 0}–{Math.min(safePage * 10, lines.length)} of {lines.length} {master ? 'records' : 'lines'}</span><div><button className="icon-button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
    {dialog && ['new', 'edit'].includes(dialog.type) && <SuppliesForm record={dialog.record} options={options} user={user} onClose={close} onSaved={saved} />}
    {dialog?.type === 'deactivate' && <DeactivateDialog kind="supplies" record={dialog.record} onClose={close} onSaved={saved} />}
  </section>;
}
