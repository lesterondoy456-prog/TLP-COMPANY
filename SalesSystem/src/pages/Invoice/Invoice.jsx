import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Avatar, Badge, roleLabel } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateInvoiceForm from './CreateInvoiceForm.jsx';
import DocumentView from '../../components/DocumentView.jsx';
import InvoicePaymentForm from './InvoicePaymentForm.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
export default function InvoicePage({
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
  const rows = data['sales-invoices'];
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  async function details(row, type = 'view') {
    const request = ++detailSequence.current;
    setBusyRow(row.id);
    onError('');
    try {
      const result = await api('/api/sales/sales-invoices/' + row.id);
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
    <PageHeading title="Invoice" description="Invoice confirmed orders and keep track of payments." addLabel="New invoice" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="Invoice" label="Invoices" icon="file" addLabel="New invoice" rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><><th>Invoice</th><th>Customer</th><th>Due date</th><th className="numeric">Total</th><th className="numeric">Balance</th><th>Status</th></><th className="actions-heading">Actions</th></>} renderRow={row => <><><td><strong className="document-number">{row.number}</strong><small>{row.orderNumber}</small></td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.dueDate)}</td><td className="numeric">{money(row.total, row.currency)}</td><td className="numeric">{money(Number(row.total) - Number(row.paidAmount), row.currency)}</td><td><Badge>{row.status}</Badge></td></><td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening?' : 'View'}</button><button className="text-button" onClick={() => setDialog({
            type: 'payment',
            record: row
          })}>Payment</button></div></td></>} />
    {['new', 'edit'].includes(dialog?.type) && <CreateInvoiceForm record={dialog.record} orders={data['sales-orders']} customers={data.customers} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'view' && <DocumentView kind="sales-invoices" record={dialog.record} onClose={() => setDialog(null)} />}
    {dialog?.type === 'payment' && <InvoicePaymentForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} />}
  </>;
}
