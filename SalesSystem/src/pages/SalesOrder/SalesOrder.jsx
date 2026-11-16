import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../../api.js';
import { Badge } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateOrderForm from './CreateOrderForm.jsx';
import UpdateOrderQuantitiesForm from './UpdateOrderQuantitiesForm.jsx';
import ConfirmDelete from '../../components/ConfirmDelete.jsx';
import DocumentView from '../../components/DocumentView.jsx';
import './SalesOrder.css';

const count = value => value == null ? '—' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value);

export default function SalesOrderPage({ data, user, loading, loaded, onReload, onSaved, onError, overview }) {
  const [dialog, setDialog] = useState(null);
  const [busyRow, setBusyRow] = useState(null);
  const detailSequence = useRef(0);
  useEffect(() => () => { detailSequence.current++; }, []);
  const rows = data['sales-orders'].flatMap(order => (order.items?.length ? order.items : [null]).map((item, index) => ({
    ...order, orderId: order.id, id: order.id + ':' + (item?.id ?? index), item,
    sku: item?.sku, productName: item?.productName, description: item?.description, refNumber: item?.refNumber,
  })));
  function saved(result, message) { setDialog(null); onSaved(result, message); }
  async function details(row, type = 'view') {
    const sequence = ++detailSequence.current;
    setBusyRow(row.orderId); onError('');
    try {
      const result = await api('/api/sales/sales-orders/' + row.orderId);
      if (detailSequence.current === sequence) setDialog({ type, record: result.record });
    } catch (error) { if (detailSequence.current === sequence) onError(error.message); }
    finally { if (detailSequence.current === sequence) setBusyRow(null); }
  }
  return <>
    <PageHeading title="Sales Order" description="Monitor every order item, its amounts and expected delivery." addLabel="New sales order" loading={loading} onAdd={() => setDialog({ type: 'new' })} />
    {overview}
    <div className="sales-order-monitor"><RecordsCard title="Sales Order" label="Sales order items" icon="bag" addLabel="New sales order" mobilePreview={['Customer', 'Product code', 'Quantity', 'Amount']} rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<>
      <th>SO number</th><th>Customer</th><th>Prepared by</th><th>Order date</th><th>Ref no.</th><th>Product code</th><th>Description</th><th className="numeric">Source unit price</th><th className="numeric">Converted price</th><th className="numeric">Quantity</th><th className="numeric">Balance qty</th><th className="numeric">Gross amount</th><th className="numeric">Discount amount</th><th className="numeric">Net amount</th><th className="numeric">VAT amount</th><th className="numeric">Amount</th><th>Delivery date</th><th>Status</th><th>Documents</th><th className="actions-heading">Actions</th>
    </>} renderRow={row => {
      const item = row.item;
      const decimals = row.decimalInTotalPrice ?? 2;
      const amount = value => value == null ? '—' : money(value, row.currency, decimals);
      return <>
        <td><strong className="document-number">{row.number}</strong><small>{row.currency || '—'}</small></td><td>{row.customerName}</td><td>{row.preparedByName || '—'}</td><td className="nowrap">{dateLabel(row.orderDate)}</td><td>{item?.refNumber || '—'}</td><td>{item?.sku || '—'}</td><td>{item?.description || item?.productName || '—'}</td>
        <td className="numeric">{item ? unitMoney(item.unitPrice, item.currency || row.sourceCurrency || row.currency) : '—'}</td><td className="numeric">{item ? unitMoney(item.convertedUnitPrice ?? item.unitPrice, row.currency) : '—'}</td><td className="numeric">{count(item?.quantity)}{item?.unit && <small>{item.unit}</small>}</td><td className="numeric">{item ? count(item.remainingDeliveryQuantity ?? (row.delivered ? 0 : item.quantity)) : '—'}</td>
        <td className="numeric">{amount(item?.grossAmount)}</td><td className="numeric">{amount(item?.discountAmount)}</td><td className="numeric">{amount(item?.netAmount)}</td><td className="numeric">{amount(item?.vatAmount)}</td><td className="numeric"><strong>{amount(item?.amount ?? item?.lineTotal ?? row.total)}</strong></td><td className="nowrap">{dateLabel(item?.deliveryDate || row.expectedDeliveryDate)}</td><td><Badge>{row.status}</Badge></td><td><div className="document-flags">{row.invoiced && <span>Invoiced</span>}{row.delivered && <span>Delivered</span>}{!row.invoiced && !row.delivered && <span className="muted">—</span>}</div></td>
        <td><div className="row-actions"><button className="text-button" disabled={busyRow === row.orderId} onClick={() => details(row)}>{busyRow === row.orderId ? 'Opening…' : 'View'}</button>{(row.invoiced || !row.delivered) && <button className="text-button" disabled={busyRow === row.orderId} onClick={() => details(row, 'edit')}>Edit</button>}{!(row.invoiced || row.delivered) && <button className="text-button danger-text" onClick={() => setDialog({ type: 'delete', record: { ...row, id: row.orderId } })}>Delete</button>}</div></td>
      </>;
    }} /></div>
    {['new', 'edit'].includes(dialog?.type) && (dialog.record?.invoiced ? <UpdateOrderQuantitiesForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} /> : <CreateOrderForm record={dialog.record} customers={data.customers} products={data.products} user={user} onClose={() => setDialog(null)} onSaved={saved} />)}
    {dialog?.type === 'delete' && <ConfirmDelete record={dialog.record} onDelete={() => api('/api/sales/sales-orders/' + dialog.record.id, { method: 'DELETE' })} onClose={() => setDialog(null)} onSaved={result => saved(result, 'Record deleted.')} />}
    {dialog?.type === 'view' && <DocumentView kind="sales-orders" record={dialog.record} onClose={() => setDialog(null)} />}
  </>;
}
