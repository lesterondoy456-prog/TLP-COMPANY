import React from 'react';
import { dateLabel } from '../api.js';
import { Badge, Modal } from './UI.jsx';
import { Icon } from './Icons.jsx';

export const documentTitle = kind => ({ 'purchase-requests': 'Purchase Request', 'purchase-orders': 'Purchase Order', receivings: 'Receiving Receipt' })[kind];
export const statusLabel = status => ({ draft: 'Not Yet Posted', posted: 'Posted', closed: 'Closed', cancelled: 'Cancelled' })[status] || status;
export const quantityLabel = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(Number(value) || 0);

export function currencyLabel(value, currency = 'PHP', places = 2) {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency, minimumFractionDigits: places, maximumFractionDigits: places }).format(Number(value) || 0);
  } catch {
    return new Intl.NumberFormat('en-PH', { minimumFractionDigits: places, maximumFractionDigits: places }).format(Number(value) || 0) + (currency ? ' ' + currency : '');
  }
}

export function PurchasingDocumentView({ kind, record, onClose }) {
  const request = kind === 'purchase-requests';
  const receiving = kind === 'receivings';
  const title = documentTitle(kind);
  const date = record.prDate || record.poDate || record.srrDate;
  return <Modal title={title} subtitle={record.number} className="purchase-document-modal" onClose={onClose}>
    <div className="modal-body document-sheet purchase-print-sheet">
      <div className="document-brand"><div className="brand"><div className="brand-mark">T</div><div><strong>TTI Laguna Philippines Inc.</strong><span>PURCHASING</span></div></div><div><h2>{title}</h2><strong>{record.number}</strong></div></div>
      <div className="document-meta"><div><span>{request ? 'Requested by' : 'Supplier'}</span><strong>{request ? record.requestedBy || record.preparedBy : record.supplierName}</strong>{record.supplierAddress && <p>{record.supplierAddress}</p>}{record.deliveryAddress && <p>Delivery: {record.deliveryAddress}</p>}{record.requestedDept && <p>Department: {record.requestedDept}</p>}</div><dl><div><dt>Date</dt><dd>{dateLabel(date)}</dd></div><div><dt>Status</dt><dd><Badge value={record.status}>{statusLabel(record.status)}</Badge></dd></div>{record.neededDate && <div><dt>Needed Date</dt><dd>{dateLabel(record.neededDate)}</dd></div>}{record.deliveryDate && <div><dt>Delivery Date</dt><dd>{dateLabel(record.deliveryDate)}</dd></div>}{record.purchaseOrderNumber && <div><dt>PO Ref #</dt><dd>{record.purchaseOrderNumber}</dd></div>}{record.invoiceNumber && <div><dt>SI #</dt><dd>{record.invoiceNumber}</dd></div>}{record.currency && <div><dt>Currency</dt><dd>{record.currency}</dd></div>}</dl></div>
      <div className="table-scroll"><table className="document-table"><thead><tr><th>Supplies</th><th>UOP</th><th className="numeric">Qty</th>{request ? <><th>Needed Date</th><th>Remarks</th></> : <><th className="numeric">Price</th><th className="numeric">Disc. %</th><th className="numeric">VAT</th><th className="numeric">Amount</th></>}</tr></thead><tbody>{(record.items || []).map((row, index) => <tr key={row.id || index}><td><strong>{row.suppliesName}</strong><small>{row.suppliesCode}</small>{row.description && <small>{row.description}</small>}</td><td>{row.unit}</td><td className="numeric">{quantityLabel(row.quantity)}</td>{request ? <><td>{dateLabel(row.neededDate)}</td><td>{row.remarks || '—'}</td></> : <><td className="numeric">{quantityLabel(row.unitPrice)}</td><td className="numeric">{quantityLabel(row.discountRate)}</td><td className="numeric">{quantityLabel(row.vatAmount)}</td><td className="numeric">{quantityLabel(row.amount)}</td></>}</tr>)}</tbody></table></div>
      {!request && <div className="document-totals">{[['grossAmount', 'Gross amount'], ['discountAmount', 'Discount'], ['netAmount', 'Net amount'], ['vatAmount', 'VAT'], ['amount', 'Total']].map(([key, label]) => <div key={key}><span>{label}</span><strong>{currencyLabel(record[key], record.currency, record.decimalInTotalPrice ?? 2)}</strong></div>)}</div>}
      {receiving && (record.items || []).map((item, index) => <div className="purchase-print-allocations" key={item.id || index}><h3>{item.suppliesName} · Allocations</h3><table className="document-table"><thead><tr><th>Qty</th><th>Warehouse</th><th>Location</th><th>IMLot #</th><th>QC Status</th><th>Exp. Date</th><th>MFG Date</th></tr></thead><tbody>{(item.allocations || []).map((row, rowIndex) => <tr key={row.id || rowIndex}><td>{quantityLabel(row.quantity)}</td><td>{row.warehouseCode || row.warehouseId || '—'}</td><td>{row.locationCode || row.locationId || '—'}</td><td>{row.imLot || '—'}</td><td>{row.qcStatus || '—'}</td><td>{dateLabel(row.expiryDate)}</td><td>{dateLabel(row.mfgDate)}</td></tr>)}</tbody></table></div>)}
      {record.remarks && <div className="document-notes"><strong>Remarks</strong><p>{record.remarks}</p></div>}
      <div className="purchase-print-signatures"><div>Prepared / Received By<strong>{record.preparedBy || record.receivedBy || '—'}</strong></div>{request && <><div>Checked By<strong>{record.checkedBy || '—'}</strong></div><div>Approved By<strong>{record.approvedBy || '—'}</strong></div><div>Approved By (2nd)<strong>{record.approvedBy2 || '—'}</strong></div></>}</div>
      <div className="document-bottom">TTI Laguna Philippines Inc. · {record.number}</div>
    </div>
    <div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={() => window.print()}><Icon name="file" size={16} />Print document</button></div>
  </Modal>;
}
