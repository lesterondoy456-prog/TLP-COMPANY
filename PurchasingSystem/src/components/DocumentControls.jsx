import React, { useId, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { currencyLabel } from './PurchasingDisplay.jsx';

export function useDocumentEditor(initial) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);
  const controls = useRef({});
  const id = useId();

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateItem(index, key, value) {
    setForm(current => ({ ...current, items: current.items.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
    setErrors(current => {
      const next = { ...current };
      delete next['items.' + index + '.' + key];
      return next;
    });
  }

  function props(key, label) {
    return {
      id: id + '-' + key.replaceAll('.', '-'),
      name: key,
      disabled: busy,
      ref: node => { controls.current[key] = node; },
      'aria-label': label,
      'aria-invalid': Boolean(errors[key]),
      'aria-describedby': errors[key] ? id + '-' + key.replaceAll('.', '-') + '-error' : undefined,
    };
  }

  function feedback(key) {
    return errors[key] && <small id={id + '-' + key.replaceAll('.', '-') + '-error'} className="purchase-field-error">{errors[key]}</small>;
  }

  function input(key, label, { type = 'text', maxLength, required = false, list, min, max, step, wide = false, multiline = false } = {}) {
    const displayLabel = label + (required ? ' *' : '');
    const shared = { ...props(key, displayLabel), value: form[key] ?? '', maxLength, 'aria-required': required || undefined, onChange: event => set(key, event.target.value) };
    return <label className={'field ' + (wide ? 'purchase-span-2' : '')}>
      <span>{displayLabel}</span>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type={type} list={list} min={min} max={max} step={step} />}
      {feedback(key)}
    </label>;
  }

  function choice(key, label, rows, { required = false, wide = false, onChange } = {}) {
    const displayLabel = label + (required ? ' *' : '');
    const historical = form[key] && !rows.some(row => String(row.value) === String(form[key]));
    return <label className={'field ' + (wide ? 'purchase-span-2' : '')}>
      <span>{displayLabel}</span>
      <select {...props(key, displayLabel)} value={form[key]} aria-required={required || undefined} onChange={event => onChange ? onChange(event.target.value) : set(key, event.target.value)}>
        <option value="">Select {label}</option>
        {historical && <option value={form[key]} disabled>{form[key]} (current)</option>}
        {rows.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
      </select>
      {feedback(key)}
    </label>;
  }


  function reject(invalid) {
    setErrors(invalid);
    setError('');
    const first = Object.keys(invalid)[0];
    if (!first) return null;
    setError('Please correct the highlighted fields before saving.');
    setFocusTarget(first);
    return first;
  }

  return { form, setForm, set, updateItem, errors, setErrors, error, setError, busy, setBusy, focusTarget, setFocusTarget, controls, id, props, feedback, input, choice, reject };
}

export function ReadonlyField({ label, value, wide = false }) {
  return <label className={'field ' + (wide ? 'purchase-span-2' : '')}><span>{label}</span><input value={value ?? ''} readOnly /></label>;
}

export function EntryFooter({ onClose, busy, label }) {
  return <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : label}<Icon name="check" size={17} /></button></div>;
}

export function ActorField({ label, name }) {
  return <label className="field"><span>{label}</span><select disabled value={name || ''}><option value={name || ''}>{name || ''}</option></select></label>;
}

export function Totals({ totals, currency, places = 2 }) {
  return <div className="purchase-totals">
    {[['grossAmount', 'Gross Amt'], ['discountAmount', 'Disc. Amt'], ['vatAmount', 'Vat Amt'], ['netAmount', 'Net Amount'], ['amount', 'Amount']].map(([key, label]) => <ReadonlyField key={key} label={label} value={currencyLabel(totals[key], currency, places)} />)}
  </div>;
}

export function sourceItems(documents, allowedStatuses) {
  return documents.filter(record => allowedStatuses.includes(record.status)).flatMap(record => (record.items || []).map(item => ({ ...item, sourceNumber: record.number, sourceId: record.id })));
}
