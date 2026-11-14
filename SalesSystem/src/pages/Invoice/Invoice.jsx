import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, balanceAmount, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Badge, Empty, LoadingSkeleton } from '../../components/UI.jsx';
import { PageHeading } from '../../components/RecordsCard.jsx';
import CreateInvoiceForm from './CreateInvoiceForm.jsx';
import DocumentView from '../../components/DocumentView.jsx';
import InvoicePaymentForm from './InvoicePaymentForm.jsx';
import './Invoice.css';

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
      {loading && !loaded ? <LoadingSkeleton label="Loading invoices" /> : !visible.length ? <Empty icon="file" title={query ? 'No matching invoices' : 'Your invoices start here'} detail={query ? 'Try an invoice number, billing customer or currency.' : 'Select “New invoice” to invoice a confirmed sales order.'} /> : <div className="table-scroll invoice-summary-scroll"><table className="records-table invoice-summary-table"><thead><tr>
        <th scope="col">SI number</th><th scope="col">Bill to</th><th scope="col">Prepared by</th><th scope="col">Invoice date</th><th scope="col">Due date</th><th scope="col">Currency</th><th scope="col" className="numeric">Gross amount</th><th scope="col" className="numeric">Discount amount</th><th scope="col" className="numeric">Net amount</th><th scope="col" className="numeric">VAT amount</th><th scope="col" className="numeric">Total amount</th><th scope="col" className="numeric">Paid amount</th><th scope="col" className="numeric">Balance</th><th scope="col">Status</th><th scope="col" className="actions-heading">Actions</th>
      </tr></thead>{visible.map(row => {
        const open = expanded.has(row.id);
        const state = invoiceDetails[row.id];
        const record = state?.record;
        const decimals = row.decimalInTotalPrice ?? 2;
        const amount = value => value == null ? '—' : money(value, row.currency, decimals);
        const items = record?.items || [];
        const panelId = 'invoice-items-' + row.id;
        return <tbody key={row.id} className={'invoice-group ' + (open ? 'invoice-group-open' : '')}>
          <tr className="invoice-summary-row" tabIndex={0} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={event => { if (!event.target.closest('button, a, input, select, textarea')) toggle(row); }} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(row); } }}>
            <td><div className="invoice-number-cell"><button type="button" className="icon-button invoice-expand" aria-label={(open ? 'Collapse items for ' : 'Expand items for ') + row.number} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => toggle(row)}><Icon name="chevronRight" size={17} /></button><div><strong className="document-number">{row.number}</strong><small>{row.orderNumber || '—'}</small></div></div></td>
            <td className="invoice-bill-to"><strong>{row.billToName || row.customerName || '—'}</strong>{row.billToAddress && <small>{row.billToAddress}</small>}</td><td>{row.preparedByName || '—'}</td><td className="nowrap">{dateLabel(row.invoiceDate)}</td><td className="nowrap">{dateLabel(row.dueDate)}</td><td>{row.currency || '—'}</td>
            <td className="numeric">{amount(row.grossAmount)}</td><td className="numeric">{amount(row.discountAmount)}</td><td className="numeric">{amount(row.netAmount)}</td><td className="numeric">{amount(row.vatAmount)}</td><td className="numeric"><strong>{amount(row.total)}</strong></td><td className="numeric">{amount(row.paidAmount)}</td><td className="numeric"><strong>{amount(balanceAmount(row.total, row.paidAmount))}</strong></td><td><Badge>{row.status}</Badge></td>
            <td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening…' : 'View'}</button><button className="text-button" onClick={() => setDialog({ type: 'payment', record: row })}>Payment</button></div></td>
          </tr>
          {open && <tr className="invoice-expansion-row"><td colSpan={15}><section className="invoice-item-panel" id={panelId} aria-label={'Items for ' + row.number} aria-busy={Boolean(state?.loading)}>
            <div className="invoice-item-heading"><div><span className="invoice-item-icon"><Icon name="box" size={17} /></span><div><h3>{row.number} · Items</h3><p>{record ? items.length + (items.length === 1 ? ' product' : ' products') + ' · Amounts in ' + row.currency : 'Product details for this invoice'}</p></div></div>{state?.loading && record && <span className="invoice-updating" role="status">Updating items…</span>}</div>
            {state?.error && <div className="notice error invoice-item-error" role="alert"><span>{state.error}{record && ' Previously loaded items remain visible.'}</span><button type="button" className="text-button" onClick={() => loadItems(row)}>Retry invoice items</button></div>}
            {state?.loading && !record ? <LoadingSkeleton label={'Loading items for ' + row.number} rows={2} /> : record && !items.length ? <div className="invoice-items-empty" role="status">No items are recorded for this invoice.</div> : record && <div className="invoice-items-scroll" tabIndex={0} role="region" aria-label={'Product details for ' + row.number}><table className="invoice-items-table"><thead><tr>
              <th scope="col">Product code</th><th scope="col">Description</th><th scope="col">UOP</th><th scope="col" className="numeric">Quantity</th><th scope="col" className="numeric">Selling price</th><th scope="col">Currency</th><th scope="col" className="numeric">VAT (%)</th><th scope="col" className="numeric">Gross amount</th><th scope="col" className="numeric">Discount amount</th><th scope="col" className="numeric">Net amount</th><th scope="col" className="numeric">VAT amount</th><th scope="col" className="numeric">Amount</th><th scope="col">Ref no.</th>
            </tr></thead><tbody>{items.map((item, index) => {
              const itemAmount = value => value == null ? '—' : money(value, row.currency, decimals);
              const vatRate = item.vatRate ?? record.vatRate ?? row.vatRate;
              return <tr key={item.id ?? index}><td><strong>{item.sku || '—'}</strong></td><td>{item.description || item.productDescription || item.productName || '—'}</td><td>{item.unit || '—'}</td><td className="numeric">{new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(item.quantity)}</td><td className="numeric">{unitMoney(item.convertedUnitPrice ?? item.unitPrice, row.currency)}</td><td>{row.currency || '—'}</td><td className="numeric">{vatRate == null ? '—' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(vatRate)}</td><td className="numeric">{itemAmount(item.grossAmount)}</td><td className="numeric">{itemAmount(item.discountAmount)}</td><td className="numeric">{itemAmount(item.netAmount)}</td><td className="numeric">{itemAmount(item.vatAmount)}</td><td className="numeric"><strong>{itemAmount(item.amount ?? item.lineTotal)}</strong></td><td>{item.refNumber || '—'}</td></tr>;
            })}</tbody></table></div>}
          </section></td></tr>}
        </tbody>;
      })}</table></div>}
      <div className="table-footer"><span>{filtered.length ? ((safePage - 1) * 10 + 1) + '–' + Math.min(safePage * 10, filtered.length) : '0'} of {filtered.length.toLocaleString('en-PH')} invoices</span><div><button className="icon-button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
    {dialog?.type === 'new' && <CreateInvoiceForm orders={data['sales-orders']} customers={data.customers} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'view' && <DocumentView kind="sales-invoices" record={dialog.record} onClose={() => setDialog(null)} />}
    {dialog?.type === 'payment' && <InvoicePaymentForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} />}
  </>;
}
