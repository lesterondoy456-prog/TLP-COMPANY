import React, { useState } from 'react';
import { api, money, unitMoney, today, dateInput, dateLabel } from '../../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../../salesPricing.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, FormFooter, ErrorNotice, Badge, PhotoField, roleLabel } from '../../components/UI.jsx';
import useSave from '../../hooks/useSave.js';

export default function CreateDeliveryReceiptForm({
  orders: initialOrders,
  customers: initialCustomers,
  onClose,
  onSaved
}) {
  // Keep an open document's choices stable while its surrounding lists refresh.
  const [choices] = useState(() => ({ orders: initialOrders, customers: initialCustomers }));
  const { orders, customers } = choices;

  const invoice = false;
  const eligible = orders.filter(order => order.status === 'confirmed' && !order.delivered);
  const [form, setForm] = useState({
    orderId: '',
    invoiceDate: today(),
    dueDate: today(),
    deliveryDate: today(),
    receivedBy: '',
    address: '',
    notes: ''
  });
  const {
    busy,
    error,
    save
  } = useSave(onSaved);
  const selected = orders.find(order => String(order.id) === String(form.orderId));
  const set = (key, value) => setForm(f => ({
    ...f,
    [key]: value
  }));
  function chooseOrder(value) {
    const order = orders.find(order => String(order.id) === String(value));
    const customer = customers.find(customer => customer.id === order?.customerId);
    setForm(f => ({
      ...f,
      orderId: value,
      address: customer?.address || '',
      receivedBy: customer?.contactPerson || customer?.name || ''
    }));
  }
  function submit(event) {
    event.preventDefault();
    const body = {
      orderId: Number(form.orderId),
      deliveryDate: form.deliveryDate,
      receivedBy: form.receivedBy.trim(),
      address: form.address.trim(),
      notes: form.notes
    };
    save(() => api('/api/sales/delivery-receipts', {
      method: 'POST',
      body
    }));
  }
  return <Modal title={'New delivery receipt'} subtitle={'Record a full delivery and update product stock.'} onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <Field label="Sales order *" wide><select required value={form.orderId} onChange={e => chooseOrder(e.target.value)}><option value="">Select a confirmed order</option>{eligible.map(order => <option key={order.id} value={order.id}>{order.number} · {order.customerName} · {money(order.total, order.currency)}</option>)}</select></Field>
      {selected && <div className="document-summary span-2"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Order total</span><strong>{money(selected.total, selected.currency)}</strong></div></div>}
      {!eligible.length && <div className="notice span-2">No eligible orders. Create and confirm a sales order first. Each order can have one invoice and one full delivery receipt.</div>}
      {<>
        <Field label="Delivery date *"><input type="date" required value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} /></Field>
        <Field label="Received by *"><input required maxLength={150} value={form.receivedBy} onChange={e => set('receivedBy', e.target.value)} /></Field>
        <Field label="Delivery address *" wide><textarea required rows={2} maxLength={500} value={form.address} onChange={e => set('address', e.target.value)} /></Field>
        <div className="notice span-2"><Icon name="box" size={18} />Saving this receipt deducts all order quantities from stock. Insufficient stock will prevent the delivery.</div>
      </>}
      <Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={!eligible.length} label={'Create delivery receipt'} /></form>
  </Modal>;
}
