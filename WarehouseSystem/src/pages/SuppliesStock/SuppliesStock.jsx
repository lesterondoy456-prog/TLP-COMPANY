import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api, dateLabel } from '../../api.js';
import { Empty, ErrorNotice } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import '../../warehouse.css';
import { useRealtimeRefresh } from '../../hooks/useRealtime.js';

const quantityFormat = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 });
const quantity = value => quantityFormat.format(Number(value) || 0);

function scaled(value) {
  const text = String(value || '0');
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  return (BigInt(whole || '0') * 1000000n + BigInt(fraction.padEnd(6, '0').slice(0, 6))) * (negative ? -1n : 1n);
}

function decimal(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative ? '-' : '') + (absolute / 1000000n).toString() + '.' + (absolute % 1000000n).toString().padStart(6, '0');
}

function summarize(records) {
  const groups = new Map();
  for (const row of records) {
    const id = Number(row.suppliesId);
    if (!groups.has(id)) groups.set(id, {
      suppliesId: id,
      code: row.code,
      name: row.name,
      description: row.description,
      category: row.category || '',
      unit: row.unit,
      minimumStock: row.minimumStock || '0',
      total: 0n,
      lots: [],
    });
    const group = groups.get(id);
    group.total += scaled(row.quantity);
    group.lots.push(row);
  }
  return [...groups.values()].map(group => ({ ...group, totalStock: decimal(group.total) }));
}

