import { RequiredLabel } from './UI.jsx';
import React, { useId, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

export function textValues(fields, record) {
  return Object.fromEntries(Object.keys(fields).map(key => [key, record?.[key] || '']));
}

export function useMasterForm(initial, fields) {
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
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
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

  function errorFor(key) {
    return errors[key] && <small className="purchase-field-error" id={id + '-' + key.replaceAll('.', '-') + '-error'}>{errors[key]}</small>;
  }

  function textField(key, { wide = false, multiline = false, type = 'text' } = {}) {
    const field = fields[key];
    const label = field.label + (field.required ? ' *' : '');
    const shared = { ...props(key, label), value: form[key], maxLength: field.max, required: field.required || undefined, 'aria-required': field.required || undefined, onChange: event => set(key, event.target.value) };
    return <label className={'field ' + (wide ? 'purchase-span-2' : '')}>
      <span><RequiredLabel>{label}</RequiredLabel></span>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type={type} />}
      {errorFor(key)}
    </label>;
  }

  function choiceField(key, rows, valueKey, { wide = false, optional = true, labelKey = valueKey } = {}) {
    const field = fields[key];
    const label = field.label + (field.required ? ' *' : '');
    const values = rows.map(row => ({ value: String(row[valueKey] || ''), label: row[labelKey] || row[valueKey] })).filter(row => row.value);
    const historical = form[key] && !values.some(row => row.value === form[key]);
    return <label className={'field ' + (wide ? 'purchase-span-2' : '')}>
      <span><RequiredLabel>{label}</RequiredLabel></span>
      <select {...props(key, label)} value={form[key]} required={field.required || undefined} aria-required={field.required || undefined} onChange={event => set(key, event.target.value)}>
        <option value="">{optional && !field.required ? 'None' : 'Select ' + field.label}</option>
        {historical && <option value={form[key]} disabled>{form[key]} (current)</option>}
        {values.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
      </select>
      {errorFor(key)}
    </label>;
  }

  function numberField(key, label, places = 6) {
    return <label className="field">
      <span><RequiredLabel>{label}</RequiredLabel></span>
      <input {...props(key, label)} type="number" min={0} max={1e9} step={places === 5 ? '0.00001' : '0.000001'} value={form[key]} onChange={event => set(key, event.target.value)} />
      {errorFor(key)}
    </label>;
  }

  function focus(key) {
    setFocusTarget(key);
  }

  return { form, setForm, set, errors, setErrors, error, setError, busy, setBusy, focusTarget, setFocusTarget, controls, id, props, errorFor, textField, choiceField, numberField, focus };
}

export function FormTabs({ tabs, active, onChange, id, disabled }) {
  const refs = useRef({});
  function keyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex(tab => tab.id === active);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }
  return <div className="purchase-form-tabs" role="tablist" aria-label="Master details" onKeyDown={keyDown}>
    {tabs.map(tab => <button key={tab.id} ref={node => { refs.current[tab.id] = node; }} id={id + '-tab-' + tab.id} type="button" role="tab" aria-selected={active === tab.id} aria-controls={id + '-panel-' + tab.id} tabIndex={active === tab.id ? 0 : -1} disabled={disabled} onClick={() => onChange(tab.id)}>{tab.title}</button>)}
  </div>;
}

export function MasterFooter({ active, onActive, onClose, busy, label }) {
  return <div className="modal-footer purchase-form-footer">
    <label className="checkbox"><input type="checkbox" checked={active} disabled={busy} onChange={event => onActive(event.target.checked)} />Active</label>
    <div><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : label}<Icon name="check" size={17} /></button></div>
  </div>;
}
