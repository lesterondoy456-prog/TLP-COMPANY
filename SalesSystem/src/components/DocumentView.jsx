import React from 'react';
import { money, unitMoney, balanceAmount, dateLabel } from '../api.js';
import { salesLineTotal as lineTotal } from '../salesPricing.mjs';
import { Icon } from './Icons.jsx';
import { Modal, Badge } from './UI.jsx';
import '../pages/SalesOrder/SalesOrder.css';

export default function DocumentView({ kind, record, onClose }) {
  const delivery = kind === 'delivery-receipts';
  const shipping = kind === 'shipping-invoices';
  const title = kind === 'sales-orders' ? 'Sales Order' : delivery ? 'Delivery Receipt' : shipping ? 'Shipping Invoice' : 'Invoice';
  const decimals = record.decimalInTotalPrice ?? 2;
  const amount = value => money(value, record.currency, decimals);
  const detailed = record.grossAmount != null;
  return <Modal wide className="sales-document" title={title} subtitle={record.number} onClose={onClose}><div className="modal-body document-sheet">
    <div className="document-brand"><div className="brand"><div className="brand-mark">T</div><div><strong>TTI Laguna Philippines Inc.</strong><span>SALES MANAGEMENT</span></div></div><div><h2>{title}</h2><strong>{record.number}</strong></div></div>
    <div className="document-meta"><div><span>{delivery || shipping ? 'Deliver to' : 'Customer'}</span><strong>{record.customerName}</strong>{(record.address || record.customerAddress) && <p>{record.address || record.customerAddress}</p>}
      {!delivery && record.billToName && <div className="document-bill-to"><span>Bill to</span><strong>{record.billToName}</strong>{record.billToAddress && <p>{record.billToAddress}</p>}</div>}
      {record.receivedBy && <p>Received by: {record.receivedBy}</p>}{shipping && record.carrier && <p>Carrier: {record.carrier}</p>}{shipping && record.trackingNumber && <p>Tracking: {record.trackingNumber}</p>}
    </div><dl>
      <div><dt>{shipping ? 'Shipping date' : 'Date'}</dt><dd>{dateLabel(shipping ? record.shippingDate : record.invoiceDate || record.deliveryDate || record.orderDate)}</dd></div>
      {record.expectedDeliveryDate && <div><dt>Expected delivery</dt><dd>{dateLabel(record.expectedDeliveryDate)}</dd></div>}
      {shipping && record.invoiceNumber && <div><dt>Invoice</dt><dd>{record.invoiceNumber}</dd></div>}{record.orderNumber && <div><dt>Sales order</dt><dd>{record.orderNumber}</dd></div>}{shipping && record.deliveryNumber && <div><dt>Delivery receipt</dt><dd>{record.deliveryNumber}</dd></div>}
      {record.dueDate && <div><dt>Due date</dt><dd>{dateLabel(record.dueDate)}</dd></div>}{record.paymentTerm && <div><dt>Payment term</dt><dd>{record.paymentTerm}</dd></div>}
      {record.shipment && <div><dt>Shipment</dt><dd>{{ air: 'By Air', land: 'By Land', boat: 'By Boat', na: 'N/A' }[record.shipment] || record.shipment}</dd></div>}
      {record.countryOfOrigin && <div><dt>Country of origin</dt><dd>{record.countryOfOrigin}</dd></div>}
      {!delivery && record.sourceCurrency && record.rate != null && <div><dt>Rate</dt><dd>1 {record.sourceCurrency} = {record.rate} {record.currency}</dd></div>}
      {!delivery && record.vatCode && <div><dt>VAT</dt><dd>{record.vatCode}{record.vatRate != null ? ' · ' + Number(record.vatRate) + '%' : ''}{typeof record.vatInclusive === 'boolean' ? ' · ' + (record.vatInclusive ? 'Inclusive' : 'Exclusive') : ''}</dd></div>}
      {record.preparedByName && <div><dt>Prepared by</dt><dd>{record.preparedByName}</dd></div>}{record.status && <div><dt>Status</dt><dd><Badge>{record.status}</Badge></dd></div>}
    </dl></div>
    <div className="table-scroll"><table className="document-table"><thead><tr><th>Product</th><th>Unit</th><th className="numeric">Quantity</th>{!delivery && <><th className="numeric">Unit price</th>{detailed && <><th className="numeric">Gross</th><th className="numeric">Discount</th><th className="numeric">Net</th><th className="numeric">VAT</th></>}<th className="numeric">Amount</th></>}<th>Delivery date</th></tr></thead><tbody>{(record.items || []).map((item, index) => <tr key={item.id || index}>
      <td><strong>{item.productName || item.sku}</strong><small>{item.sku}</small>{item.description && item.description !== item.productName && <small>{item.description}</small>}{item.refNumber && <small>Ref: {item.refNumber}</small>}{item.quotationNumber && <small>Quotation: {item.quotationNumber}</small>}</td><td>{item.unit || '—'}</td><td className="numeric">{Number(item.quantity)}</td>
      {!delivery && <><td className="numeric">{unitMoney(item.convertedUnitPrice ?? item.unitPrice, record.currency)}{item.currency && item.currency !== record.currency && <small>Source: {unitMoney(item.unitPrice, item.currency)}</small>}</td>{detailed && <><td className="numeric">{amount(item.grossAmount)}</td><td className="numeric">{amount(item.discountAmount)}</td><td className="numeric">{amount(item.netAmount)}</td><td className="numeric">{amount(item.vatAmount)}</td></>}<td className="numeric">{amount(item.amount ?? item.lineTotal ?? lineTotal(item))}</td></>}
      <td>{dateLabel(item.deliveryDate || record.expectedDeliveryDate)}</td>
    </tr>)}</tbody></table></div>
    {!delivery && <div className="document-totals">{detailed && <><div><span>Gross amount</span><span>{amount(record.grossAmount)}</span></div><div><span>Discount amount</span><span>{amount(record.discountAmount)}</span></div><div><span>Net amount</span><span>{amount(record.netAmount)}</span></div><div><span>VAT amount</span><span>{amount(record.vatAmount)}</span></div></>}<div className="document-grand-total"><span>Total</span><strong>{amount(record.total)}</strong></div>{record.paidAmount !== undefined && <><div><span>Paid</span><span>{amount(record.paidAmount)}</span></div><div><span>Balance</span><strong>{amount(balanceAmount(record.total, record.paidAmount))}</strong></div></>}</div>}
    {record.notes && <div className="document-notes"><strong>Notes</strong><p>{record.notes}</p></div>}
    {delivery && <div className="signature-row"><div><span />Prepared by</div><div><span />Received by</div></div>}
    <div className="document-bottom">TTI Laguna Philippines Inc. · {record.number}</div>
  </div><div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={() => window.print()}><Icon name="file" size={17} />Print document</button></div></Modal>;
}
