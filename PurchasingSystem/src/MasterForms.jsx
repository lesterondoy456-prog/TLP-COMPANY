import React, { useEffect, useId, useRef, useState } from 'react';
import { api, dateInput } from '../../SalesSystem/src/api.js';
import { ErrorNotice, Modal, focusModalControl } from '../../SalesSystem/src/components/UI.jsx';
import { Icon } from '../../SalesSystem/src/components/Icons.jsx';

const SUPPLIER_TEXT = {
  name: { label: 'Name', max: 180, required: true },
  shortName: { label: 'Short Name', max: 80, required: true },
  businessStyle: { label: 'Business Style', max: 180, required: true },
  address: { label: 'Office Address', max: 500, required: true },
  remarks: { label: 'Remarks', max: 2000 },
  tin: { label: 'TIN', max: 50 },
  contactPerson: { label: 'Contact Person', max: 150 },
  email: { label: 'Email Address', max: 254 },
  countryOfOrigin: { label: 'Country Of Origin', max: 100 },
  country: { label: 'Country', max: 100 },
  cpnumber: { label: 'Phone No.', max: 30 },
  faxNo: { label: 'Fax No.', max: 30 },
  paymentTerm: { label: 'Payment Term', max: 100 },
  vatCode: { label: 'VAT Code', max: 80, required: true },
  taxCode: { label: 'Tax Code', max: 80 },
};

const SUPPLIES_TEXT = {
  maker: { label: 'Maker', max: 150 },
  name: { label: 'Name', max: 180, required: true },
  description: { label: 'Description', max: 1000 },
  remarks: { label: 'Remarks', max: 2000 },
  color: { label: 'Color', max: 80 },
  unit: { label: 'Unit of Measure', max: 30, required: true },
  weightUnit: { label: 'Weight Unit', max: 30 },
  category: { label: 'Category', max: 100 },
};

function textValues(fields, record) {
  return Object.fromEntries(Object.keys(fields).map(key => [key, record?.[key] || '']));
}

function textErrors(fields, form) {
  const errors = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = String(form[key] || '').trim();
    if (field.required && !value) errors[key] = field.label + ' is required.';
    else if (value.length > field.max) errors[key] = 'Use ' + field.max + ' characters or fewer.';
  }
  return errors;
}

function validNumber(value, places, min = 0) {
  const number = Number(value);
  return value !== '' && Number.isFinite(number) && number >= min && number <= 1e9
    && Math.abs(number * 10 ** places - Math.round(number * 10 ** places)) <= 1e-5;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}

function useMasterForm(initial, fields) {
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
    const shared = { ...props(key, label), value: form[key], maxLength: field.max, 'aria-required': field.required || undefined, onChange: event => set(key, event.target.value) };
    return <label className={'field ' + (wide ? 'purchase-span-2' : '')}>
      <span>{label}</span>
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
      <span>{label}</span>
      <select {...props(key, label)} value={form[key]} aria-required={field.required || undefined} onChange={event => set(key, event.target.value)}>
        <option value="">{optional && !field.required ? 'None' : 'Select ' + field.label}</option>
        {historical && <option value={form[key]} disabled>{form[key]} (current)</option>}
        {values.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
      </select>
      {errorFor(key)}
    </label>;
  }

  function numberField(key, label, places = 6) {
    return <label className="field">
      <span>{label}</span>
      <input {...props(key, label)} type="number" min={0} max={1e9} step={places === 5 ? '0.00001' : '0.000001'} value={form[key]} onChange={event => set(key, event.target.value)} />
      {errorFor(key)}
    </label>;
  }

  function focus(key) {
    setFocusTarget(key);
  }

  return { form, setForm, set, errors, setErrors, error, setError, busy, setBusy, focusTarget, setFocusTarget, controls, id, props, errorFor, textField, choiceField, numberField, focus };
}

function FormTabs({ tabs, active, onChange, id, disabled }) {
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

function MasterFooter({ active, onActive, onClose, busy, label }) {
  return <div className="modal-footer purchase-form-footer">
    <label className="checkbox"><input type="checkbox" checked={active} disabled={busy} onChange={event => onActive(event.target.checked)} />Active</label>
    <div><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : label}<Icon name="check" size={17} /></button></div>
  </div>;
}

