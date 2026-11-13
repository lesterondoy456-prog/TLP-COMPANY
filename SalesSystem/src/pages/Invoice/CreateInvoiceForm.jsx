import React, { useState } from 'react';
import { api, money, unitMoney, today, dateInput, dateLabel } from '../../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../../salesPricing.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, FormFooter, ErrorNotice, Badge, PhotoField, roleLabel } from '../../components/UI.jsx';
import useSave from '../../hooks/useSave.js';

export default function CreateInvoiceForm({
  orders: initialOrders,
  customers: initialCustomers,
  onClose,
  onSaved
}) {
  // Keep an open document's choices stable while its surrounding lists refresh.
  const [choices] = useState(() => ({ orders: initialOrders, customers: initialCustomers }));
  const { orders, customers } = choices;

  const invoice = true;
  const eligible = orders.filter(order => order.status === 'confirmed' && !order.invoiced);
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
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      notes: form.notes
    };
    save(() => api('/api/sales/sales-invoices', {
      method: 'POST',
      body
    }));
  }
  return <Modal title={'New sales invoice'} subtitle={'Create an invoice from a confirmed sales order.'} onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <Field label="Sales order *" wide><select required value={form.orderId} onChange={e => chooseOrder(e.target.value)}><option value="">Select a confirmed order</option>{eligible.map(order => <option key={order.id} value={order.id}>{order.number} · {order.customerName} · {money(order.total, order.currency)}</option>)}</select></Field>
      {selected && <div className="document-summary span-2"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Order total</span><strong>{money(selected.total, selected.currency)}</strong></div></div>}
      {!eligible.length && <div className="notice span-2">No eligible orders. Create and confirm a sales order first. Each order can have one invoice and one full delivery receipt.</div>}
      {<>
        <Field label="Invoice date *"><input type="date" required value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} /></Field>
        <Field label="Due date *"><input type="date" required min={form.invoiceDate} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
      </>}
      <Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={!eligible.length} label={'Create invoice'} /></form>
  </Modal>;
}
