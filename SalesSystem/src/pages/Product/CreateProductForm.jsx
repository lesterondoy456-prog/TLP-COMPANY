import React, { useEffect, useId, useRef, useState } from 'react';
import { validateProductForm } from '../../helper/validation.js';
import { api, dateInput } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { ErrorNotice, Modal, RequiredLabel, focusModalControl } from '../../components/UI.jsx';
import '../../styles/product.css';

const TABS = [
  { id: 'basic', title: 'Basic Info' },
  { id: 'customer', title: 'Customer' },
  { id: 'inventory', title: 'Inventory Sched' },
  { id: 'supplies', title: 'Link Supplies' },
];

const TEXT_FIELDS = {
  sku: { label: 'Code', max: 40, required: true },
  revision: { label: 'Rev', max: 30, initial: '0' },
  description: { label: 'Description', max: 1000 },
  unit: { label: 'UOP', max: 30, required: true },
  secondaryUnit: { label: 'UOP2', max: 30 },
  currency: { label: 'Currency', max: 30, required: true },
  model: { label: 'Model', max: 150 },
  category: { label: 'Category', max: 100 },
  planType: { label: 'Plan Type', max: 100 },
  color: { label: 'Color', max: 80 },
  remarks: { label: 'Remarks', max: 2000 },
  tagColor: { label: 'Tag Color', max: 30 },
};

const NUMBER_FIELDS = {
  quantityPerSecondaryUnit: { label: 'Qty per UOP2', places: 6 },
  moq: { label: 'MOQ', places: 6 },
  spq: { label: 'SPQ', places: 6 },
  unitCost: { label: 'Unit Cost', places: 6 },
  price: { label: 'Selling Price', places: 6 },
  divisor: { label: 'Divisor', places: 6 },
  thickness: { label: 'Thickness', places: 6 },
  weight: { label: 'Weight', places: 6 },
};
const ROW_LIMITS = { processes: 100, offices: 50, customerApprovals: 100, inventorySchedules: 100, linkedSupplies: 200 };

function initialValues(record) {
  const text = Object.fromEntries(Object.entries(TEXT_FIELDS).map(([key, field]) => [key, record?.[key] ?? field.initial ?? '']));
  const numbers = Object.fromEntries(Object.keys(NUMBER_FIELDS).map(key => [key, record?.[key] ?? 0]));
  return {
    ...text,
    ...numbers,
    vatMode: record?.vatMode || 'customer',
    productHeaderId: record?.productHeaderId ?? '',
    processes: (record?.processes || []).map(row => ({ name: row.name || '' })),
    offices: (record?.offices || []).map(row => ({ name: row.name || '', selected: true })),
    customerApprovals: (record?.customerApprovals || []).map(row => ({ ...row, approvalDate: dateInput(row.approvalDate), eolDate: dateInput(row.eolDate) })),
    inventorySetup: record?.inventorySetup ?? '',
    inventorySchedules: (record?.inventorySchedules || []).map(row => ({ ...row, scheduleDate: dateInput(row.scheduleDate), month: row.month || '' })),
    linkedSupplies: (record?.linkedSupplies || []).map(row => ({ ...row })),
    isActive: record?.isActive !== false,
  };
}

