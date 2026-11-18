import React, { useEffect, useRef, useState } from 'react';
import { api, dateLabel } from '../../api.js';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateDeliveryReceiptForm from './CreateDeliveryReceiptForm.jsx';
import DeliveryReceiptView from './DeliveryReceiptView.jsx';
export default function DeliveryReceiptPage({
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
  const rows = data['delivery-receipts'];
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  async function details(row, type = 'view') {
    const request = ++detailSequence.current;
    setBusyRow(row.id);
    onError('');
    try {
      const result = await api('/api/sales/delivery-receipts/' + row.id);
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
    <PageHeading title="Delivery Receipt" description="Create a delivery receipt from the saved invoice items." addLabel="New delivery receipt" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="Delivery Receipt" label="Delivery receipts" icon="arrowUpRight" addLabel="New delivery receipt" mobilePreview={['Invoice', 'Delivered to', 'Delivery date', 'Received by']} rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><th>Receipt</th><th>Invoice</th><th>Sales order</th><th>Delivered to</th><th>Delivery date</th><th>Received by</th><th className="actions-heading">Actions</th></>} renderRow={row => <><td><strong className="document-number">{row.number}</strong></td><td>{row.invoiceNumber || '—'}</td><td>{row.orderNumber || '—'}</td><td>{row.deliveredTo ?? row.customerName ?? '—'}</td><td className="nowrap">{dateLabel(row.deliveryDate)}</td><td>{row.receivedBy || '—'}</td><td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening...' : 'View'}</button></div></td></>} />
    {dialog?.type === 'new' && <CreateDeliveryReceiptForm invoices={data['sales-invoices']} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'view' && <DeliveryReceiptView record={dialog.record} onClose={() => setDialog(null)} />}
  </>;
}
