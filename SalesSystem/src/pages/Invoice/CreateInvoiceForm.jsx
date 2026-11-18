import React, { useState } from 'react';
import { api, money, today } from '../../api.js';
import { Modal, Field, FormFooter, ErrorNotice } from '../../components/UI.jsx';
import { invoiceStockIssue } from '../../helper/validation.js';
import useSave from '../../hooks/useSave.js';

export default function CreateInvoiceForm({
  orders: initialOrders,
  products,
  onClose,
  onSaved
}) {
  // Keep an open document's choices stable while its surrounding lists refresh.
  const [orders] = useState(initialOrders);

  const eligible = orders.filter(order => order.status === 'confirmed' && !order.invoiced);
  const [form, setForm] = useState({
    orderId: '',
    invoiceDate: today(),
    dueDate: today(),
    notes: ''
  });
  const {
    busy,
    error,
    save
  } = useSave(onSaved);
  const [formError, setFormError] = useState('');
  const selected = orders.find(order => String(order.id) === String(form.orderId));
  const stockIssue = selected ? invoiceStockIssue(selected, products) : '';
  const set = (key, value) => setForm(f => ({
    ...f,
    [key]: value
  }));
  function submit(event) {
    event.preventDefault();
    const issue = invoiceStockIssue(selected, products);
    setFormError(issue);
    if (issue) return;
    const body = {
      orderId: Number(form.orderId),
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      notes: String(form.notes ?? '').trim() || null
    };
    save(() => api('/api/sales/sales-invoices', {
      method: 'POST',
      body
    }));
  }
  return <Modal title={'New sales invoice'} subtitle={'Create an invoice and record stock out for its items.'} onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={formError || stockIssue || error} /><fieldset disabled={busy} className="form-grid">
      <Field label="Sales order *" wide><select required value={form.orderId} onChange={e => { setFormError(''); set('orderId', e.target.value); }}><option value="">Select a confirmed order</option>{eligible.map(order => <option key={order.id} value={order.id}>{order.number} · {order.customerName} · {money(order.total, order.currency, order.decimalInTotalPrice ?? 2)}</option>)}</select></Field>
      {selected && <div className="document-summary span-2"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Order total</span><strong>{money(selected.total, selected.currency, selected.decimalInTotalPrice ?? 2)}</strong></div></div>}
      {!eligible.length && <div className="notice span-2">No eligible orders. Create and confirm a sales order first. Each order can have one invoice and one full delivery receipt.</div>}
      <div className="notice span-2">Saving this invoice deducts its quantities from stock and records the stock-out transaction. Its delivery receipt will use these saved items without another deduction.</div>
      {<>
        <Field label="Invoice date *"><input type="date" required value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} /></Field>
        <Field label="Due date *"><input type="date" required min={form.invoiceDate} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
      </>}
      <Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={!eligible.length || Boolean(stockIssue)} label={'Create invoice'} /></form>
  </Modal>;
}
