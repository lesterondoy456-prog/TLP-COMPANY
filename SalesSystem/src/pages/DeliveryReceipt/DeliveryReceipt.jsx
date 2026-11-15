import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Avatar, Badge, roleLabel } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateDeliveryReceiptForm from './CreateDeliveryReceiptForm.jsx';
import DocumentView from '../../components/DocumentView.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
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
    <PageHeading title="Delivery Receipt" description="Record deliveries and keep your inventory up to date." addLabel="New delivery receipt" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="Delivery Receipt" label="Delivery receipts" icon="arrowUpRight" addLabel="New delivery receipt" mobilePreview={['Customer', 'Delivery date', 'Received by']} rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><><th>Receipt</th><th>Sales order</th><th>Customer</th><th>Delivery date</th><th>Received by</th></><th className="actions-heading">Actions</th></>} renderRow={row => <><><td><strong className="document-number">{row.number}</strong></td><td>{row.orderNumber}</td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.deliveryDate)}</td><td>{row.receivedBy || '—'}</td></><td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening?' : 'View'}</button></div></td></>} />
    {['new', 'edit'].includes(dialog?.type) && <CreateDeliveryReceiptForm record={dialog.record} orders={data['sales-orders']} customers={data.customers} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'view' && <DocumentView kind="delivery-receipts" record={dialog.record} onClose={() => setDialog(null)} />}
  </>;
}