export default function CreateProductForm({ record, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialValues(record));
  const [tab, setTab] = useState('basic');
  const [options, setOptions] = useState({});
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [lookupError, setLookupError] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);
  const controls = useRef({});
  const tabControls = useRef({});
  const formId = useId();

  useEffect(() => {
    let active = true;
    api('/api/sales/product-options')
      .then(result => { if (active) setOptions(result); })
      .catch(error => { if (active && error.status !== 401) setLookupError(error.message); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    focusModalControl(controls.current[focusTarget]);
    setFocusTarget(null);
  }, [tab, focusTarget]);

  const units = (options.units || []).filter(row => row.isActive !== false);
  const currencies = (options.currencies || []).filter(row => row.isActive !== false);
  const categories = (options.categories || []).filter(row => row.isActive !== false);
  const supplies = (options.supplies || []).filter(row => row.isActive !== false);
  const headers = (options.headers || []).filter(row => Number(row.id) !== Number(record?.id));
  const officeNames = [...new Set(['TLP COMPANY', ...(options.offices || []), ...form.offices.map(row => row.name)])].filter(Boolean);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    clearError(key);
  }

  function clearError(key) {
    setErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateRow(collection, index, key, value) {
    setForm(current => ({
      ...current,
      [collection]: current[collection].map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
    clearError(collection + '.' + index + '.' + key);
  }

  function removeRow(collection, index) {
    setForm(current => ({ ...current, [collection]: current[collection].filter((_, rowIndex) => rowIndex !== index) }));
    setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(collection + '.'))));
  }

  function fieldId(key) {
    return formId + '-' + key.replaceAll('.', '-');
  }

  function controlProps(key, label) {
    return {
      id: fieldId(key),
      name: key,
      disabled: busy,
      ref: node => { controls.current[key] = node; },
      'aria-label': label,
      'aria-invalid': Boolean(errors[key]),
      'aria-describedby': errors[key] ? fieldId(key) + '-error' : undefined,
    };
  }

  function fieldError(key) {
    return errors[key] && <small id={fieldId(key) + '-error'} className="product-field-error">{errors[key]}</small>;
  }

  function textField(key, wide = false) {
    const field = TEXT_FIELDS[key];
    const label = field.label + (field.required ? ' *' : '');
    return <label className={'field ' + (wide ? 'product-span-2' : '')} htmlFor={fieldId(key)}>
      <span><RequiredLabel>{label}</RequiredLabel></span>
      <input {...controlProps(key, label)} value={form[key]} maxLength={field.max} aria-required={field.required || undefined} onChange={event => set(key, event.target.value)} />
      {fieldError(key)}
    </label>;
  }

  function numberField(key) {
    const field = NUMBER_FIELDS[key];
    return <label className="field" htmlFor={fieldId(key)}>
      <span>{field.label}</span>
      <input {...controlProps(key, field.label)} type="number" min={0} max={1e9} step={field.places === 2 ? '0.01' : '0.000001'} value={form[key]} onChange={event => set(key, event.target.value)} />
      {fieldError(key)}
    </label>;
  }

  function optionField(key, rows, valueKey, labelKey = valueKey, optional = false) {
    const field = TEXT_FIELDS[key];
    const label = field.label + (field.required ? ' *' : '');
    const historical = form[key] && !rows.some(row => row[valueKey] === form[key]);
    return <label className="field" htmlFor={fieldId(key)}>
      <span><RequiredLabel>{label}</RequiredLabel></span>
      <select {...controlProps(key, label)} value={form[key]} aria-required={field.required || undefined} onChange={event => set(key, event.target.value)}>
        <option value="">{loadingOptions ? 'Loading choices…' : optional ? 'None' : 'Select ' + field.label}</option>
        {historical && <option value={form[key]} disabled>{form[key]} (current)</option>}
        {rows.map(row => <option key={row.id ?? row[valueKey]} value={row[valueKey]}>{row[labelKey]}{row.description && row.description !== row[labelKey] ? ' · ' + row.description : ''}</option>)}
      </select>
      {fieldError(key)}
    </label>;
  }

  function changeTab(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = TABS.findIndex(item => item.id === tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    tabControls.current[TABS[next].id]?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const invalid = validateProductForm(form);
    setErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first) {
      const nextTab = first.startsWith('customerApprovals.') ? 'customer' : first.startsWith('linkedSupplies.') ? 'supplies' : first.startsWith('inventory') ? 'inventory' : 'basic';
      setTab(nextTab);
      setFocusTarget(first);
      setError('Please correct the highlighted fields before saving.');
      return;
    }
    const body = Object.fromEntries(Object.keys(TEXT_FIELDS).map(key => [key, String(form[key]).trim()]));
    for (const key of Object.keys(NUMBER_FIELDS)) body[key] = Number(form[key]);
    body.vatMode = form.vatMode;
    body.productHeaderId = form.productHeaderId === '' ? null : Number(form.productHeaderId);
    body.processes = form.processes.map(row => ({ name: row.name.trim() }));
    body.offices = form.offices.filter(row => row.selected).map(row => ({ name: row.name.trim() }));
    body.customerApprovals = form.customerApprovals.map(row => ({
        customerId: Number(row.customerId),
        approvalDate: row.approvalDate || null,
        eolDate: row.eolDate || null,
        approvalRemarks: (row.approvalRemarks || '').trim(),
        eolRemarks: (row.eolRemarks || '').trim(),
      }));
    body.inventorySetup = form.inventorySetup;
    body.inventorySchedules = form.inventorySchedules.map(row => ({ scheduleDate: row.scheduleDate || null, month: (row.month || '').trim() }));
    body.linkedSupplies = form.linkedSupplies.map(row => ({ suppliesId: Number(row.suppliesId), quantity: Number(row.quantity), unit: row.unit || '' }));
    body.isActive = record ? form.isActive : true;
    setBusy(true);
    try {
      const result = await api(record ? '/api/sales/products/' + record.id : '/api/sales/products', { method: record ? 'PUT' : 'POST', body });
      onSaved(result);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={record ? 'Edit product' : 'New product'} subtitle="Product information, customer approvals, inventory schedules, and linked supplies." className="product-modal" onClose={onClose} busy={busy}>
    <form className="product-form" onSubmit={submit} noValidate>
      <div className="product-tabs" role="tablist" aria-label="Product details" onKeyDown={changeTab}>
        {TABS.map(item => <button key={item.id} ref={node => { tabControls.current[item.id] = node; }} id={formId + '-tab-' + item.id} type="button" role="tab" aria-selected={tab === item.id} aria-controls={formId + '-panel-' + item.id} tabIndex={tab === item.id ? 0 : -1} disabled={busy} onClick={() => setTab(item.id)}>{item.title}</button>)}
      </div>
      <div className="modal-body product-form-body">
        <ErrorNotice message={error} />
        <ErrorNotice message={lookupError} />
        <fieldset disabled={busy}>
          <div role="tabpanel" id={formId + '-panel-basic'} aria-labelledby={formId + '-tab-basic'} hidden={tab !== 'basic'}>
            <div className="product-basic-layout">
              <section className="product-section">
                <h3>Basic Information</h3>
                <div className="product-fields">
                  <label className="field"><span>Product Id</span><input value={record?.id ?? ''} readOnly /></label>
                  {textField('sku')}
                  {textField('revision')}
                  <label className="field product-span-2" htmlFor={fieldId('description')}><span>Description</span><textarea {...controlProps('description', 'Description')} rows={3} maxLength={1000} value={form.description} onChange={event => set('description', event.target.value)} />{fieldError('description')}</label>
                  {optionField('unit', units, 'name')}
                  {optionField('secondaryUnit', units, 'name', 'name', true)}
                  {numberField('quantityPerSecondaryUnit')}
                  {numberField('moq')}
                  {numberField('spq')}
                  <fieldset className="product-radio-group product-span-2" aria-label="VAT"><legend>VAT</legend>{[['customer', 'Customer Setting'], ['inclusive', 'Inclusive'], ['exclusive', 'Exclusive']].map(([value, label]) => <label className="product-radio" key={value}><input type="radio" name="productVatMode" checked={form.vatMode === value} onChange={() => set('vatMode', value)} />{label}</label>)}</fieldset>
                  {numberField('unitCost')}
                  {numberField('price')}
                  {optionField('currency', currencies, 'code')}
                </div>
              </section>
              <section className="product-section">
                <h3>Other Information</h3>
                <div className="product-fields">
                  {textField('model')}
                  {optionField('category', categories, 'name', 'name', true)}
                  {textField('planType')}
                  {textField('color')}
                  {numberField('divisor')}
                  {numberField('thickness')}
                  {numberField('weight')}
                  <label className="field" htmlFor={fieldId('productHeaderId')}><span>Product Header</span><select {...controlProps('productHeaderId', 'Product Header')} value={form.productHeaderId} onChange={event => set('productHeaderId', event.target.value)}><option value="">None</option>{form.productHeaderId && !headers.some(row => Number(row.id) === Number(form.productHeaderId)) && <option value={form.productHeaderId} disabled>Current product header</option>}{headers.map(row => <option key={row.id} value={row.id}>{row.sku} · {row.name || row.description}</option>)}</select>{fieldError('productHeaderId')}</label>
                  {textField('tagColor')}
                  <label className="field product-span-2" htmlFor={fieldId('remarks')}><span>Remarks</span><textarea {...controlProps('remarks', 'Remarks')} rows={3} maxLength={2000} value={form.remarks} onChange={event => set('remarks', event.target.value)} />{fieldError('remarks')}</label>
                </div>
              </section>
              <section className="product-section">
                <div className="product-section-heading"><h3>Process</h3><button type="button" className="button secondary small" disabled={form.processes.length >= ROW_LIMITS.processes} onClick={() => set('processes', [...form.processes, { name: '' }])}>Add process</button></div>
                <div className="product-simple-grid">
                  {form.processes.map((row, index) => <div key={index}><label className="field" htmlFor={fieldId('processes.' + index + '.name')}><span className="sr-only">Process {index + 1}</span><input {...controlProps('processes.' + index + '.name', 'Process ' + (index + 1))} maxLength={150} list={formId + '-process-options'} value={row.name} onChange={event => updateRow('processes', index, 'name', event.target.value)} />{fieldError('processes.' + index + '.name')}</label><button type="button" className="icon-button danger-text" aria-label={'Remove process ' + (index + 1)} onClick={() => removeRow('processes', index)}><Icon name="x" size={16} /></button></div>)}
                  {!form.processes.length && <p className="product-empty-rows">No processes added.</p>}
                </div>
                <datalist id={formId + '-process-options'}>{(options.processes || []).map(name => <option key={name} value={name} />)}</datalist>
              </section>
              <section className="product-section">
                <h3>Office</h3>
                <div className="product-office-grid">{officeNames.map(name => <label className="checkbox" key={name}><input type="checkbox" checked={form.offices.some(row => row.name === name && row.selected)} disabled={!form.offices.some(row => row.name === name && row.selected) && form.offices.length >= ROW_LIMITS.offices} onChange={event => set('offices', event.target.checked ? [...form.offices.filter(row => row.name !== name), { name, selected: true }] : form.offices.filter(row => row.name !== name))} />{name}</label>)}</div>
              </section>
            </div>
          </div>
          <div role="tabpanel" id={formId + '-panel-customer'} aria-labelledby={formId + '-tab-customer'} hidden={tab !== 'customer'}>
            <div className="product-tab-heading"><div><h3>Customer</h3><p>Record customer approval and end-of-life details.</p></div><button type="button" className="button secondary small" disabled={form.customerApprovals.length >= ROW_LIMITS.customerApprovals} onClick={() => set('customerApprovals', [...form.customerApprovals, { customerId: '', approvalDate: '', eolDate: '', approvalRemarks: '', eolRemarks: '' }])}>Add customer</button></div>
            <div className="product-row-cards">{form.customerApprovals.map((row, index) => <section className="product-section" key={index}>
              <div className="product-section-heading"><h3>Customer {index + 1}</h3><button type="button" className="icon-button danger-text" aria-label={'Remove customer approval ' + (index + 1)} onClick={() => removeRow('customerApprovals', index)}><Icon name="x" size={16} /></button></div>
              <div className="product-fields">
                <label className="field product-span-2"><span>Customer Name</span><select {...controlProps('customerApprovals.' + index + '.customerId', 'Customer Name ' + (index + 1))} value={row.customerId} onChange={event => updateRow('customerApprovals', index, 'customerId', event.target.value)}><option value="">Select a customer</option>{(options.customers || []).map(customer => <option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>)}</select>{fieldError('customerApprovals.' + index + '.customerId')}</label>
                <label className="field"><span>Approval Date</span><input {...controlProps('customerApprovals.' + index + '.approvalDate', 'Approval Date ' + (index + 1))} type="date" value={row.approvalDate || ''} onChange={event => updateRow('customerApprovals', index, 'approvalDate', event.target.value)} />{fieldError('customerApprovals.' + index + '.approvalDate')}</label>
                <label className="field"><span>EOL Date</span><input {...controlProps('customerApprovals.' + index + '.eolDate', 'EOL Date ' + (index + 1))} type="date" value={row.eolDate || ''} onChange={event => updateRow('customerApprovals', index, 'eolDate', event.target.value)} />{fieldError('customerApprovals.' + index + '.eolDate')}</label>
                <label className="field"><span>Approval Remarks</span><textarea {...controlProps('customerApprovals.' + index + '.approvalRemarks', 'Approval Remarks ' + (index + 1))} rows={3} maxLength={2000} value={row.approvalRemarks || ''} onChange={event => updateRow('customerApprovals', index, 'approvalRemarks', event.target.value)} />{fieldError('customerApprovals.' + index + '.approvalRemarks')}</label>
                <label className="field"><span>EOL Remarks</span><textarea {...controlProps('customerApprovals.' + index + '.eolRemarks', 'EOL Remarks ' + (index + 1))} rows={3} maxLength={2000} value={row.eolRemarks || ''} onChange={event => updateRow('customerApprovals', index, 'eolRemarks', event.target.value)} />{fieldError('customerApprovals.' + index + '.eolRemarks')}</label>
              </div>
            </section>)}{!form.customerApprovals.length && <div className="product-empty-panel">No customer approvals added.</div>}</div>
          </div>
          <div role="tabpanel" id={formId + '-panel-inventory'} aria-labelledby={formId + '-tab-inventory'} hidden={tab !== 'inventory'}>
            <section className="product-section">
              <h3>Inventory Setup</h3>
              <label className="field product-inventory-setup" htmlFor={fieldId('inventorySetup')}><span>Inventory Setup</span><select {...controlProps('inventorySetup', 'Inventory Setup')} value={form.inventorySetup} onChange={event => set('inventorySetup', event.target.value)}><option value="">None</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></label>
              <div className="product-section-heading product-schedule-heading"><h3>Schedule</h3><button type="button" className="button secondary small" disabled={form.inventorySchedules.length >= ROW_LIMITS.inventorySchedules} onClick={() => set('inventorySchedules', [...form.inventorySchedules, { scheduleDate: '', month: '' }])}>Add schedule</button></div>
              <div className="table-scroll product-line-table"><table><thead><tr><th>Sched</th><th>Month</th><th>Actions</th></tr></thead><tbody>{form.inventorySchedules.map((row, index) => <tr key={index}>
                <td><input {...controlProps('inventorySchedules.' + index + '.scheduleDate', 'Sched ' + (index + 1))} type="date" value={row.scheduleDate || ''} onChange={event => updateRow('inventorySchedules', index, 'scheduleDate', event.target.value)} />{fieldError('inventorySchedules.' + index + '.scheduleDate')}</td>
                <td><input {...controlProps('inventorySchedules.' + index + '.month', 'Month ' + (index + 1))} value={row.month || ''} maxLength={40} onChange={event => updateRow('inventorySchedules', index, 'month', event.target.value)} />{fieldError('inventorySchedules.' + index + '.month')}</td>
                <td><button type="button" className="icon-button danger-text" aria-label={'Remove schedule ' + (index + 1)} onClick={() => removeRow('inventorySchedules', index)}><Icon name="x" size={16} /></button></td>
              </tr>)}{!form.inventorySchedules.length && <tr><td colSpan={3} className="product-empty-rows">No inventory schedules added.</td></tr>}</tbody></table></div>
            </section>
          </div>
          <div role="tabpanel" id={formId + '-panel-supplies'} aria-labelledby={formId + '-tab-supplies'} hidden={tab !== 'supplies'}>
            <div className="product-tab-heading"><div><h3>Link Supplies</h3><p>Choose the supplies linked to this product.</p></div><button type="button" className="button secondary small" disabled={form.linkedSupplies.length >= ROW_LIMITS.linkedSupplies} onClick={() => set('linkedSupplies', [...form.linkedSupplies, { suppliesId: '', quantity: 1, unit: '' }])}>Add supply</button></div>
            <div className="table-scroll product-line-table"><table><thead><tr><th>Supplies Name</th><th>Supplies Description</th><th>Qty</th><th>UOM</th><th>Actions</th></tr></thead><tbody>{form.linkedSupplies.map((row, index) => {
              const supply = supplies.find(item => Number(item.id) === Number(row.suppliesId));
              return <tr key={index}>
                <td><select {...controlProps('linkedSupplies.' + index + '.suppliesId', 'Supplies Name ' + (index + 1))} value={row.suppliesId} onChange={event => {
                  const selected = supplies.find(item => Number(item.id) === Number(event.target.value));
                  setForm(current => ({ ...current, linkedSupplies: current.linkedSupplies.map((item, rowIndex) => rowIndex === index ? { ...item, suppliesId: event.target.value, unit: selected?.unit || '' } : item) }));
                  clearError('linkedSupplies.' + index + '.suppliesId');
                }}><option value="">Select a supply</option>{supplies.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>{fieldError('linkedSupplies.' + index + '.suppliesId')}</td>
                <td>{supply?.description || '—'}</td>
                <td><input {...controlProps('linkedSupplies.' + index + '.quantity', 'Supply Qty ' + (index + 1))} type="number" min="0.000001" max={1e9} step="0.000001" value={row.quantity} onChange={event => updateRow('linkedSupplies', index, 'quantity', event.target.value)} />{fieldError('linkedSupplies.' + index + '.quantity')}</td>
                <td><input aria-label={'Supply UOM ' + (index + 1)} value={supply?.unit || row.unit || ''} readOnly /></td>
                <td><button type="button" className="icon-button danger-text" aria-label={'Remove supply ' + (index + 1)} onClick={() => removeRow('linkedSupplies', index)}><Icon name="x" size={16} /></button></td>
              </tr>;
            })}{!form.linkedSupplies.length && <tr><td colSpan={5} className="product-empty-rows">No supplies linked.</td></tr>}</tbody></table></div>
          </div>
        </fieldset>
      </div>
      <div className="modal-footer product-form-footer" style={record ? undefined : { justifyContent: 'flex-end' }}>{record && <label className="checkbox"><input type="checkbox" checked={form.isActive} disabled={busy} onChange={event => set('isActive', event.target.checked)} />Active product</label>}<div><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}<Icon name="check" size={17} /></button></div></div>
    </form>
  </Modal>;
}