export function SupplierForm({ record, options, onClose, onSaved }) {
  const editor = useMasterForm(() => ({
    ...textValues(SUPPLIER_TEXT, record),
    decimalInPrice: record?.decimalInPrice ?? 2,
    decimalInTotalPrice: record?.decimalInTotalPrice ?? 2,
    vatInclusive: record?.vatInclusive === true,
    isActive: record?.isActive !== false,
  }), SUPPLIER_TEXT);
  const { form, set, props, errorFor, textField, choiceField } = editor;
  const paymentTerms = (options.paymentTerms || []).map(row => ({ value: row.name || row.description || '', label: row.name || row.description || '' }));
  const vatCodes = (options.vatCodes || []).map(row => ({ value: row.code || row.name || '', label: [row.code || row.name, row.description, row.rate != null ? row.rate + '%' : ''].filter(Boolean).join(' · ') }));
  const taxCodes = (options.taxCodes || []).map(row => ({ value: row.code || row.name || '', label: [row.code || row.name, row.description].filter(Boolean).join(' · ') }));

  useEffect(() => {
    if (!editor.focusTarget) return;
    focusModalControl(editor.controls.current[editor.focusTarget]);
    editor.setFocusTarget(null);
  }, [editor.focusTarget]);

  async function submit(event) {
    event.preventDefault();
    if (editor.busy) return;
    const invalid = textErrors(SUPPLIER_TEXT, form);
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) invalid.email = 'Enter a valid Email Address.';
    for (const key of ['decimalInPrice', 'decimalInTotalPrice']) {
      if (form[key] === '' || !Number.isInteger(Number(form[key])) || Number(form[key]) < 0 || Number(form[key]) > 6) invalid[key] = 'Enter a whole number from 0 to 6.';
    }
    editor.setErrors(invalid);
    editor.setError('');
    const first = Object.keys(invalid)[0];
    if (first) {
      editor.setError('Please correct the highlighted fields before saving.');
      editor.focus(first);
      return;
    }
    const body = Object.fromEntries(Object.keys(SUPPLIER_TEXT).map(key => [key, String(form[key]).trim()]));
    Object.assign(body, { decimalInPrice: Number(form.decimalInPrice), decimalInTotalPrice: Number(form.decimalInTotalPrice), vatInclusive: form.vatInclusive, isActive: form.isActive });
    editor.setBusy(true);
    try {
      const result = await api('/suppliers' + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body });
      onSaved(result);
    } catch (error) {
      editor.setError(error.message);
    } finally {
      editor.setBusy(false);
    }
  }

  return <Modal title={record ? 'Edit supplier' : 'New supplier'} subtitle="Supplier information, purchase order preferences, and tax settings." className="purchase-master-modal" onClose={onClose} busy={editor.busy}>
    <form onSubmit={submit} noValidate>
      <FormTabs tabs={[{ id: 'basic', title: 'Basic Info' }]} active="basic" onChange={() => {}} id={editor.id} disabled={editor.busy} />
      <div className="modal-body purchase-form-body"><ErrorNotice message={editor.error} />
        <fieldset disabled={editor.busy}>
          <div role="tabpanel" id={editor.id + '-panel-basic'} aria-labelledby={editor.id + '-tab-basic'}>
            <div className="purchase-master-layout">
              <section className="purchase-section"><h3>Basic Information</h3><div className="purchase-fields">
                <label className="field"><span>Supplier Id</span><input readOnly value={record?.id ?? ''} /></label>
                {textField('name', { wide: true })}{textField('shortName')}{textField('businessStyle')}
                {textField('address', { wide: true, multiline: true })}{textField('remarks', { wide: true, multiline: true })}
              </div></section>
              <section className="purchase-section"><h3>Other Information</h3><div className="purchase-fields">
                {textField('tin')}{textField('contactPerson')}{textField('email', { wide: true, type: 'email' })}
                {choiceField('countryOfOrigin', options.countries || [], 'name')}{choiceField('country', options.countries || [], 'name')}
                {textField('cpnumber', { type: 'tel' })}{textField('faxNo', { type: 'tel' })}
              </div></section>
              <section className="purchase-section"><h3>PO</h3><div className="purchase-fields">
                {[['decimalInPrice', 'Decimal in Price *'], ['decimalInTotalPrice', 'Decimal in Total Price *']].map(([key, label]) => <label className="field" key={key}><span>{label}</span><input {...props(key, label)} type="number" min={0} max={6} step={1} value={form[key]} onChange={event => set(key, event.target.value)} />{errorFor(key)}</label>)}
                {choiceField('paymentTerm', paymentTerms, 'value', { wide: true, labelKey: 'label' })}
              </div></section>
              <section className="purchase-section"><h3>TAX</h3><div className="purchase-fields">
                {choiceField('vatCode', vatCodes, 'value', { wide: true, labelKey: 'label', optional: false })}
                <fieldset className="purchase-radio-group purchase-span-2" aria-label="VAT calculation"><legend className="sr-only">VAT calculation</legend><label><input type="radio" name="supplierVat" checked={form.vatInclusive} onChange={() => set('vatInclusive', true)} />Inclusive</label><label><input type="radio" name="supplierVat" checked={!form.vatInclusive} onChange={() => set('vatInclusive', false)} />Exclusive</label></fieldset>
                {choiceField('taxCode', taxCodes, 'value', { wide: true, labelKey: 'label' })}
              </div></section>
            </div>
          </div>
        </fieldset>
      </div>
      <MasterFooter active={form.isActive} onActive={value => set('isActive', value)} onClose={onClose} busy={editor.busy} label="Save supplier" />
    </form>
  </Modal>;
}

