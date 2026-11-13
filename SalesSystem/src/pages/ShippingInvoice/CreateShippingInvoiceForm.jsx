import React, { useState } from 'react';
import { api, money, unitMoney, today, dateInput, dateLabel } from '../../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../../salesPricing.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, FormFooter, ErrorNotice, Badge, PhotoField, roleLabel } from '../../components/UI.jsx';
import useSave from '../../hooks/useSave.js';

export default function CreateShippingInvoiceForm({
  invoices: initialInvoices,
  shippingInvoices: initialShippingInvoices,
  onClose,
  onSaved
}) {
  // Keep an open document's choices stable while its surrounding lists refresh.
  const [choices] = useState(() => ({ invoices: initialInvoices, shippingInvoices: initialShippingInvoices }));
  const { invoices, shippingInvoices } = choices;

  const shipped = new Set(shippingInvoices.map(record => String(record.invoiceId)));
  const eligible = invoices.filter(invoice => !shipped.has(String(invoice.id)));
  const [form, setForm] = useState({ invoiceId: '', shippingDate: today(), carrier: '', trackingNumber: '', notes: '' });
  const { busy, error, save } = useSave(onSaved);
  const selected = invoices.find(invoice => String(invoice.id) === String(form.invoiceId));
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function chooseInvoice(value) {
    const invoice = invoices.find(record => String(record.id) === String(value));
    const invoiceDate = dateInput(invoice?.invoiceDate);
    setForm(current => ({ ...current, invoiceId: value, shippingDate: invoiceDate && current.shippingDate < invoiceDate ? invoiceDate : current.shippingDate }));
  }
  function submit(event) {
    event.preventDefault();
    const body = { invoiceId: Number(form.invoiceId), shippingDate: form.shippingDate, carrier: form.carrier.trim() || null, trackingNumber: form.trackingNumber.trim() || null, notes: form.notes.trim() || null };
    save(() => api('/api/sales/shipping-invoices', { method: 'POST', body }));
  }
  return <Modal title="New shipping invoice" subtitle="Choose an existing invoice and enter its shipping details." onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <Field label="Invoice *" wide><select required value={form.invoiceId} onChange={event => chooseInvoice(event.target.value)}><option value="">Select an invoice</option>{eligible.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.customerName} · {money(invoice.total, invoice.currency)}</option>)}</select></Field>
      {selected && <div className="document-summary span-2"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Invoice total</span><strong>{money(selected.total, selected.currency)}</strong></div></div>}
      {!eligible.length && <div className="notice span-2">No eligible invoices. Create an invoice first. Each invoice can have one shipping invoice.</div>}
      <Field label="Shipping date *"><input type="date" required min={dateInput(selected?.invoiceDate) || undefined} value={form.shippingDate} onChange={event => set('shippingDate', event.target.value)} /></Field>
      <Field label="Carrier"><input maxLength={150} value={form.carrier} onChange={event => set('carrier', event.target.value)} /></Field>
      <Field label="Tracking number" wide><input maxLength={100} value={form.trackingNumber} onChange={event => set('trackingNumber', event.target.value)} /></Field>
      <Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={event => set('notes', event.target.value)} /></Field>
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={!eligible.length} label="Create shipping invoice" /></form>
  </Modal>;
}
