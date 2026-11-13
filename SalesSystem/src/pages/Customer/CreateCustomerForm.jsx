import React, { useEffect, useId, useRef, useState } from 'react';
import { validateCustomerForm, validateCustomerAssignment } from '../../helper/validation.js';
import { api } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { ErrorNotice, Modal, focusModalControl } from '../../components/UI.jsx';

const TEXT_FIELDS = {
  name: { label: 'Name', max: 180, required: true, tab: 'basic' },
  shortName: { label: 'Short Name', max: 80, required: true, tab: 'basic' },
  businessStyle: { label: 'Business Style', max: 180, required: true, tab: 'basic' },
  address: { label: 'Office Address', max: 500, required: true, tab: 'basic' },
  tin: { label: 'TIN', max: 50, tab: 'basic' },
  contactPerson: { label: 'Contact Person', max: 150, tab: 'basic' },
  email: { label: 'Email Address', max: 254, tab: 'basic' },
  countryOfOrigin: { label: 'Country Of Origin', max: 100, tab: 'basic' },
  country: { label: 'Country', max: 100, tab: 'basic' },
  faxNo: { label: 'Fax No.', max: 30, tab: 'basic' },
  cpnumber: { label: 'Phone No.', max: 30, tab: 'basic' },
  category: { label: 'Category', max: 100, tab: 'basic' },
  remarks: { label: 'Remarks', max: 2000, tab: 'basic' },
  salesName: { label: 'Sales Name', max: 180, required: true, tab: 'sales' },
  drName: { label: 'DR Name', max: 180, required: true, tab: 'sales' },
  paymentTerm: { label: 'Payment Term', max: 100, tab: 'sales' },
  vatCode: { label: 'VAT Code', max: 80, required: true, tab: 'sales' },
  taxCode: { label: 'Tax Code', max: 80, tab: 'sales' },
};

function initialValues(record) {
  const text = Object.fromEntries(Object.keys(TEXT_FIELDS).map(key => [key, record?.[key] ?? '']));
  return {
    ...text,
    salesInChargeId: record?.salesInChargeId ?? (record?.salesInCharge ? '__legacy__' : ''),
    deliveryAddresses: Array.isArray(record?.deliveryAddresses) ? [...record.deliveryAddresses] : [],
    decimalInPrice: record?.decimalInPrice ?? 2,
    decimalInTotalPrice: record?.decimalInTotalPrice ?? 2,
    paymentTerm: record?.paymentTerm ?? '',
    salesAddressType: record?.salesAddressType === 'delivery' ? 'delivery' : 'office',
    drAddressType: record?.drAddressType === 'delivery' ? 'delivery' : 'office',
    discount: record?.discount ?? 0,
    discountType: record?.discountType === 'amount' ? 'amount' : 'percent',
    includePoInInvoice: record?.includePoInInvoice === true,
    vatInclusive: record?.vatInclusive === true,
    isActive: record?.isActive !== false,
  };
}

const uniqueOptions = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].sort((a, b) => a.localeCompare(b));
const CAS_VAT_CODES = [
  { code: 'VS', label: 'VS | Vatable Sales | 12.00' },
  { code: 'VE', label: 'VE | Vat-Exempt Sales | 0.00' },
  { code: 'VZ', label: 'VZ | Zero-Rated Sales | 0.00' },
];
const CAS_PAYMENT_TERMS = ['30 DAYS', '65 DAYS', '60 DAYS', '15 DAYS', '90 Days'];
const CAS_CATEGORIES = ['Local Sales', 'Export Sales'];
const CAS_COUNTRIES_OF_ORIGIN = ['PHILIPPINES', 'JAPAN', 'THAILAND', 'HONGKONG', 'INDONESIA'];
const CAS_TAX_CODES = [
  { code: 'WC010', label: 'WC010 | Income payments for professional/talent fees paid to juridical persons (corporations). | 10.00' },
];
const EMPTY_LOOKUPS = {};

