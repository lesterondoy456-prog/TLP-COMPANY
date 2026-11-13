import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Avatar, Badge, roleLabel } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateOrderForm from './CreateOrderForm.jsx';
import ConfirmDelete from '../../components/ConfirmDelete.jsx';
import DocumentView from '../../components/DocumentView.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
export default function SalesOrderPage({
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
  const rows = data['sales-orders'];
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  async function details(row, type = 'view') {
    const request = ++detailSequence.current;
    setBusyRow(row.id);
    onError('');
    try {
      const result = await api('/api/sales/sales-orders/' + row.id);
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
    <PageHeading title="Sales Order" description="Turn customer requests into clear, trackable sales orders." addLabel="New sales order" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="Sales Order" label="Sales orders" icon="bag" addLabel="New sales order" rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><><th>Order</th><th>Customer</th><th>Date</th><th className="numeric">Total</th><th>Status</th><th>Documents</th></><th className="actions-heading">Actions</th></>} renderRow={row => <><><td><strong className="document-number">{row.number}</strong></td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.orderDate)}</td><td className="numeric">{money(row.total, row.currency)}</td><td><Badge>{row.status}</Badge></td><td><div className="document-flags">{row.invoiced && <span>Invoiced</span>}{row.delivered && <span>Delivered</span>}{!row.invoiced && !row.delivered && <span className="muted">—</span>}</div></td></><td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening?' : 'View'}</button>{!(row.invoiced || row.delivered) && <button className="text-button" disabled={busyRow === row.id} onClick={() => details(row, 'edit')}>Edit</button>}{!(row.invoiced || row.delivered) && <button className="text-button danger-text" onClick={() => setDialog({
            type: 'delete',
            record: row
          })}>Delete</button>}</div></td></>} />
    {['new', 'edit'].includes(dialog?.type) && <CreateOrderForm record={dialog.record} customers={data.customers} products={data.products} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'delete' && <ConfirmDelete record={dialog.record} onDelete={() => api('/api/sales/sales-orders/' + dialog.record.id, {
      method: 'DELETE'
    })} onClose={() => setDialog(null)} onSaved={result => saved(result, 'Record deleted.')} />}
    {dialog?.type === 'view' && <DocumentView kind="sales-orders" record={dialog.record} onClose={() => setDialog(null)} />}
  </>;
}
