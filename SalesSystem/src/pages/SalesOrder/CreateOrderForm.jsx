import React, { useState } from 'react';
import { api, money, unitMoney, today, dateInput, dateLabel } from '../../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../../salesPricing.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, FormFooter, ErrorNotice, Badge, PhotoField, roleLabel } from '../../components/UI.jsx';
import useSave from '../../hooks/useSave.js';

export default function CreateOrderForm({ record, customers, products, onClose, onSaved }) {
  const [form, setForm] = useState({ customerId: record?.customerId || '', orderDate: dateInput(record?.orderDate) || today(), notes: record?.notes || '', status: record?.status || 'draft' });
  const [items, setItems] = useState(record?.items?.map(item => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })) || [{ productId: '', quantity: 1, unitPrice: 0 }]);
  const { busy, error, save } = useSave(onSaved);
  const [validation, setValidation] = useState('');
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  function update(index, key, value) {
    setItems(old => old.map((item, i) => i !== index ? item : { ...item, [key]: value, ...(key === 'productId' ? { unitPrice: products.find(p => String(p.id) === String(value))?.price || 0 } : {}) }));
  }
  const total = salesTotal(items);
  const currencies = [...new Set(items.map(item => products.find(product => String(product.id) === String(item.productId))).filter(Boolean).map(product => String(product.currency || 'PHP').trim().toUpperCase() || 'PHP'))];
  const currency = currencies[0] || record?.currency || 'PHP';
  function submit(event) {
    event.preventDefault(); setValidation('');
    if (!items.length || items.some(item => !item.productId || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0)) { setValidation('Add at least one product with a positive quantity and valid price.'); return; }
    if (new Set(items.map(item => String(item.productId))).size !== items.length) { setValidation('Use one line per product. Combine quantities for repeated products.'); return; }
    if (currencies.length > 1) { setValidation('Use products with the same currency in one sales order.'); return; }
    const body = { ...form, currency, customerId: Number(form.customerId), items: items.map(item => ({ productId: Number(item.productId), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) };
    save(() => api(record ? '/api/sales/sales-orders/' + record.id : '/api/sales/sales-orders', { method: record ? 'PUT' : 'POST', body }));
  }
  return <Modal wide title={record ? 'Edit ' + record.number : 'New sales order'} subtitle="Choose a customer, add products, and confirm when ready." onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error || validation} /><fieldset disabled={busy}>
      <div className="form-grid">
        <Field label="Customer *"><select required value={form.customerId} onChange={e => set('customerId', e.target.value)}><option value="">Select a customer</option>{customers.filter(c => c.isActive || c.id === record?.customerId).map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
        <Field label="Order date *"><input type="date" required value={form.orderDate} onChange={e => set('orderDate', e.target.value)} /></Field>
        <Field label="Currency"><input value={currency} readOnly /></Field>
      </div>
      <div className="section-label"><h3>Order items</h3><span>Prices in {currency}</span></div>
      <div className="order-lines"><div className="order-line line-head"><span>Product</span><span>Quantity</span><span>Unit price</span><span>Amount</span><span /></div>
        {items.map((item, i) => <div className="order-line" key={i}>
          <select aria-label={'Product ' + (i + 1)} required value={item.productId} onChange={e => update(i, 'productId', e.target.value)}><option value="">Select product</option>{products.filter(p => p.isActive || p.id === item.productId).map(p => <option key={p.id} value={p.id} disabled={items.some((line, index) => index !== i && String(line.productId) === String(p.id))}>{p.sku} · {p.name} ({p.stock} {p.unit})</option>)}</select>
          <input aria-label={'Quantity ' + (i + 1)} type="number" required min="0.001" max="1000000" step="0.001" value={item.quantity} onChange={e => update(i, 'quantity', e.target.value)} />
          <input aria-label={'Unit price ' + (i + 1)} type="number" required min="0" max="100000000" step="0.000001" value={item.unitPrice} onChange={e => update(i, 'unitPrice', e.target.value)} />
          <strong className="line-amount">{money(lineTotal(item), currency)}</strong>
          <button type="button" className="icon-button danger-text" aria-label={'Remove product ' + (i + 1)} disabled={items.length === 1} onClick={() => setItems(old => old.filter((_, index) => index !== i))}><Icon name="x" size={17} /></button>
        </div>)}
      </div>
      <div className="order-bottom"><button type="button" className="button secondary small" onClick={() => setItems(old => [...old, { productId: '', quantity: 1, unitPrice: 0 }])}>+ Add product</button><div><span>Order total</span><strong>{money(total, currency)}</strong></div></div>
      <div className="form-grid"><Field label="Status *"><select value={form.status} onChange={e => set('status', e.target.value)}><option value="draft">Draft</option><option value="confirmed">Confirmed</option></select></Field><div className="field-hint">Only confirmed orders can be invoiced or delivered. Stock is deducted when a delivery receipt is created.</div><Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field></div>
      {(!customers.some(c => c.isActive) || !products.some(p => p.isActive)) && <div className="notice">Create an active customer and product in their master lists before saving an order.</div>}
    </fieldset></div><FormFooter onClose={onClose} busy={busy} label="Save sales order" /></form>
  </Modal>;
}