export default function CreateCustomerForm({ record, customers = [], lookupOptions = EMPTY_LOOKUPS, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialValues(record));
  const [tab, setTab] = useState('basic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [focusTarget, setFocusTarget] = useState(null);
  const [serverOptions, setServerOptions] = useState({});
  const [lookupError, setLookupError] = useState('');
  const formId = useId();
  const controls = useRef({});
  const tabs = useRef({});
  const salesInChargeOptions = [...new Map((serverOptions.salesInCharges || [])
    .filter(account => account.role === 'sales' && account.isActive !== false && Number.isInteger(Number(account.id)) && Number(account.id) > 0)
    .map(account => [Number(account.id), account])).values()];
  const historicalSalesAccount = record?.salesInChargeId != null && !salesInChargeOptions.some(account => Number(account.id) === Number(record.salesInChargeId));
  const legacySalesAccount = record?.salesInChargeId == null && Boolean(record?.salesInCharge);
  const configuredVatCodes = (serverOptions.vatCodes || []).filter(option => option && typeof option.code === 'string');
  const vatSources = configuredVatCodes.length ? configuredVatCodes : CAS_VAT_CODES;
  const vatOptions = uniqueOptions([...vatSources.map(option => option.code), ...customers.map(customer => customer.vatCode), record?.vatCode, ...(lookupOptions.vatCodes || [])]);
  const taxSources = serverOptions.taxCodes?.length ? serverOptions.taxCodes : CAS_TAX_CODES.map(option => option.code);
  const paymentSources = serverOptions.paymentTerms?.length ? serverOptions.paymentTerms : CAS_PAYMENT_TERMS;
  const categorySources = serverOptions.categories?.length ? serverOptions.categories : CAS_CATEGORIES;
  const originSources = serverOptions.countriesOfOrigin?.length ? serverOptions.countriesOfOrigin : CAS_COUNTRIES_OF_ORIGIN;
  const countrySources = serverOptions.countries?.length ? serverOptions.countries : CAS_COUNTRIES_OF_ORIGIN;
  const taxOptions = uniqueOptions([...taxSources, ...customers.map(customer => customer.taxCode), record?.taxCode, ...(lookupOptions.taxCodes || [])]);
  const paymentOptions = uniqueOptions([...paymentSources, ...customers.map(customer => customer.paymentTerm), record?.paymentTerm, ...(lookupOptions.paymentTerms || [])]);
  const categoryOptions = uniqueOptions([...categorySources, ...customers.map(customer => customer.category), record?.category, ...(lookupOptions.categories || [])]);
  const originOptions = uniqueOptions([...originSources, ...customers.map(customer => customer.countryOfOrigin), record?.countryOfOrigin]);
  const countryOptions = uniqueOptions([...countrySources, ...customers.map(customer => customer.country), record?.country]);

  function vatLabel(code) {
    const configured = configuredVatCodes.find(option => option.code === code);
    if (configured) return [configured.code, configured.description, configured.rate != null ? String(configured.rate) : ''].filter(Boolean).join(' | ');
    return CAS_VAT_CODES.find(option => option.code === code)?.label || code;
  }

  useEffect(() => {
    let active = true;
    api('/api/sales/customer-options').then(result => { if (active) setServerOptions(result); })
      .catch(error => { if (active && error.status !== 401) setLookupError('Account choices could not be loaded. Reopen this form to refresh them; other customer details remain editable.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    const control = controls.current[focusTarget];
    focusModalControl(control);
    setFocusTarget(null);
  }, [tab, focusTarget]);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => { if (!current[key] && !(key === 'discountType' && current.discount)) return current; const next = { ...current }; delete next[key]; if (key === 'discountType') delete next.discount; return next; });
  }

  function fieldId(key) { return formId + '-' + key.replaceAll('.', '-'); }
  function controlProps(key, label) {
    return { id: fieldId(key), name: key, ref: node => { controls.current[key] = node; }, 'aria-label': label, 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? fieldId(key) + '-error' : undefined };
  }
  function fieldError(key) { return errors[key] && <small id={fieldId(key) + '-error'} className="customer-field-error">{errors[key]}</small>; }
  function textField(key, visibleLabel, options = {}) {
    const definition = TEXT_FIELDS[key];
    const label = visibleLabel || definition.label + (definition.required ? ' *' : '');
    return <label className={'field ' + (options.wide ? 'customer-span-2' : '')} htmlFor={fieldId(key)}><span>{label}</span><input {...controlProps(key, options.accessibleLabel || label)} value={form[key]} onChange={event => set(key, event.target.value)} maxLength={definition.max} aria-required={definition.required || undefined} type={options.type || 'text'} list={options.list} autoComplete={options.autoComplete || 'off'} />{fieldError(key)}</label>;
  }
  function textareaField(key, label, rows = 2) {
    return <label className="field customer-span-2" htmlFor={fieldId(key)}><span>{label}</span><textarea {...controlProps(key, label)} value={form[key]} onChange={event => set(key, event.target.value)} rows={rows} maxLength={TEXT_FIELDS[key].max} aria-required={TEXT_FIELDS[key].required || undefined} />{fieldError(key)}</label>;
  }
  function decimalField(key, label) {
    return <label className="field" htmlFor={fieldId(key)}><span>{label} *</span><input {...controlProps(key, label + ' *')} type="number" min={0} max={6} step={1} value={form[key]} onChange={event => set(key, event.target.value)} aria-required="true" />{fieldError(key)}</label>;
  }
  function addressRadios(key, legend) {
    return <fieldset className="customer-radio-group customer-span-2" aria-label={legend}><legend>Address</legend>{[['office', 'Office Address'], ['delivery', 'Delivery Address']].map(([value, label]) => <label className="customer-radio" key={value}><input type="radio" name={key} value={value} checked={form[key] === value} onChange={() => set(key, value)} />{label}</label>)}</fieldset>;
  }
  function deliveryAddress(index, value) {
    const key = 'deliveryAddresses.' + index;
    return <tr key={index}><td className="customer-address-index">{index + 1}</td><td><label className="sr-only" htmlFor={fieldId(key)}>Delivery Address {index + 1}</label><textarea {...controlProps(key, 'Delivery Address ' + (index + 1))} rows={2} maxLength={500} value={value} onChange={event => {
      const addresses = [...form.deliveryAddresses]; addresses[index] = event.target.value; set('deliveryAddresses', addresses);
      setErrors(current => { const next = { ...current }; delete next[key]; return next; });
    }} />{fieldError(key)}</td><td><button type="button" className="icon-button danger-text" aria-label={'Remove delivery address ' + (index + 1)} onClick={() => {
      set('deliveryAddresses', form.deliveryAddresses.filter((_, rowIndex) => rowIndex !== index));
      setErrors(current => Object.fromEntries(Object.entries(current).filter(([errorKey]) => !errorKey.startsWith('deliveryAddresses.'))));
    }}><Icon name="x" size={16} /></button></td></tr>;
  }
  function selectTab(next) { setTab(next); }
  function tabKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'basic' : event.key === 'End' ? 'sales' : tab === 'basic' ? 'sales' : 'basic';
    selectTab(next); tabs.current[next]?.focus();
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const invalid = validateCustomerForm(form);
    const assignmentError = validateCustomerAssignment(form, record, salesInChargeOptions);
    if (assignmentError) invalid.salesInChargeId = assignmentError;
    setErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first) {
      const invalidTab = TEXT_FIELDS[first]?.tab || (first === 'salesInChargeId' || first.startsWith('deliveryAddresses.') ? 'basic' : 'sales');
      setTab(invalidTab); setFocusTarget(first); setError('Please correct the highlighted fields before saving.'); return;
    }
    const body = Object.fromEntries(Object.keys(TEXT_FIELDS).map(key => [key, String(form[key]).trim()]));
    Object.assign(body, {
      deliveryAddresses: form.deliveryAddresses.map(address => address.trim()).filter(Boolean),
      decimalInPrice: Number(form.decimalInPrice), decimalInTotalPrice: Number(form.decimalInTotalPrice),
      salesAddressType: form.salesAddressType, drAddressType: form.drAddressType,
      discount: form.discount === '' ? 0 : Number(form.discount), discountType: form.discountType,
      includePoInInvoice: form.includePoInInvoice, vatInclusive: form.vatInclusive, isActive: form.isActive,
    });
    if (form.salesInChargeId !== '__legacy__') body.salesInChargeId = form.salesInChargeId === '' ? null : Number(form.salesInChargeId);
    setBusy(true);
    try { const result = await api(record ? '/api/sales/customers/' + record.id : '/api/sales/customers', { method: record ? 'PUT' : 'POST', body }); onSaved(result); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return <Modal title={record ? 'Edit customer' : 'New customer'} subtitle="Customer information, sales, delivery receipt, and tax settings." className="customer-modal" onClose={onClose} busy={busy}>
    <form className="customer-form" onSubmit={submit} noValidate>
      <div className="customer-tabs" role="tablist" aria-label="Customer details" onKeyDown={tabKeyDown}>
        {[['basic', 'Basic Info'], ['sales', 'Sales/DR']].map(([key, label]) => <button key={key} ref={node => { tabs.current[key] = node; }} id={formId + '-tab-' + key} type="button" role="tab" aria-selected={tab === key} aria-controls={formId + '-panel-' + key} tabIndex={tab === key ? 0 : -1} disabled={busy} onClick={() => selectTab(key)}>{label}</button>)}
      </div>
      <div className="modal-body customer-form-body"><ErrorNotice message={error} />{lookupError && <div className="notice customer-lookup-notice" role="status">{lookupError}</div>}
        <fieldset disabled={busy}>
          <div role="tabpanel" id={formId + '-panel-basic'} aria-labelledby={formId + '-tab-basic'} hidden={tab !== 'basic'}>
            <div className="customer-basic-layout">
              <section className="customer-section" aria-labelledby={formId + '-basic-heading'}><h3 id={formId + '-basic-heading'}>Basic Information</h3><div className="customer-fields">
                <label className="field customer-span-2" htmlFor={fieldId('salesInChargeId')}><span>Sales In-charge</span><select {...controlProps('salesInChargeId', 'Sales In-charge')} value={form.salesInChargeId} onChange={event => set('salesInChargeId', event.target.value)}><option value="">Select a Sales account</option>{legacySalesAccount && <option value="__legacy__" disabled>{record.salesInCharge} (previous assignment)</option>}{historicalSalesAccount && <option value={record.salesInChargeId} disabled>{record.salesInCharge || 'Previously assigned account'} (unavailable for new assignments)</option>}{salesInChargeOptions.map(account => <option key={account.id} value={account.id}>{account.name}{account.username ? ' (' + account.username + ')' : ''}</option>)}</select>{fieldError('salesInChargeId')}</label>
                {textField('name', 'Name *', { wide: true })}
                {textField('shortName', 'Short Name *')}
                {textField('businessStyle', 'Business Style *')}
              </div></section>
              <section className="customer-section customer-other-section" aria-labelledby={formId + '-other-heading'}><h3 id={formId + '-other-heading'}>Other Information</h3><div className="customer-fields">
                {textField('tin', 'TIN')}{textField('contactPerson', 'Contact Person')}
                {textField('email', 'Email Address', { type: 'email', wide: true, autoComplete: 'email' })}
                {textField('countryOfOrigin', 'Country Of Origin', { list: formId + '-origins' })}<datalist id={formId + '-origins'}>{originOptions.map(country => <option key={country} value={country} />)}</datalist>
                {textField('country', 'Country', { list: formId + '-countries' })}<datalist id={formId + '-countries'}>{countryOptions.map(country => <option key={country} value={country} />)}</datalist>
                {textField('faxNo', 'Fax No.', { type: 'tel' })}{textField('cpnumber', 'Phone No.', { type: 'tel', autoComplete: 'tel' })}
                {textField('category', 'Category', { wide: true, list: formId + '-categories' })}<datalist id={formId + '-categories'}>{categoryOptions.map(category => <option key={category} value={category} />)}</datalist>
                {textareaField('remarks', 'Remarks', 3)}
              </div></section>
              <section className="customer-section customer-address-section" aria-labelledby={formId + '-address-heading'}><h3 id={formId + '-address-heading'}>Address</h3><div className="customer-fields">
                {textareaField('address', 'Office Address *', 3)}
                <div className="customer-span-2"><div className="customer-address-heading"><strong>Delivery Address</strong><button type="button" className="button secondary small" disabled={form.deliveryAddresses.length >= 50} onClick={() => set('deliveryAddresses', [...form.deliveryAddresses, ''])}><span aria-hidden="true">+</span>Add delivery address</button></div>
                  <div className="customer-address-grid"><table><thead><tr><th>#</th><th>Delivery Address</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{form.deliveryAddresses.map((address, index) => deliveryAddress(index, address))}{!form.deliveryAddresses.length && <tr><td colSpan={3} className="customer-no-addresses">No delivery addresses added.</td></tr>}</tbody></table></div>
                </div>
              </div></section>
            </div>
          </div>
          <div role="tabpanel" id={formId + '-panel-sales'} aria-labelledby={formId + '-tab-sales'} hidden={tab !== 'sales'}>
            <div className="customer-sales-layout">
              <section className="customer-section customer-sales-section" aria-labelledby={formId + '-sales-heading'}><h3 id={formId + '-sales-heading'}>Sales</h3><div className="customer-fields">
                {textField('salesName', 'Name *', { wide: true, accessibleLabel: 'Sales Name' })}
                {decimalField('decimalInPrice', 'Decimal in Price')}{decimalField('decimalInTotalPrice', 'Decimal in Total Price')}
                {textField('paymentTerm', 'Payment Term', { wide: true, list: formId + '-payment-terms' })}<datalist id={formId + '-payment-terms'}>{paymentOptions.map(term => <option key={term} value={term} />)}</datalist>
                {addressRadios('salesAddressType', 'Sales Address')}
                <label className="field" htmlFor={fieldId('discount')}><span>Discount</span><input {...controlProps('discount', 'Discount')} type="number" min={0} max={form.discountType === 'percent' ? 100 : 1e9} step="0.000001" value={form.discount} onChange={event => set('discount', event.target.value)} />{fieldError('discount')}</label>
                <label className="field" htmlFor={fieldId('discountType')}><span>Discount Type</span><select id={fieldId('discountType')} value={form.discountType} onChange={event => set('discountType', event.target.value)}><option value="percent">Percent</option><option value="amount">Amount</option></select></label>
                <label className="checkbox customer-span-2"><input type="checkbox" checked={form.includePoInInvoice} onChange={event => set('includePoInInvoice', event.target.checked)} />Include P.O. in Invoice</label>
              </div></section>
              <section className="customer-section" aria-labelledby={formId + '-dr-heading'}><h3 id={formId + '-dr-heading'}>Delivery Receipt</h3><div className="customer-fields">
                {textField('drName', 'Name *', { wide: true, accessibleLabel: 'DR Name' })}
                {addressRadios('drAddressType', 'Delivery Receipt Address')}
              </div></section>
              <section className="customer-section" aria-labelledby={formId + '-tax-heading'}><h3 id={formId + '-tax-heading'}>TAX</h3><div className="customer-fields">
                {textField('vatCode', 'VAT Code *', { wide: true, list: formId + '-vat-codes' })}<datalist id={formId + '-vat-codes'}>{vatOptions.map(code => <option key={code} value={code} label={vatLabel(code)} />)}</datalist>
                <fieldset className="customer-radio-group customer-span-2" aria-label="VAT calculation"><legend className="sr-only">VAT calculation</legend><label className="customer-radio"><input type="radio" name="vatInclusive" checked={form.vatInclusive} onChange={() => set('vatInclusive', true)} />Inclusive</label><label className="customer-radio"><input type="radio" name="vatInclusive" checked={!form.vatInclusive} onChange={() => set('vatInclusive', false)} />Exclusive</label></fieldset>
                {textField('taxCode', 'Tax Code', { wide: true, list: formId + '-tax-codes' })}<datalist id={formId + '-tax-codes'}>{taxOptions.map(code => <option key={code} value={code} label={CAS_TAX_CODES.find(option => option.code === code)?.label || code} />)}</datalist>
              </div></section>
            </div>
          </div>
        </fieldset>
      </div>
      <div className="modal-footer customer-form-footer"><label className="checkbox"><input type="checkbox" checked={form.isActive} disabled={busy} onChange={event => set('isActive', event.target.checked)} />Active customer</label><div><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}<Icon name="check" size={17} /></button></div></div>
    </form>
  </Modal>;
}