export function SuppliesForm({ record, options, onClose, onSaved }) {
  const editor = useMasterForm(() => ({
    ...textValues(SUPPLIES_TEXT, record),
    productId: record?.productId ?? '',
    offices: (record?.offices || []).map(row => ({ name: row.name })),
    minimumStock: record?.minimumStock ?? 0,
    thickness: record?.thickness ?? 0,
    netWeight: record?.netWeight ?? 0,
    inventorySetup: record?.inventorySetup || '',
    inventorySchedules: (record?.inventorySchedules || []).map(row => ({ scheduleDate: dateInput(row.scheduleDate), month: row.month || '' })),
    suppliers: (record?.suppliers || []).map(row => ({ ...row })),
    isActive: record?.isActive !== false,
  }), SUPPLIES_TEXT);
  const [tab, setTab] = useState('basic');
  const { form, setForm, set, props, errorFor, textField, choiceField, numberField } = editor;
  const officeNames = [...new Set(['TLP COMPANY', ...(options.supplies || []).flatMap(row => (row.offices || []).map(office => office.name)), ...form.offices.map(row => row.name)])].filter(Boolean);

  useEffect(() => {
    if (!editor.focusTarget) return;
    focusModalControl(editor.controls.current[editor.focusTarget]);
    editor.setFocusTarget(null);
  }, [tab, editor.focusTarget]);

  function updateRow(collection, index, key, value) {
    setForm(current => ({ ...current, [collection]: current[collection].map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
    editor.setErrors(current => {
      const next = { ...current };
      delete next[collection + '.' + index + '.' + key];
      return next;
    });
  }

  function removeRow(collection, index) {
    set(collection, form[collection].filter((_, rowIndex) => rowIndex !== index));
    editor.setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(collection + '.'))));
  }

  async function submit(event) {
    event.preventDefault();
    if (editor.busy) return;
    const invalid = textErrors(SUPPLIES_TEXT, form);
    for (const key of ['minimumStock', 'thickness', 'netWeight']) {
      if (!validNumber(form[key], 6)) invalid[key] = 'Enter a value from 0 to 1,000,000,000 with up to 6 decimal places.';
    }
    const seenSuppliers = new Set();
    form.suppliers.forEach((row, index) => {
      const key = 'suppliers.' + index;
      if (!row.supplierId) invalid[key + '.supplierId'] = 'Select a supplier.';
      else if (seenSuppliers.has(Number(row.supplierId))) invalid[key + '.supplierId'] = 'Use one row per supplier.';
      seenSuppliers.add(Number(row.supplierId));
      if (!validNumber(row.moq, 6)) invalid[key + '.moq'] = 'Enter a valid MOQ with up to 6 decimal places.';
      if (!validNumber(row.price, 6)) invalid[key + '.price'] = 'Enter a valid Price with up to 6 decimal places.';
      if ((row.remarks || '').length > 2000) invalid[key + '.remarks'] = 'Use 2,000 characters or fewer.';
    });
    form.inventorySchedules.forEach((row, index) => {
      const key = 'inventorySchedules.' + index;
      if (row.scheduleDate && !validDate(row.scheduleDate)) invalid[key + '.scheduleDate'] = 'Enter a valid Sched date.';
      if ((row.month || '').length > 40) invalid[key + '.month'] = 'Use 40 characters or fewer.';
    });
    editor.setErrors(invalid);
    editor.setError('');
    const first = Object.keys(invalid)[0];
    if (first) {
      setTab(first.startsWith('inventory') ? 'inventory' : 'basic');
      editor.focus(first);
      editor.setError('Please correct the highlighted fields before saving.');
      return;
    }
    const body = Object.fromEntries(Object.keys(SUPPLIES_TEXT).map(key => [key, String(form[key]).trim()]));
    Object.assign(body, {
      productId: form.productId === '' ? null : Number(form.productId),
      offices: form.offices.map(row => ({ name: row.name })),
      minimumStock: Number(form.minimumStock), thickness: Number(form.thickness), netWeight: Number(form.netWeight),
      inventorySetup: form.inventorySetup,
      inventorySchedules: form.inventorySchedules.map(row => ({ scheduleDate: row.scheduleDate || null, month: (row.month || '').trim() })),
      suppliers: form.suppliers.map(row => ({ supplierId: Number(row.supplierId), moq: Number(row.moq), price: Number(row.price), currency: row.currency || '', remarks: (row.remarks || '').trim() })),
      isActive: form.isActive,
    });
    editor.setBusy(true);
    try {
      const result = await api('/supplies' + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body });
      onSaved(result);
    } catch (error) {
      editor.setError(error.message);
    } finally {
      editor.setBusy(false);
    }
  }

  return <Modal title={record ? 'Edit supplies' : 'New supplies'} subtitle="Supplies information, supplier pricing, and inventory schedules." className="purchase-master-modal" onClose={onClose} busy={editor.busy}>
    <form onSubmit={submit} noValidate>
      <FormTabs tabs={[{ id: 'basic', title: 'Basic Info' }, { id: 'inventory', title: 'Inventory Sched' }]} active={tab} onChange={setTab} id={editor.id} disabled={editor.busy} />
      <div className="modal-body purchase-form-body"><ErrorNotice message={editor.error} /><fieldset disabled={editor.busy}>
        <div role="tabpanel" id={editor.id + '-panel-basic'} aria-labelledby={editor.id + '-tab-basic'} hidden={tab !== 'basic'}>
          <div className="purchase-master-layout">
            <section className="purchase-section"><h3>Basic Information</h3><div className="purchase-fields">
              <label className="field"><span>Supplies Id</span><input readOnly value={record?.id ?? ''} /></label>
              <label className="field"><span>Product Link</span><select {...props('productId', 'Product Link')} value={form.productId} onChange={event => set('productId', event.target.value)}><option value="">None</option>{form.productId && !(options.products || []).some(row => Number(row.id) === Number(form.productId)) && <option value={form.productId} disabled>Current product</option>}{(options.products || []).map(row => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select></label>
              {textField('maker')}{textField('name', { wide: true })}{textField('description', { wide: true, multiline: true })}{textField('remarks', { wide: true, multiline: true })}
              <fieldset className="purchase-office-list purchase-span-2" aria-label="Office"><legend>Office</legend>{officeNames.map(name => <label className="checkbox" key={name}><input type="checkbox" checked={form.offices.some(row => row.name === name)} onChange={event => set('offices', event.target.checked ? [...form.offices, { name }] : form.offices.filter(row => row.name !== name))} />{name}</label>)}</fieldset>
            </div></section>
            <section className="purchase-section"><h3>Other Information</h3><div className="purchase-fields">
              {numberField('minimumStock', 'Minimum Stock')}{textField('color')}{numberField('thickness', 'Thickness')}
              {choiceField('unit', options.units || [], 'name', { optional: false })}{numberField('netWeight', 'Net Weight')}{choiceField('weightUnit', options.units || [], 'name')}
              {choiceField('category', options.suppliesCategories || [], 'name', { wide: true })}
            </div></section>
            <section className="purchase-section purchase-span-2">
              <div className="purchase-section-heading"><h3>Supplier</h3><button type="button" className="button secondary small" disabled={form.suppliers.length >= 100} onClick={() => set('suppliers', [...form.suppliers, { supplierId: '', moq: 0, price: 0, currency: '', remarks: '' }])}>Add supplier</button></div>
              <div className="table-scroll purchase-entry-table"><table><thead><tr><th>Supplier</th><th>MOQ</th><th>Price</th><th>Curr</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>{form.suppliers.map((row, index) => <tr key={index}>
                <td><select {...props('suppliers.' + index + '.supplierId', 'Supplier ' + (index + 1))} value={row.supplierId} onChange={event => updateRow('suppliers', index, 'supplierId', event.target.value)}><option value="">Select supplier</option>{(options.suppliers || []).map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>{errorFor('suppliers.' + index + '.supplierId')}</td>
                <td><input {...props('suppliers.' + index + '.moq', 'Supplier MOQ ' + (index + 1))} type="number" min={0} max={1e9} step="0.000001" value={row.moq} onChange={event => updateRow('suppliers', index, 'moq', event.target.value)} />{errorFor('suppliers.' + index + '.moq')}</td>
                <td><input {...props('suppliers.' + index + '.price', 'Supplier Price ' + (index + 1))} type="number" min={0} max={1e9} step="0.000001" value={row.price} onChange={event => updateRow('suppliers', index, 'price', event.target.value)} />{errorFor('suppliers.' + index + '.price')}</td>
                <td><select aria-label={'Supplier Curr ' + (index + 1)} value={row.currency || ''} onChange={event => updateRow('suppliers', index, 'currency', event.target.value)}><option value="">None</option>{(options.currencies || []).map(currency => <option key={currency.id} value={currency.code}>{currency.code}</option>)}</select></td>
                <td><textarea {...props('suppliers.' + index + '.remarks', 'Supplier Remarks ' + (index + 1))} rows={2} maxLength={2000} value={row.remarks || ''} onChange={event => updateRow('suppliers', index, 'remarks', event.target.value)} />{errorFor('suppliers.' + index + '.remarks')}</td>
                <td><button type="button" className="icon-button danger-text" aria-label={'Remove supplier ' + (index + 1)} onClick={() => removeRow('suppliers', index)}><Icon name="x" size={16} /></button></td>
              </tr>)}{!form.suppliers.length && <tr><td colSpan={6} className="purchase-empty-rows">No suppliers added.</td></tr>}</tbody></table></div>
            </section>
          </div>
        </div>
        <div role="tabpanel" id={editor.id + '-panel-inventory'} aria-labelledby={editor.id + '-tab-inventory'} hidden={tab !== 'inventory'}>
          <section className="purchase-section"><h3>Inventory Setup</h3>
            <label className="field purchase-inventory-setup"><span>Inventory Setup</span><select {...props('inventorySetup', 'Inventory Setup')} value={form.inventorySetup} onChange={event => set('inventorySetup', event.target.value)}><option value="">None</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></label>
            <div className="purchase-section-heading purchase-schedule-heading"><h3>Schedule</h3><button type="button" className="button secondary small" disabled={form.inventorySchedules.length >= 100} onClick={() => set('inventorySchedules', [...form.inventorySchedules, { scheduleDate: '', month: '' }])}>Add schedule</button></div>
            <div className="table-scroll purchase-entry-table"><table><thead><tr><th>Sched</th><th>Month</th><th>Actions</th></tr></thead><tbody>{form.inventorySchedules.map((row, index) => <tr key={index}>
              <td><input {...props('inventorySchedules.' + index + '.scheduleDate', 'Sched ' + (index + 1))} type="date" value={row.scheduleDate || ''} onChange={event => updateRow('inventorySchedules', index, 'scheduleDate', event.target.value)} />{errorFor('inventorySchedules.' + index + '.scheduleDate')}</td>
              <td><input {...props('inventorySchedules.' + index + '.month', 'Month ' + (index + 1))} maxLength={40} value={row.month || ''} onChange={event => updateRow('inventorySchedules', index, 'month', event.target.value)} />{errorFor('inventorySchedules.' + index + '.month')}</td>
              <td><button type="button" className="icon-button danger-text" aria-label={'Remove schedule ' + (index + 1)} onClick={() => removeRow('inventorySchedules', index)}><Icon name="x" size={16} /></button></td>
            </tr>)}{!form.inventorySchedules.length && <tr><td colSpan={3} className="purchase-empty-rows">No inventory schedules added.</td></tr>}</tbody></table></div>
          </section>
        </div>
      </fieldset></div>
      <MasterFooter active={form.isActive} onActive={value => set('isActive', value)} onClose={onClose} busy={editor.busy} label="Save supplies" />
    </form>
  </Modal>;
}