export default function SuppliesStock() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [movements, setMovements] = useState({});
  const [movementBusy, setMovementBusy] = useState(false);
  const [movementError, setMovementError] = useState('');
  const requestSequence = useRef(0);
  const movementSequence = useRef(0);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const loadMovements = useCallback(async (suppliesId, { background = false } = {}) => {
    const request = ++movementSequence.current;
    if (!background) setMovementBusy(true);
    setMovementError('');
    try {
      const result = await api('/api/warehouse/inventory/movements?suppliesId=' + suppliesId);
      if (request === movementSequence.current) setMovements(current => ({ ...current, [suppliesId]: result.records || [] }));
    } catch (error) {
      if (request === movementSequence.current) setMovementError(error.message);
    } finally {
      if (request === movementSequence.current) setMovementBusy(false);
    }
  }, []);

  const reload = useCallback(async ({ background = false } = {}) => {
    const request = ++requestSequence.current;
    if (!background) setLoading(true);
    setError('');
    try {
      const result = await api('/api/warehouse/inventory');
      if (request !== requestSequence.current) return;
      setRecords(result.records || []);
      if (!background) setMovements({});
      if (expandedRef.current != null) loadMovements(expandedRef.current, { background });
    } catch (error) {
      if (request === requestSequence.current) setError(error.message);
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [loadMovements]);

  useEffect(() => {
    reload();
    return () => { requestSequence.current++; movementSequence.current++; };
  }, [reload]);

  useRealtimeRefresh(() => reload({ background: true }));

  function toggle(suppliesId) {
    if (expanded === suppliesId) {
      movementSequence.current++;
      setExpanded(null);
      setMovementBusy(false);
      return;
    }
    movementSequence.current++;
    setMovementBusy(false);
    setExpanded(suppliesId);
    setMovementError('');
    if (!movements[suppliesId]) loadMovements(suppliesId);
  }

  const categories = [...new Set(records.map(row => row.category).filter(Boolean))].sort();
  const warehouses = [...new Map(records.map(row => [String(row.warehouseId), { id: row.warehouseId, code: row.warehouseCode, description: row.warehouseDescription }])).values()];
  const selectedRecords = records.filter(row => (!category || row.category === category) && (!warehouse || String(row.warehouseId) === warehouse));
  const grouped = summarize(selectedRecords);
  const search = query.trim().toLowerCase();
  const visible = grouped.filter(row => [row.code, row.name, row.description, row.category, ...row.lots.flatMap(lot => [lot.imLot, lot.warehouseCode, lot.locationCode])].some(value => String(value || '').toLowerCase().includes(search)));
  const belowMinimum = grouped.filter(row => scaled(row.totalStock) < scaled(row.minimumStock)).length;

  return <section className="warehouse-workspace">
    <div className="page-heading"><div><span className="eyebrow">WAREHOUSE WORKSPACE</span><h1>Supplies Stock</h1><p>View available supplies by warehouse, location, and lot. Posted receiving receipts update these balances.</p></div><button className="button secondary" disabled={loading} onClick={reload}><Icon name="refresh" size={16} />Refresh stock</button></div>
    <ErrorNotice message={error} />
    <div className="warehouse-overview">
      <div><span>Tracked supplies</span><strong>{grouped.length}</strong></div>
      <div><span>Warehouse / location lots</span><strong>{selectedRecords.length}</strong></div>
      <div><span>Below minimum stock</span><strong>{belowMinimum}</strong></div>
    </div>
    <section className="records-card" aria-label="Supplies stock records">
      <div className="records-toolbar warehouse-toolbar"><div className="records-title"><h2>Supplies stock</h2><span>{visible.length}</span></div><div className="warehouse-filters">
        <label className="search-input"><Icon name="search" size={17} /><input type="search" aria-label="Search supplies stock" placeholder="Search supplies or lot…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="sr-only" htmlFor="warehouse-category-filter">Category</label><select id="warehouse-category-filter" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>
        <label className="sr-only" htmlFor="warehouse-filter">Warehouse</label><select id="warehouse-filter" value={warehouse} onChange={event => setWarehouse(event.target.value)}><option value="">All warehouses</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.code}{row.description ? ' · ' + row.description : ''}</option>)}</select>
      </div></div>
      {loading && !records.length ? <div className="loading-state" role="status"><span className="spinner" />Loading supplies stock…</div> : !visible.length ? <Empty icon="box" title={query || category || warehouse ? 'No matching stock' : 'No supplies stock yet'} detail={query || category || warehouse ? 'Try another search or filter.' : 'Stock appears after a receiving receipt with warehouse allocations is posted.'} /> : <div className="table-scroll"><table className="records-table warehouse-summary-table"><thead><tr><th>Category</th><th>Supplies Name</th><th>Description</th><th>UOP</th><th className="numeric">Total Stock</th><th className="actions-heading">Details</th></tr></thead><tbody>
        {visible.map(row => <Fragment key={row.suppliesId}>
          <tr><td>{row.category || '—'}</td><td><strong>{row.name}</strong><small>{row.code}</small></td><td>{row.description || '—'}</td><td>{row.unit}</td><td className="numeric">{quantity(row.totalStock)}</td><td className="numeric"><button className="text-button" aria-expanded={expanded === row.suppliesId} onClick={() => toggle(row.suppliesId)}>{expanded === row.suppliesId ? 'Hide stock' : 'View stock'}</button></td></tr>
          {expanded === row.suppliesId && <tr className="warehouse-expanded-row"><td colSpan={6}><div className="warehouse-details">
            <div className="warehouse-detail-heading"><h3>Stock by location and lot</h3><span>{row.name}</span></div>
            <div className="table-scroll"><table className="warehouse-detail-table"><thead><tr><th>Warehouse</th><th>Location</th><th>IM Lot #</th><th>QC Status</th><th>Exp Date</th><th>MFG Date</th><th className="numeric">Available Qty</th></tr></thead><tbody>{row.lots.map(lot => <tr key={lot.id}><td>{lot.warehouseCode || '—'}</td><td>{lot.locationCode || '—'}</td><td>{lot.imLot || '—'}</td><td>{lot.qcStatus || '—'}</td><td>{dateLabel(lot.expiryDate)}</td><td>{dateLabel(lot.mfgDate)}</td><td className="numeric">{quantity(lot.quantity)}</td></tr>)}</tbody></table></div>
            <div className="warehouse-detail-heading"><h3>Receipt movements</h3><button className="text-button" disabled={movementBusy} onClick={() => loadMovements(row.suppliesId)}>Refresh movements</button></div>
            <ErrorNotice message={movementError} />
            {movementBusy ? <p className="warehouse-inline-status" role="status">Loading movements…</p> : <div className="table-scroll"><table className="warehouse-detail-table"><thead><tr><th>Form</th><th>Branch</th><th>Ref No.</th><th>Received Date</th><th>Warehouse</th><th>Location</th><th>IM Lot #</th><th className="numeric">Qty</th></tr></thead><tbody>{(movements[row.suppliesId] || []).filter(movement => !warehouse || row.lots.some(lot => String(lot.warehouseId) === warehouse && lot.warehouseCode === movement.warehouseCode)).map(movement => <tr key={movement.id}><td>{Number(movement.quantity) < 0 ? 'Receipt cancellation' : 'Receiving Receipt'}</td><td>TLP COMPANY</td><td>{movement.receiptNumber}</td><td>{dateLabel(movement.receivedDate || movement.createdAt)}</td><td>{movement.warehouseCode || '—'}</td><td>{movement.locationCode || '—'}</td><td>{movement.imLot || '—'}</td><td className="numeric">{quantity(movement.quantity)}</td></tr>)}{!(movements[row.suppliesId] || []).length && <tr><td colSpan={8} className="warehouse-no-movements">No receipt movements found.</td></tr>}</tbody></table></div>}
          </div></td></tr>}
        </Fragment>)}
      </tbody></table></div>}
      <div className="table-footer"><span>{visible.length} supplies · read-only stock view</span><span>Quantities use each supply’s configured UOP.</span></div>
    </section>
  </section>;
}
