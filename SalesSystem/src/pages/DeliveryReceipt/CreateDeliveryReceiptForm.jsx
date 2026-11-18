import React, { useEffect, useRef, useState } from 'react';
import { api, today, dateLabel } from '../../api.js';
import { Modal, Field, FormFooter, ErrorNotice, LoadingSkeleton } from '../../components/UI.jsx';
import { validateDeliveryReceiptForm } from '../../helper/validation.js';
import useSave from '../../hooks/useSave.js';
import './DeliveryReceiptView.css';

export default function CreateDeliveryReceiptForm({ invoices = [], onClose, onSaved }) {
  const [form, setForm] = useState({ invoiceId: '', deliveryDate: today(), receivedBy: '', address: '', notes: '' });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [errors, setErrors] = useState({});
  const addressEdited = useRef(false);
  const { busy, error, save } = useSave(onSaved);
  const eligible = invoices.filter(invoice => !invoice.delivered && !invoice.deliveryReceiptId);
  const chosen = invoices.find(invoice => String(invoice.id) === String(form.invoiceId));
  const available = Boolean(chosen && !chosen.delivered && !chosen.deliveryReceiptId);

  useEffect(() => {
    if (!form.invoiceId) { setSelected(null); setLoading(false); setLoadError(''); return; }
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setSelected(null);
    api('/api/sales/sales-invoices/' + form.invoiceId, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (!result.record || String(result.record.id) !== String(form.invoiceId) || !Array.isArray(result.record.items)) throw new Error('The saved invoice items were not returned. Try again.');
      setSelected(result.record);
      if (!addressEdited.current) setForm(current => ({ ...current, address: result.record.billToAddress ?? result.record.customerAddress ?? '' }));
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [form.invoiceId, retry]);

  function change(key, value) {
    if (key === 'address') addressEdited.current = true;
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
  }
  function chooseInvoice(value) {
    addressEdited.current = false;
    setErrors({});
    setForm(current => ({ ...current, invoiceId: value, address: '', receivedBy: '' }));
  }
  function submit(event) {
    event.preventDefault();
    if (busy || loading) return;
    const issues = validateDeliveryReceiptForm(form, selected, available);
    setErrors(issues);
    if (Object.keys(issues).length) {
      const element = event.currentTarget;
      requestAnimationFrame(() => element.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    save(() => api('/api/sales/delivery-receipts', {
      method: 'POST',
      body: { invoiceId: Number(form.invoiceId), deliveryDate: form.deliveryDate, receivedBy: form.receivedBy.trim() || null, address: form.address.trim(), notes: form.notes.trim() || null },
    }));
  }

  return <Modal wide className="delivery-receipt-create" title="New delivery receipt" subtitle="Use the saved invoice quantities, product codes, descriptions and units." onClose={onClose} busy={busy}>
    <form noValidate onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <Field label="Invoice *" wide><select required value={form.invoiceId} aria-invalid={errors.invoiceId ? true : undefined} onChange={event => chooseInvoice(event.target.value)}><option value="">Choose an invoice</option>{chosen && !available && <option value={chosen.id} disabled>{chosen.number} — Delivery receipt already created</option>}{eligible.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number}{(invoice.shipToName ?? invoice.billToName ?? invoice.customerName) ? ' · ' + (invoice.shipToName ?? invoice.billToName ?? invoice.customerName) : ''}</option>)}</select>{errors.invoiceId && <small className="field-error" role="alert">{errors.invoiceId}</small>}</Field>
      {!eligible.length && !form.invoiceId && <div className="notice span-2">No invoices are available. Create an invoice first. Each invoice can have one full delivery receipt.</div>}
      {chosen && !available && <div className="notice error span-2" role="alert">This invoice already has a delivery receipt or is no longer available. Choose another invoice.</div>}
      {loading && <div className="span-2"><LoadingSkeleton label="Loading invoice items" rows={2} /></div>}
      {loadError && <div className="notice error span-2" role="alert"><span>{loadError}</span><button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry invoice items</button></div>}
      {selected && <>
        <div className="document-summary span-2"><div><span>Delivered to</span><strong>{selected.shipToName ?? selected.billToName ?? selected.customerName ?? '—'}</strong></div><div><span>Invoice date</span><strong>{dateLabel(selected.invoiceDate)}</strong></div></div>
        <section className="dr-invoice-items span-2" aria-label="Invoice items"><div className="dr-invoice-items-heading"><h3>Invoice items</h3><span>{selected.items.length} {selected.items.length === 1 ? 'item' : 'items'}</span></div><p>These saved quantities and product details are fixed for this delivery receipt.</p>
          <div className="dr-invoice-items-scroll" tabIndex={0} role="region" aria-label="Saved invoice items"><table><thead><tr><th>Product code</th><th>Description</th><th>UOP</th><th className="numeric">Quantity</th></tr></thead><tbody>{selected.items.map((item, index) => <tr key={item.id ?? index} data-dr-source-item={index}><td>{item.sku || '—'}</td><td>{item.description || item.productDescription || item.productName || '—'}</td><td>{item.unit || '—'}</td><td className="numeric">{new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(item.quantity)}</td></tr>)}</tbody></table></div>
          {!selected.items.length && <div className="notice error">This invoice has no saved items and cannot be delivered.</div>}
        </section>
      </>}
      <Field label="Delivery date *"><input type="date" required value={form.deliveryDate} min={selected?.invoiceDate?.slice(0, 10)} aria-invalid={errors.deliveryDate ? true : undefined} onChange={event => change('deliveryDate', event.target.value)} />{errors.deliveryDate && <small className="field-error" role="alert">{errors.deliveryDate}</small>}</Field>
      <Field label="Received by"><input maxLength={150} value={form.receivedBy} aria-invalid={errors.receivedBy ? true : undefined} onChange={event => change('receivedBy', event.target.value)} />{errors.receivedBy && <small className="field-error" role="alert">{errors.receivedBy}</small>}</Field>
      <Field label="Delivery address *" wide><textarea required rows={3} maxLength={500} value={form.address} aria-invalid={errors.address ? true : undefined} onChange={event => change('address', event.target.value)} />{errors.address && <small className="field-error" role="alert">{errors.address}</small>}</Field>
      <div className="notice span-2">Delivery quantities come from the saved invoice. Creating this delivery receipt does not deduct stock.</div>
      <Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} aria-invalid={errors.notes ? true : undefined} onChange={event => change('notes', event.target.value)} />{errors.notes && <small className="field-error" role="alert">{errors.notes}</small>}</Field>
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={loading || !available || !selected?.items?.length} label="Create delivery receipt" /></form>
  </Modal>;
}
