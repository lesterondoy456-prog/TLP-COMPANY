import React, { useRef, useState } from 'react';
import { api, dateLabel, money, unitMoney } from '../../api.js';
import { calculateSalesOrder } from '../../salesPricing.mjs';
import { Modal, RequiredLabel, FormFooter, ErrorNotice, focusModalControl } from '../../components/UI.jsx';
import { stockQuantityUnits, stockQuantityText, validateOrderQuantities } from '../../helper/validation.js';
import useSave from '../../hooks/useSave.js';

export default function UpdateOrderQuantitiesForm({ record, onClose, onSaved }) {
  const [items, setItems] = useState(() => record.items.map(item => ({ id: item.id, quantity: String(item.quantity) })));
  const [errors, setErrors] = useState({});
  const controls = useRef([]);
  const { busy, error, save } = useSave(onSaved);
  let preview = null;
  let calculationError = '';
  try {
    preview = calculateSalesOrder({ items: record.items.map((item, index) => ({ ...item, quantity: items[index].quantity })), rate: record.rate ?? '1', vatRate: record.vatRate ?? '0', vatInclusive: record.vatInclusive ?? false, discountType: record.discountType, discount: record.discount, decimalInTotalPrice: record.decimalInTotalPrice ?? 2 });
  } catch (failure) { calculationError = failure.message; }
  function submit(event) {
    event.preventDefault();
    if (busy) return;
    const invalid = validateOrderQuantities(items, record);
    setErrors(invalid);
    const first = Object.keys(invalid).find(key => key !== 'order');
    if (Object.keys(invalid).length) { if (first !== undefined) focusModalControl(controls.current[Number(first)]); return; }
    if (!preview) { setErrors({ order: calculationError || 'Check the order quantities before saving.' }); return; }
    const body = { items: items.map(item => ({ id: item.id, quantity: stockQuantityText(stockQuantityUnits(item.quantity)) })) };
    save(() => api('/api/sales/sales-orders/' + record.id + '/quantities', { method: 'PATCH', body }));
  }
  return <Modal title={'Update quantities · ' + record.number} subtitle="This order has an invoice. Its details, products and prices are locked; only quantities can change." wide className="order-quantities-modal" onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate><div className="modal-body">
      <ErrorNotice message={errors.order || error} />
      <div className="document-summary order-quantity-details"><div><span>Customer</span><strong>{record.customerName}</strong></div><div><span>Order date</span><strong>{dateLabel(record.orderDate)}</strong></div><div><span>Currency</span><strong>{record.currency || '—'}</strong></div><div><span>Payment term</span><strong>{record.paymentTerm || '—'}</strong></div><div><span>VAT code</span><strong>{record.vatCode || '—'}</strong></div><div><span>Status</span><strong>{record.status}</strong></div></div>
      <p className="order-quantity-hint">Existing invoices and delivery receipts retain their saved quantities. Each order quantity must cover everything already invoiced or delivered.</p>
      <fieldset disabled={busy} className="order-quantity-fields"><div className="table-scroll"><table className="records-table order-quantity-table"><thead><tr><th>Product</th><th>UOP</th><th className="numeric">Unit price</th><th className="numeric">Invoiced</th><th className="numeric">Delivered</th><th><RequiredLabel required>Order quantity</RequiredLabel></th></tr></thead><tbody>{record.items.map((item, index) => {
        const invoiced = stockQuantityUnits(item.invoicedQuantity ?? '0') ?? 0n;
        const delivered = stockQuantityUnits(item.deliveredQuantity ?? '0') ?? 0n;
        const minimum = invoiced > delivered ? invoiced : delivered;
        return <tr key={item.id}>
          <td data-label="Product"><strong>{item.sku || item.productName}</strong><small>{item.description || item.productName}</small></td>
          <td data-label="UOP">{item.unit}</td>
          <td data-label="Unit price" className="numeric">{unitMoney(item.unitPrice, item.currency || record.sourceCurrency || record.currency)}</td>
          <td data-label="Invoiced" className="numeric">{stockQuantityText(invoiced)}</td>
          <td data-label="Delivered" className="numeric">{stockQuantityText(delivered)}</td>
          <td data-label="Order quantity *"><span className="order-quantity-mobile-label"><RequiredLabel required>Order quantity</RequiredLabel></span><input ref={element => { controls.current[index] = element; }} aria-label={'Order quantity ' + (index + 1)} aria-invalid={Boolean(errors[index])} aria-describedby={'quantity-hint-' + item.id} type="number" min={minimum > 0n ? stockQuantityText(minimum) : '0.001'} step="0.001" max="1000000" required value={items[index].quantity} onChange={event => { setItems(current => current.map((row, position) => position === index ? { ...row, quantity: event.target.value } : row)); setErrors(current => { const next = { ...current }; delete next[index]; delete next.order; return next; }); }} /><small id={'quantity-hint-' + item.id}>{errors[index] || 'Minimum: ' + stockQuantityText(minimum > 0n ? minimum : 1n)}</small></td>
        </tr>;
      })}</tbody></table></div></fieldset>
      <div className="order-quantity-totals"><div><span>Saved order total</span><strong>{money(record.total, record.currency, record.decimalInTotalPrice ?? 2)}</strong></div><div><span>Updated order total</span><strong>{preview ? money(preview.total, record.currency, record.decimalInTotalPrice ?? 2) : '—'}</strong></div></div>
    </div><FormFooter onClose={onClose} busy={busy} label="Save quantities" /></form>
  </Modal>;
}
