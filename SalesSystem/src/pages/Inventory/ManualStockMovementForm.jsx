import React, { useRef, useState } from 'react';
import { api, today } from '../../api.js';
import { Modal, Field, ErrorNotice, focusModalControl } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import { manualStockIssue, stockQuantityUnits, stockQuantityText, validateManualStockMovementForm } from '../../helper/validation.js';

const quantity = value => value == null ? '\u2014' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value);

export default function ManualStockMovementForm({ product, productId, direction, onClose, onSaved }) {
  const [form, setForm] = useState({ movementDate: today(), quantity: '', sourceDestination: '', reason: '', reference: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const request = useRef({ signature: '', key: '' });
  const controls = useRef({});
  const incoming = direction === 'in';
  const unavailable = manualStockIssue(product);
  const before = product ? stockQuantityUnits(product.stock) : null;
  const entered = stockQuantityUnits(form.quantity);
  const after = before === null || entered === null ? null : incoming ? before + entered : before - entered;

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => { const next = { ...current }; delete next[key]; return next; });
    setError('');
  }
  function control(key, label) {
    return { name: key, 'aria-label': label, ref: element => { controls.current[key] = element; }, 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? 'stock-movement-error-' + key : undefined };
  }
  function fieldError(key) { return errors[key] && <small className="field-error" id={'stock-movement-error-' + key}>{errors[key]}</small>; }
  async function submit(event) {
    event.preventDefault();
    if (saving.current) return;
    const invalid = validateManualStockMovementForm(form, product, direction);
    const units = stockQuantityUnits(form.quantity);
    const body = units === null ? null : { direction, quantity: stockQuantityText(units), movementDate: form.movementDate, sourceDestination: form.sourceDestination.trim(), reason: form.reason.trim(), reference: form.reference.trim() || null };
    const signature = body ? JSON.stringify(body) : '';
    // A failed response may follow a committed movement. Reuse the same key and
    // payload so a retry can retrieve that result even if live stock has changed.
    const retry = signature && request.current.signature === signature && request.current.key;
    if (Object.keys(invalid).length && !retry) {
      setErrors(invalid);
      const first = Object.keys(invalid)[0];
      setError(invalid[first]);
      focusModalControl(controls.current[first]);
      return;
    }
    setErrors({}); setError('');
    if (!review) { setReview(true); return; }
    if (!request.current.key || request.current.signature !== signature) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      request.current = { signature, key: Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('') };
    }
    saving.current = true; setBusy(true);
    try {
      const result = await api('/api/sales/products/' + productId + '/stock-movements', { method: 'POST', body: { ...body, requestKey: request.current.key } });
      onSaved(result, incoming ? 'Stock in recorded.' : 'Stock out recorded.');
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  }

  return <Modal title={incoming ? 'Manual stock in' : 'Manual stock out'} subtitle={product?.sku || 'Product inventory'} className="inventory-manual-modal" onClose={onClose} busy={busy}>
    <form className="inventory-manual-form" onSubmit={submit} noValidate>
      <div className="modal-body">
        <ErrorNotice message={error || unavailable} />
        <dl className="inventory-product-summary">
          <div className="inventory-product-wide"><dt>Product</dt><dd><strong>{product?.sku || '\u2014'}</strong>{product?.description && <small>{product.description}</small>}</dd></div>
          <div><dt>UOP</dt><dd>{product?.unit || '\u2014'}</dd></div>
          <div><dt>Current stock</dt><dd className="inventory-current-stock">{before === null ? '\u2014' : quantity(stockQuantityText(before))}</dd></div>
          <div className="inventory-stock-preview"><dt>After movement (preview)</dt><dd className={after !== null && after < 0n ? 'danger-text' : ''}>{after === null ? '\u2014' : quantity(stockQuantityText(after))}</dd></div>
        </dl>
        <fieldset className="form-grid inventory-movement-fields" disabled={busy || review}>
          <Field label="Movement date *"><input {...control('movementDate', 'Movement date *')} type="date" required value={form.movementDate} onChange={event => set('movementDate', event.target.value)} />{fieldError('movementDate')}</Field>
          <Field label="Quantity *"><input {...control('quantity', 'Quantity *')} type="number" inputMode="decimal" required min="0.001" max="999999999999999.999" step="0.001" value={form.quantity} onChange={event => set('quantity', event.target.value)} />{fieldError('quantity')}</Field>
          <Field label={incoming ? 'Source *' : 'Destination *'} wide><textarea {...control('sourceDestination', incoming ? 'Source *' : 'Destination *')} required rows={2} maxLength={500} value={form.sourceDestination} onChange={event => set('sourceDestination', event.target.value)} />{fieldError('sourceDestination')}</Field>
          <Field label="Reason *" wide><textarea {...control('reason', 'Reason *')} required rows={3} maxLength={2000} value={form.reason} onChange={event => set('reason', event.target.value)} />{fieldError('reason')}</Field>
          <Field label="Reference (optional)" wide><input {...control('reference', 'Reference (optional)')} maxLength={100} value={form.reference} onChange={event => set('reference', event.target.value)} />{fieldError('reference')}</Field>
        </fieldset>
        {review && <div className="inventory-review" role="status"><Icon name={incoming ? 'arrowDown' : 'arrowUp'} size={19} /><div><strong>Review {incoming ? 'stock in' : 'stock out'} of {quantity(stockQuantityText(entered ?? 0n))} {product?.unit || ''}.</strong><p>Check the date, quantity and details above. Confirm to record this movement.</p></div></div>}
      </div>
      <div className="modal-footer inventory-movement-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        {review && <button type="button" className="button secondary" disabled={busy} onClick={() => { setReview(false); setError(''); }}>Back to edit</button>}
        <button type="submit" className="button primary" disabled={busy || Boolean(unavailable && !request.current.key)}>{busy ? 'Saving...' : review ? incoming ? 'Confirm stock in' : 'Confirm stock out' : 'Review movement'}<Icon name="check" size={17} /></button>
      </div>
    </form>
  </Modal>;
}
