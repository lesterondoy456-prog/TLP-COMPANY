import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, balanceAmount, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Badge, Empty, LoadingSkeleton } from '../../components/UI.jsx';
import { PageHeading, MobileRecordCard } from '../../components/RecordsCard.jsx';
import CreateInvoiceForm from './CreateInvoiceForm.jsx';
import InvoiceView from './InvoiceView.jsx';
import InvoicePaymentForm from './InvoicePaymentForm.jsx';
import './Invoice.css';

function InvoiceItemsPanel({ row, state, panelId, onRetry }) {
  const record = state?.record;
  const items = record?.items || [];
  const decimals = row.decimalInTotalPrice ?? 2;
  const amount = value => value == null ? '\u2014' : money(value, row.currency, decimals);
  const headers = ['Product code', 'Description', 'UOP', 'Quantity', 'Selling price', 'Currency', 'VAT (%)', 'Gross amount', 'Discount amount', 'Net amount', 'VAT amount', 'Amount', 'Ref no.'];
  const itemRows = items.map((item, index) => {
    const vatRate = item.vatRate ?? record.vatRate ?? row.vatRate;
    return {
      key: item.id ?? index,
      fields: [
        { label: 'Product code', value: <strong>{item.sku || '\u2014'}</strong> },
        { label: 'Description', value: item.description || item.productDescription || item.productName || '\u2014' },
        { label: 'UOP', value: item.unit || '\u2014' },
        { label: 'Quantity', value: new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(item.quantity), numeric: true },
        { label: 'Selling price', value: unitMoney(item.convertedUnitPrice ?? item.unitPrice, row.currency), numeric: true },
        { label: 'Currency', value: row.currency || '\u2014' },
        { label: 'VAT (%)', value: vatRate == null ? '\u2014' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(vatRate), numeric: true },
        { label: 'Gross amount', value: amount(item.grossAmount), numeric: true },
        { label: 'Discount amount', value: amount(item.discountAmount), numeric: true },
        { label: 'Net amount', value: amount(item.netAmount), numeric: true },
        { label: 'VAT amount', value: amount(item.vatAmount), numeric: true },
        { label: 'Amount', value: <strong>{amount(item.amount ?? item.lineTotal)}</strong>, numeric: true },
        { label: 'Ref no.', value: item.refNumber || '\u2014' },
      ],
    };
  });
  return <section className="invoice-item-panel" id={panelId} aria-label={'Items for ' + row.number} aria-busy={Boolean(state?.loading)}>
    <div className="invoice-item-heading"><div><span className="invoice-item-icon"><Icon name="box" size={17} /></span><div><h3>{row.number} &middot; Items</h3><p>{record ? items.length + (items.length === 1 ? ' product' : ' products') + ' | Amounts in ' + row.currency : 'Product details for this invoice'}</p></div></div>{state?.loading && record && <span className="invoice-updating" role="status">Updating items&hellip;</span>}</div>
    {state?.error && <div className="notice error invoice-item-error" role="alert"><span>{state.error}{record && ' Previously loaded items remain visible.'}</span><button type="button" className="text-button" onClick={onRetry}>Retry invoice items</button></div>}
    {state?.loading && !record ? <LoadingSkeleton label={'Loading items for ' + row.number} rows={2} /> : record && !items.length ? <div className="invoice-items-empty" role="status">No items are recorded for this invoice.</div> : record && <>
      <p className="invoice-table-scroll-hint invoice-items-hint">Scroll sideways to see all product columns.</p>
      <div className="invoice-items-scroll" tabIndex={0} role="region" aria-label={'Product details for ' + row.number}><table className="invoice-items-table"><thead><tr>{headers.map((header, index) => <th scope="col" key={header} className={[3, 4, 6, 7, 8, 9, 10, 11].includes(index) ? 'numeric' : undefined}>{header}</th>)}</tr></thead><tbody>{itemRows.map(item => <tr key={item.key}>{item.fields.map(field => <td key={field.label} className={field.numeric ? 'numeric' : undefined}>{field.value}</td>)}</tr>)}</tbody></table></div>
      <div className="invoice-mobile-items record-mobile-list">{itemRows.map(item => <MobileRecordCard key={item.key} titleLabel="Product code" title={item.fields[0].value} fields={item.fields.slice(1)} preview={['Description', 'Quantity', 'Selling price', 'Amount']} />)}</div>
    </>}
  </section>;
}

