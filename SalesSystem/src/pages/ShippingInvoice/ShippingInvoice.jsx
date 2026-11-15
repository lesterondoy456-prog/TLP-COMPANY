import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Avatar, Badge, roleLabel } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateShippingInvoiceForm from './CreateShippingInvoiceForm.jsx';
import DocumentView from '../../components/DocumentView.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
export default function ShippingInvoicePage({
  data,
  user,
  loading,
  loaded,
  onReload,
  onSaved,
  onError,
  overview
}) {
  const [dialog, setDialog] = useState(null);
  const [busyRow, setBusyRow] = useState(null);
  const detailSequence = useRef(0);
  useEffect(() => () => {
    detailSequence.current++;
  }, []);
  const rows = data['shipping-invoices'];
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  async function details(row, type = 'view') {
    const request = ++detailSequence.current;
    setBusyRow(row.id);
    onError('');
    try {
      const result = await api('/api/sales/shipping-invoices/' + row.id);
      if (detailSequence.current === request) setDialog({
        type,
        record: result.record
      });
    } catch (error) {
      if (detailSequence.current === request) onError(error.message);
    } finally {
      if (detailSequence.current === request) setBusyRow(null);
    }
  }
  return <>
    <PageHeading title="Shipping Invoice" description="Link an invoice to its shipment and keep shipping details together." addLabel="New shipping invoice" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="Shipping Invoice" label="Shipping invoices" icon="shipping" addLabel="New shipping invoice" mobilePreview={['Customer', 'Shipping date', 'Total']} rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><><th>Shipping invoice</th><th>Invoice</th><th>Customer</th><th>Shipping date</th><th>Carrier / tracking</th><th className="numeric">Total</th></><th className="actions-heading">Actions</th></>} renderRow={row => <><><td><strong className="document-number">{row.number}</strong></td><td>{row.invoiceNumber}</td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.shippingDate)}</td><td><span>{row.carrier || '—'}</span>{row.trackingNumber && <small>{row.trackingNumber}</small>}</td><td className="numeric">{money(row.total, row.currency, row.decimalInTotalPrice ?? 2)}</td></><td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening?' : 'View'}</button></div></td></>} />
    {['new', 'edit'].includes(dialog?.type) && <CreateShippingInvoiceForm record={dialog.record} invoices={data['sales-invoices']} shippingInvoices={data['shipping-invoices']} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'view' && <DocumentView kind="shipping-invoices" record={dialog.record} onClose={() => setDialog(null)} />}
  </>;
}
