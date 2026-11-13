import React from 'react';
import { money, unitMoney, dateLabel } from '../api.js';
import { salesLineTotal as lineTotal } from '../salesPricing.mjs';
import { Icon } from './Icons.jsx';
import { Modal, Badge } from './UI.jsx';

export default function DocumentView({ kind, record, onClose }) {
  const delivery = kind === 'delivery-receipts';
  const shipping = kind === 'shipping-invoices';
  const title = kind === 'sales-orders' ? 'Sales Order' : delivery ? 'Delivery Receipt' : shipping ? 'Shipping Invoice' : 'Invoice';
  return <Modal wide title={title} subtitle={record.number} onClose={onClose}><div className="modal-body document-sheet">
    <div className="document-brand"><div className="brand"><div className="brand-mark">T</div><div><strong>TTI Laguna Philippines Inc.</strong><span>SALES MANAGEMENT</span></div></div><div><h2>{title}</h2><strong>{record.number}</strong></div></div>
    <div className="document-meta"><div><span>{delivery || shipping ? 'Deliver to' : 'Customer'}</span><strong>{record.customerName}</strong>{(record.address || record.customerAddress) && <p>{record.address || record.customerAddress}</p>}{record.receivedBy && <p>Received by: {record.receivedBy}</p>}{shipping && record.carrier && <p>Carrier: {record.carrier}</p>}{shipping && record.trackingNumber && <p>Tracking: {record.trackingNumber}</p>}</div><dl><div><dt>{shipping ? 'Shipping date' : 'Date'}</dt><dd>{dateLabel(shipping ? record.shippingDate : record.orderDate || record.invoiceDate || record.deliveryDate)}</dd></div>{shipping && record.invoiceNumber && <div><dt>Invoice</dt><dd>{record.invoiceNumber}</dd></div>}{record.orderNumber && <div><dt>Sales order</dt><dd>{record.orderNumber}</dd></div>}{shipping && record.deliveryNumber && <div><dt>Delivery receipt</dt><dd>{record.deliveryNumber}</dd></div>}{record.dueDate && <div><dt>Due date</dt><dd>{dateLabel(record.dueDate)}</dd></div>}{record.status && <div><dt>Status</dt><dd><Badge>{record.status}</Badge></dd></div>}</dl></div>
    <div className="table-scroll"><table className="document-table"><thead><tr><th>Product</th><th>Unit</th><th className="numeric">Quantity</th>{!delivery && <><th className="numeric">Unit price</th><th className="numeric">Amount</th></>}</tr></thead><tbody>{(record.items || []).map((item, i) => <tr key={item.id || i}><td><strong>{item.productName}</strong><small>{item.sku}</small></td><td>{item.unit || '—'}</td><td className="numeric">{Number(item.quantity)}</td>{!delivery && <><td className="numeric">{unitMoney(item.unitPrice, record.currency)}</td><td className="numeric">{money(item.lineTotal ?? lineTotal(item), record.currency)}</td></>}</tr>)}</tbody></table></div>
    {!delivery && <div className="document-totals"><div><span>Total</span><strong>{money(record.total, record.currency)}</strong></div>{record.paidAmount !== undefined && <><div><span>Paid</span><span>{money(record.paidAmount, record.currency)}</span></div><div><span>Balance</span><strong>{money(Number(record.total) - Number(record.paidAmount), record.currency)}</strong></div></>}</div>}
    {record.notes && <div className="document-notes"><strong>Notes</strong><p>{record.notes}</p></div>}
    {delivery && <div className="signature-row"><div><span />Prepared by</div><div><span />Received by</div></div>}
    <div className="document-bottom">TTI Laguna Philippines Inc. · {record.number}</div>
  </div><div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={() => window.print()}><Icon name="file" size={17} />Print document</button></div></Modal>;
}