export default function InvoicePage({ data, loading, loaded, onReload, onSaved, onError, overview }) {
  const rows = data['sales-invoices'];
  const [dialog, setDialog] = useState(null);
  const [busyRow, setBusyRow] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(new Set());
  const [invoiceDetails, setInvoiceDetails] = useState({});
  const detailSequence = useRef(0);
  const itemRequests = useRef(new Map());
  const mounted = useRef(true);
  const filtered = rows.filter(row => [row.number, row.orderNumber, row.billToName, row.customerName, row.preparedByName, row.currency, row.status].some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * 10, safePage * 10);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; detailSequence.current++;
      for (const controller of itemRequests.current.values()) controller.abort();
      itemRequests.current.clear();
    };
  }, []);

  // Keep open invoices expanded when Socket.IO refreshes their parent rows.
  // Retain the last items while fetching their current details in the background.
  useEffect(() => {
    const ids = new Set(rows.map(row => row.id));
    setExpanded(current => new Set([...current].filter(id => ids.has(id))));
    for (const row of rows) {
      if (expanded.has(row.id)) loadItems(row);
    }
    for (const [id, controller] of itemRequests.current) {
      if (!ids.has(id)) { controller.abort(); itemRequests.current.delete(id); }
    }
  }, [rows]);

  function saved(result, message) { setDialog(null); onSaved(result, message); }
  async function loadItems(row) {
    itemRequests.current.get(row.id)?.abort();
    if (Array.isArray(row.items)) {
      setInvoiceDetails(current => ({ ...current, [row.id]: { record: row, loading: false, error: '' } }));
      return;
    }
    const controller = new AbortController();
    itemRequests.current.set(row.id, controller);
    setInvoiceDetails(current => ({ ...current, [row.id]: { ...current[row.id], loading: true, error: '' } }));
    try {
      const result = await api('/api/sales/sales-invoices/' + row.id, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      if (!result.record || String(result.record.id) !== String(row.id) || !Array.isArray(result.record.items)) throw new Error('Invoice item details were not returned. Try again.');
      setInvoiceDetails(current => ({ ...current, [row.id]: { record: result.record, loading: false, error: '' } }));
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setInvoiceDetails(current => ({ ...current, [row.id]: { ...current[row.id], loading: false, error: error.message } }));
    } finally { if (itemRequests.current.get(row.id) === controller) itemRequests.current.delete(row.id); }
  }
  function toggle(row) {
    const opening = !expanded.has(row.id);
    setExpanded(current => { const next = new Set(current); if (opening) next.add(row.id); else next.delete(row.id); return next; });
    if (opening && !itemRequests.current.has(row.id)) loadItems(row);
  }
  async function details(row) {
    const sequence = ++detailSequence.current;
    setBusyRow(row.id); onError('');
    try {
      const result = await api('/api/sales/sales-invoices/' + row.id);
      if (detailSequence.current === sequence) setDialog({ type: 'view', record: result.record });
    } catch (error) { if (detailSequence.current === sequence) onError(error.message); }
    finally { if (detailSequence.current === sequence) setBusyRow(null); }
  }

  return <>
    <PageHeading title="Invoice" description="One row per invoice. Expand an invoice to see its product details." addLabel="New invoice" loading={loading} onAdd={() => setDialog({ type: 'new' })} />
    {overview}
    <section className="records-card invoice-monitor" aria-label="Invoice" aria-busy={loading && !loaded}>
      <div className="records-toolbar"><div className="records-title"><h2>Invoices</h2>{loaded && <span>{rows.length}</span>}</div><div className="records-tools"><label className="search-input"><Icon name="search" size={18} /><input type="search" aria-label="Search invoices" placeholder="Search invoices…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><button className={'icon-button refresh-button ' + (loading ? 'spinning' : '')} title="Refresh records" aria-label="Refresh records" onClick={onReload} disabled={loading}><Icon name="refresh" size={18} /></button></div></div>
      <div className="invoice-monitor-hint"><Icon name="chevronDown" size={14} /><span>Select an invoice row to show or hide its items.</span></div>
      {loading && !loaded ? <LoadingSkeleton label="Loading invoices" /> : !visible.length ? <Empty icon="file" title={query ? 'No matching invoices' : 'Your invoices start here'} detail={query ? 'Try an invoice number, billing customer or currency.' : 'Select “New invoice” to invoice a confirmed sales order.'} /> : <><p className="invoice-table-scroll-hint invoice-summary-hint">Scroll sideways to see all invoice columns.</p><div className="table-scroll invoice-summary-scroll" tabIndex={0} role="region" aria-label="Invoice summary table"><table className="records-table invoice-summary-table"><thead><tr>
        <th scope="col">SI number</th><th scope="col">Bill to</th><th scope="col">Prepared by</th><th scope="col">Invoice date</th><th scope="col">Due date</th><th scope="col">Currency</th><th scope="col" className="numeric">Gross amount</th><th scope="col" className="numeric">Discount amount</th><th scope="col" className="numeric">Net amount</th><th scope="col" className="numeric">VAT amount</th><th scope="col" className="numeric">Total amount</th><th scope="col" className="numeric">Paid amount</th><th scope="col" className="numeric">Balance</th><th scope="col">Status</th><th scope="col" className="actions-heading">Actions</th>
      </tr></thead>{visible.map(row => {
        const open = expanded.has(row.id);
        const state = invoiceDetails[row.id];
        const decimals = row.decimalInTotalPrice ?? 2;
        const amount = value => value == null ? '—' : money(value, row.currency, decimals);
        const panelId = 'invoice-items-' + row.id;
        return <tbody key={row.id} className={'invoice-group ' + (open ? 'invoice-group-open' : '')}>
          <tr className="invoice-summary-row" tabIndex={0} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={event => { if (!event.target.closest('button, a, input, select, textarea')) toggle(row); }} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(row); } }}>
            <td><div className="invoice-number-cell"><button type="button" className="icon-button invoice-expand" aria-label={(open ? 'Collapse items for ' : 'Expand items for ') + row.number} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => toggle(row)}><Icon name="chevronRight" size={17} /></button><div><strong className="document-number">{row.number}</strong><small>{row.orderNumber || '—'}</small></div></div></td>
            <td className="invoice-bill-to"><strong>{row.billToName || row.customerName || '—'}</strong>{row.billToAddress && <small>{row.billToAddress}</small>}</td><td>{row.preparedByName || '—'}</td><td className="nowrap">{dateLabel(row.invoiceDate)}</td><td className="nowrap">{dateLabel(row.dueDate)}</td><td>{row.currency || '—'}</td>
            <td className="numeric">{amount(row.grossAmount)}</td><td className="numeric">{amount(row.discountAmount)}</td><td className="numeric">{amount(row.netAmount)}</td><td className="numeric">{amount(row.vatAmount)}</td><td className="numeric"><strong>{amount(row.total)}</strong></td><td className="numeric">{amount(row.paidAmount)}</td><td className="numeric"><strong>{amount(balanceAmount(row.total, row.paidAmount))}</strong></td><td><Badge>{row.status}</Badge></td>
            <td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening…' : 'View'}</button><button className="text-button" onClick={() => setDialog({ type: 'payment', record: row })}>Payment</button></div></td>
          </tr>
          {open && <tr className="invoice-expansion-row"><td colSpan={15}><InvoiceItemsPanel row={row} state={state} panelId={panelId} onRetry={() => loadItems(row)} /></td></tr>}
        </tbody>;
      })}</table></div>
      <div className="invoice-mobile-list record-mobile-list">{visible.map(row => {
        const open = expanded.has(row.id);
        const panelId = 'invoice-mobile-items-' + row.id;
        const decimals = row.decimalInTotalPrice ?? 2;
        const amount = value => value == null ? '\u2014' : money(value, row.currency, decimals);
        const fields = [
          { label: 'Bill to', value: <><strong>{row.billToName || row.customerName || '\u2014'}</strong>{row.billToAddress && <small>{row.billToAddress}</small>}</> },
          { label: 'Prepared by', value: row.preparedByName || '\u2014' },
          { label: 'Invoice date', value: dateLabel(row.invoiceDate) },
          { label: 'Due date', value: dateLabel(row.dueDate) },
          { label: 'Currency', value: row.currency || '\u2014' },
          { label: 'Gross amount', value: amount(row.grossAmount) },
          { label: 'Discount amount', value: amount(row.discountAmount) },
          { label: 'Net amount', value: amount(row.netAmount) },
          { label: 'VAT amount', value: amount(row.vatAmount) },
          { label: 'Total amount', value: <strong>{amount(row.total)}</strong> },
          { label: 'Paid amount', value: amount(row.paidAmount) },
          { label: 'Balance', value: <strong>{amount(balanceAmount(row.total, row.paidAmount))}</strong> },
        ];
        return <MobileRecordCard key={row.id} titleLabel="SI number" title={<><strong>{row.number}</strong><small>{row.orderNumber || '\u2014'}</small></>} status={<Badge>{row.status}</Badge>} fields={fields} preview={['Bill to', 'Invoice date', 'Total amount', 'Balance']} actions={<div className="row-actions">
          <button type="button" className="text-button invoice-mobile-expand" aria-label={(open ? 'Collapse items for ' : 'Expand items for ') + row.number} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => toggle(row)}><Icon name="chevronDown" size={15} />{open ? 'Collapse items' : 'Expand items'}</button>
          <button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening...' : 'View'}</button><button className="text-button" onClick={() => setDialog({ type: 'payment', record: row })}>Payment</button>
        </div>}>
          {open && <InvoiceItemsPanel row={row} state={invoiceDetails[row.id]} panelId={panelId} onRetry={() => loadItems(row)} />}
        </MobileRecordCard>;
      })}</div></>}
      <div className="table-footer"><span>{filtered.length ? ((safePage - 1) * 10 + 1) + '–' + Math.min(safePage * 10, filtered.length) : '0'} of {filtered.length.toLocaleString('en-PH')} invoices</span><div><button className="icon-button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
    {dialog?.type === 'new' && <CreateInvoiceForm orders={data['sales-orders']} products={data.products} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'view' && <InvoiceView record={dialog.record} onClose={() => setDialog(null)} />}
    {dialog?.type === 'payment' && <InvoicePaymentForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} />}
  </>;
}
