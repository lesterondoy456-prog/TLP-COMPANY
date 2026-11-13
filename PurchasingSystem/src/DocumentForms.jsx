import React, { useEffect, useId, useRef, useState } from 'react';
import { api, dateInput, dateLabel, today } from '../../SalesSystem/src/api.js';
import { Badge, ErrorNotice, Modal, focusModalControl } from '../../SalesSystem/src/components/UI.jsx';
import { Icon } from '../../SalesSystem/src/components/Icons.jsx';
import { calculateTotals, decimalString, decimalUnits, validDecimal } from './purchaseMath.js';

export const documentTitle = kind => ({ 'purchase-requests': 'Purchase Request', 'purchase-orders': 'Purchase Order', receivings: 'Receiving Receipt' })[kind];
export const statusLabel = status => ({ draft: 'Not Yet Posted', posted: 'Posted', closed: 'Closed', cancelled: 'Cancelled' })[status] || status;
export const quantityLabel = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 }).format(Number(value) || 0);

export function currencyLabel(value, currency = 'PHP', places = 2) {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency, minimumFractionDigits: places, maximumFractionDigits: places }).format(Number(value) || 0);
  } catch {
    return new Intl.NumberFormat('en-PH', { minimumFractionDigits: places, maximumFractionDigits: places }).format(Number(value) || 0) + (currency ? ' ' + currency : '');
  }
}

function dateValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}

function useDocumentEditor(initial) {
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

  async function save(path, record, body, onSaved) {
    setBusy(true);
    setError('');
    try {
      const result = await api('/' + path + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body });
      onSaved(result);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
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

  return { form, setForm, set, updateItem, errors, setErrors, error, setError, busy, focusTarget, setFocusTarget, controls, id, props, feedback, input, choice, save, reject };
}

function ReadonlyField({ label, value, wide = false }) {
  return <label className={'field ' + (wide ? 'purchase-span-2' : '')}><span>{label}</span><input value={value ?? ''} readOnly /></label>;
}

function EntryFooter({ onClose, busy, label }) {
  return <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : label}<Icon name="check" size={17} /></button></div>;
}

function ActorField({ label, name }) {
  return <label className="field"><span>{label}</span><select disabled value={name || ''}><option value={name || ''}>{name || ''}</option></select></label>;
}

function Totals({ totals, currency, places = 2 }) {
  return <div className="purchase-totals">
    {[['grossAmount', 'Gross Amt'], ['discountAmount', 'Disc. Amt'], ['vatAmount', 'Vat Amt'], ['netAmount', 'Net Amount'], ['amount', 'Amount']].map(([key, label]) => <ReadonlyField key={key} label={label} value={currencyLabel(totals[key], currency, places)} />)}
  </div>;
}

function sourceItems(documents, allowedStatuses) {
  return documents.filter(record => allowedStatuses.includes(record.status)).flatMap(record => (record.items || []).map(item => ({ ...item, sourceNumber: record.number, sourceId: record.id })));
}

export function PurchaseRequestForm({ record, options, user, onClose, onSaved }) {
  const editor = useDocumentEditor(() => ({
    number: record?.number || '', prDate: dateInput(record?.prDate) || today(), neededDate: dateInput(record?.neededDate) || today(),
    requestedBy: record?.requestedBy || '', requestedDept: record?.requestedDept || '', checkedBy: record?.checkedBy || '',
    approvedBy: record?.approvedBy || '', approvedBy2: record?.approvedBy2 || '', remarks: record?.remarks || '',
    items: record?.items?.map(row => ({ ...row, neededDate: dateInput(row.neededDate) })) || [{ suppliesId: '', quantity: 1, unit: '', neededDate: today(), remarks: '' }],
  }));
  const { form, input, props, feedback } = editor;
  const supplies = options.supplies || [];

  useEffect(() => {
    if (!editor.focusTarget) return;
    focusModalControl(editor.controls.current[editor.focusTarget]);
    editor.setFocusTarget(null);
  }, [editor.focusTarget]);

  async function submit(event) {
    event.preventDefault();
    if (editor.busy) return;
    const invalid = {};
    for (const key of ['prDate', 'neededDate']) if (!dateValid(form[key])) invalid[key] = 'Enter a valid date.';
    if (form.number.length > 40) invalid.number = 'Use 40 characters or fewer.';
    for (const key of ['requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2']) if (form[key].length > 150) invalid[key] = 'Use 150 characters or fewer.';
    if (form.remarks.length > 2000) invalid.remarks = 'Use 2,000 characters or fewer.';
    if (!form.items.length || form.items.length > 100) invalid.items = 'Add between 1 and 100 supply lines.';
    form.items.forEach((row, index) => {
      const key = 'items.' + index;
      if (!row.suppliesId) invalid[key + '.suppliesId'] = 'Select a supply.';
      if (!validDecimal(row.quantity, 6, { positive: true })) invalid[key + '.quantity'] = 'Enter a positive quantity with up to 6 decimal places.';
      if (row.neededDate && !dateValid(row.neededDate)) invalid[key + '.neededDate'] = 'Enter a valid Needed Date.';
      if ((row.remarks || '').length > 2000) invalid[key + '.remarks'] = 'Use 2,000 characters or fewer.';
    });
    if (editor.reject(invalid)) return;
    const body = { ...form, number: form.number.trim(), remarks: form.remarks.trim(), items: form.items.map(row => ({ suppliesId: Number(row.suppliesId), quantity: String(row.quantity), unit: row.unit, neededDate: row.neededDate || form.neededDate, remarks: (row.remarks || '').trim() })) };
    await editor.save('purchase-requests', record, body, onSaved);
  }

  return <Modal title={record ? 'Edit purchase request' : 'New purchase request'} subtitle="Prepare a supplies request, then post it from PR Monitoring when it is ready." className="purchase-document-modal" onClose={onClose} busy={editor.busy}>
    <form onSubmit={submit} noValidate><div className="modal-body purchase-form-body"><ErrorNotice message={editor.error} /><fieldset disabled={editor.busy}>
      <section className="purchase-section"><h3>Purchase Request</h3><div className="purchase-header-grid">
        <ReadonlyField label="Branch" value="TLP COMPANY" />{input('number', 'PR #', { maxLength: 40 })}
        {input('prDate', 'PR Date', { type: 'date', required: true })}{input('neededDate', 'PR Needed Date', { type: 'date', required: true })}
        <ActorField label="Prepared By" name={record?.preparedBy || user.name} />
        {input('requestedBy', 'Requested By', { maxLength: 150, list: editor.id + '-users' })}{input('requestedDept', 'Requested Dept', { maxLength: 150 })}
        {input('checkedBy', 'Checked By', { maxLength: 150, list: editor.id + '-users' })}{input('approvedBy', 'Approved By', { maxLength: 150, list: editor.id + '-users' })}{input('approvedBy2', 'Approved By (2nd)', { maxLength: 150, list: editor.id + '-users' })}
        <ReadonlyField label="Status" value={statusLabel(record?.status || 'draft')} />
      </div>{input('remarks', 'Remarks', { maxLength: 2000, multiline: true, wide: true })}
      <datalist id={editor.id + '-users'}>{(options.users || []).map(account => <option key={account.id} value={account.name} label={account.username} />)}</datalist></section>
      <section className="purchase-section"><div className="purchase-section-heading"><h3>Supplies</h3><button type="button" className="button secondary small" disabled={form.items.length >= 100} onClick={() => editor.set('items', [...form.items, { suppliesId: '', quantity: 1, unit: '', neededDate: form.neededDate, remarks: '' }])}>Add supply line</button></div>{feedback('items')}
        <div className="table-scroll purchase-entry-table purchase-wide-lines"><table><thead><tr><th>Sort</th><th>Supplies Id</th><th>Supplies Code</th><th>Description</th><th>Qty</th><th>UOM</th><th>Needed Date</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>{form.items.map((row, index) => {
          const supply = supplies.find(item => Number(item.id) === Number(row.suppliesId));
          return <tr key={index}>
            <td>{index + 1}</td><td>{row.suppliesId || '—'}</td>
            <td><select {...props('items.' + index + '.suppliesId', 'Supplies ' + (index + 1))} value={row.suppliesId} onChange={event => {
              const selected = supplies.find(item => Number(item.id) === Number(event.target.value));
              editor.updateItem(index, 'suppliesId', event.target.value);
              editor.updateItem(index, 'unit', selected?.unit || '');
            }}><option value="">Select supply</option>{supplies.map(supply => <option key={supply.id} value={supply.id}>{supply.code} · {supply.name}</option>)}</select>{feedback('items.' + index + '.suppliesId')}</td>
            <td>{supply?.description || row.description || '—'}</td>
            <td><input {...props('items.' + index + '.quantity', 'PR Qty ' + (index + 1))} type="number" min="0.000001" max={1e9} step="0.000001" value={row.quantity} onChange={event => editor.updateItem(index, 'quantity', event.target.value)} />{feedback('items.' + index + '.quantity')}</td>
            <td><input aria-label={'PR UOM ' + (index + 1)} value={supply?.unit || row.unit || ''} readOnly /></td>
            <td><input {...props('items.' + index + '.neededDate', 'Needed Date ' + (index + 1))} type="date" value={row.neededDate || ''} onChange={event => editor.updateItem(index, 'neededDate', event.target.value)} />{feedback('items.' + index + '.neededDate')}</td>
            <td><textarea {...props('items.' + index + '.remarks', 'PR Line Remarks ' + (index + 1))} rows={2} maxLength={2000} value={row.remarks || ''} onChange={event => editor.updateItem(index, 'remarks', event.target.value)} />{feedback('items.' + index + '.remarks')}</td>
            <td><button type="button" className="icon-button danger-text" aria-label={'Remove PR line ' + (index + 1)} onClick={() => editor.set('items', form.items.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={16} /></button></td>
          </tr>;
        })}</tbody></table></div>
      </section>
    </fieldset></div><EntryFooter onClose={onClose} busy={editor.busy} label="Save purchase request" /></form>
  </Modal>;
}

export function PurchaseOrderForm({ record, requests, options, user, onClose, onSaved }) {
  const defaultCurrency = (options.currencies || []).find(row => row.isDefault)?.code || '';
  const editor = useDocumentEditor(() => ({
    supplierId: record?.supplierId || '', poDate: dateInput(record?.poDate) || today(), deliveryDate: dateInput(record?.deliveryDate) || today(), currency: record?.currency || defaultCurrency,
    rate: record?.rate ?? 1, paymentTerm: record?.paymentTerm || '', shipment: record?.shipment || '', suppliesCategory: record?.suppliesCategory || '', vatCode: record?.vatCode || '',
    deliveryAddress: record?.deliveryAddress || '', remarks: record?.remarks || '', items: record?.items?.map(row => ({ ...row })) || [],
  }));
  const [showRequests, setShowRequests] = useState(false);
  const [selectedRequests, setSelectedRequests] = useState([]);
  const { form, props, input, choice, feedback } = editor;
  const supplier = (options.suppliers || []).find(row => Number(row.id) === Number(form.supplierId));
  const allRequests = sourceItems(requests, ['posted', 'closed']);
  const openRequests = allRequests.filter(row => Number(row.balanceQuantity) > 0 && !form.items.some(item => Number(item.requestItemId) === Number(row.id)));
  const vat = (options.vatCodes || []).find(row => (row.code || row.name) === form.vatCode);
  const calculation = { vatRate: vat?.rate || 0, vatInclusive: supplier?.vatInclusive === true, decimalInPrice: supplier?.decimalInPrice ?? 2, decimalInTotalPrice: supplier?.decimalInTotalPrice ?? 2 };
  const totals = calculateTotals(form.items, calculation);
  const paymentChoices = (options.paymentTerms || []).map(row => ({ value: row.description || row.name, label: row.description || row.name }));

  useEffect(() => {
    if (!editor.focusTarget) return;
    focusModalControl(editor.controls.current[editor.focusTarget]);
    editor.setFocusTarget(null);
  }, [editor.focusTarget]);

  function loadRequests() {
    const selected = openRequests.filter(row => selectedRequests.includes(Number(row.id)));
    const items = selected.map(row => {
      const supply = (options.supplies || []).find(item => Number(item.id) === Number(row.suppliesId));
      const price = (supply?.suppliers || []).find(item => Number(item.supplierId) === Number(form.supplierId))?.price || 0;
      return { requestItemId: row.id, quantity: row.balanceQuantity, unitPrice: price, discountRate: 0, remarks: '', unit: row.unit };
    });
    editor.set('items', [...form.items, ...items].slice(0, 100));
    setSelectedRequests([]);
    setShowRequests(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (editor.busy) return;
    const invalid = {};
    for (const key of ['supplierId', 'currency', 'paymentTerm', 'shipment', 'vatCode']) if (!form[key]) invalid[key] = 'Select a value for this field.';
    for (const key of ['poDate', 'deliveryDate']) if (!dateValid(form[key])) invalid[key] = 'Enter a valid date.';
    if (form.deliveryDate && form.poDate && form.deliveryDate < form.poDate) invalid.deliveryDate = 'Delivery Date cannot be earlier than PO Date.';
    if (!validDecimal(form.rate, 5, { positive: true })) invalid.rate = 'Enter a positive Rate with up to 5 decimal places.';
    if (!form.items.length || form.items.length > 100) invalid.items = 'Load between 1 and 100 open PR lines.';
    form.items.forEach((row, index) => {
      if (!validDecimal(row.quantity, 6, { positive: true })) invalid['items.' + index + '.quantity'] = 'Enter a positive quantity with up to 6 decimal places.';
      if (!validDecimal(row.unitPrice, 6)) invalid['items.' + index + '.unitPrice'] = 'Enter a nonnegative Price with up to 6 decimal places.';
      if (!validDecimal(row.discountRate, 6, { maximum: 100 })) invalid['items.' + index + '.discountRate'] = 'Discount must be from 0 to 100.';
    });
    if (form.deliveryAddress.length > 500) invalid.deliveryAddress = 'Use 500 characters or fewer.';
    if (form.remarks.length > 2000) invalid.remarks = 'Use 2,000 characters or fewer.';
    if (editor.reject(invalid)) return;
    const body = {
      supplierId: Number(form.supplierId), poDate: form.poDate, deliveryDate: form.deliveryDate, currency: form.currency, rate: String(form.rate), paymentTerm: form.paymentTerm,
      shipment: form.shipment, suppliesCategory: form.suppliesCategory, vatCode: form.vatCode, deliveryAddress: form.deliveryAddress.trim(), remarks: form.remarks.trim(),
      items: form.items.map(row => ({ requestItemId: Number(row.requestItemId), quantity: String(row.quantity), unitPrice: String(row.unitPrice), discountRate: String(row.discountRate || 0), currency: form.currency, unit: row.unit || '', remarks: row.remarks || '' })),
    };
    await editor.save('purchase-orders', record, body, onSaved);
  }

  return <Modal title={record ? 'Edit purchase order' : 'New purchase order'} subtitle="Load posted purchase request lines and prepare the supplier order." className="purchase-document-modal" onClose={onClose} busy={editor.busy}>
    <form onSubmit={submit} noValidate><div className="modal-body purchase-form-body"><ErrorNotice message={editor.error} /><fieldset disabled={editor.busy}>
      <section className="purchase-section"><h3>Purchase Order</h3><div className="purchase-header-grid">
        <ReadonlyField label="Branch *" value="TLP COMPANY" /><ReadonlyField label="PO #" value={record?.number || ''} />
        {choice('supplierId', 'Supplier', (options.suppliers || []).map(row => ({ value: row.id, label: row.name })), { required: true, onChange: value => {
          const selected = (options.suppliers || []).find(row => Number(row.id) === Number(value));
          editor.set('supplierId', value);
          editor.set('paymentTerm', selected?.paymentTerm || '');
          editor.set('vatCode', selected?.vatCode || '');
        } })}
        <ReadonlyField label="Contact Person" value={supplier?.contactPerson || ''} /><ReadonlyField label="Address" value={supplier?.address || ''} />
        {input('poDate', 'PO Date', { type: 'date', required: true })}{input('deliveryDate', 'Delivery Date', { type: 'date', required: true, min: form.poDate })}
        {choice('currency', 'Currency', (options.currencies || []).map(row => ({ value: row.code, label: row.code + (row.description ? ' · ' + row.description : '') })), { required: true })}
        {input('rate', 'Rate', { type: 'number', required: true, min: '0.00001', max: 1e9, step: '0.00001' })}
        {choice('paymentTerm', 'Payment Term', paymentChoices, { required: true })}
        {choice('shipment', 'Shipment', (options.shipments || ['By Air', 'By Land', 'By Boat', 'N/A']).map(value => ({ value, label: value })), { required: true })}
        {choice('suppliesCategory', 'Supplies Category', (options.suppliesCategories || []).map(row => ({ value: row.name, label: row.name })))}
        {choice('vatCode', 'VAT Code', (options.vatCodes || []).map(row => ({ value: row.code || row.name, label: [row.code || row.name, row.description, row.rate != null ? row.rate + '%' : ''].filter(Boolean).join(' · ') })), { required: true })}
        <ReadonlyField label="Re-Prints" value={record?.rePrints ?? record?.reprints ?? ''} /><ReadonlyField label="Status" value={statusLabel(record?.status || 'draft')} />
        <ActorField label="Prepared By" name={record?.preparedBy || user.name} />
      </div><Totals totals={totals} currency={form.currency || 'PHP'} places={calculation.decimalInTotalPrice} /><div className="purchase-fields">{input('deliveryAddress', 'Delivery Address', { maxLength: 500, multiline: true })}{input('remarks', 'Remarks', { maxLength: 2000, multiline: true })}</div></section>
      <section className="purchase-section"><div className="purchase-section-heading"><h3>Order lines</h3><button type="button" className="button secondary small" onClick={() => setShowRequests(show => !show)}>Load Open PR</button></div>{feedback('items')}
        {showRequests && <div className="purchase-source-picker"><h4>Open PR lines</h4>{!openRequests.length ? <p>No posted PR lines have an available balance.</p> : <><div className="table-scroll"><table><thead><tr><th>Select</th><th>PR #</th><th>Supplies Name</th><th>UOP</th><th className="numeric">Balance</th></tr></thead><tbody>{openRequests.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={'Load PR line ' + row.id} checked={selectedRequests.includes(Number(row.id))} onChange={event => setSelectedRequests(current => event.target.checked ? [...current, Number(row.id)] : current.filter(id => id !== Number(row.id)))} /></td><td>{row.sourceNumber}</td><td>{row.suppliesName}</td><td>{row.unit}</td><td className="numeric">{quantityLabel(row.balanceQuantity)}</td></tr>)}</tbody></table></div><button type="button" className="button secondary small" disabled={!selectedRequests.length || form.items.length + selectedRequests.length > 100} onClick={loadRequests}>Load selected PR lines</button></>}</div>}
        <div className="table-scroll purchase-entry-table purchase-financial-lines"><table><thead><tr><th>Sort</th><th>Supplies Id</th><th>Supplies Name</th><th>Supplies Description</th><th>UOP</th><th>Qty</th><th>Price</th><th>Curr</th><th>Gross Amount</th><th>Disc Rate (%)</th><th>Disc Amount</th><th>VAT %</th><th>Net Amount</th><th>Amount</th><th>PR No.</th><th>Actions</th></tr></thead><tbody>{form.items.map((row, index) => {
          const source = allRequests.find(item => Number(item.id) === Number(row.requestItemId)) || row;
          const values = totals.items[index];
          return <tr key={row.requestItemId}>
            <td>{index + 1}</td><td>{source.suppliesId}</td><td>{source.suppliesName}</td><td>{source.description || '—'}</td><td>{source.unit}</td>
            <td><input {...props('items.' + index + '.quantity', 'PO Qty ' + (index + 1))} type="number" min="0.000001" max={1e9} step="0.000001" value={row.quantity} onChange={event => editor.updateItem(index, 'quantity', event.target.value)} />{feedback('items.' + index + '.quantity')}<small className="purchase-quantity-hint">PR balance: {quantityLabel(source.balanceQuantity)}</small></td>
            <td><input {...props('items.' + index + '.unitPrice', 'PO Price ' + (index + 1))} type="number" min={0} max={1e9} step="0.000001" value={row.unitPrice} onChange={event => editor.updateItem(index, 'unitPrice', event.target.value)} />{feedback('items.' + index + '.unitPrice')}</td>
            <td>{form.currency || '—'}</td><td className="numeric">{quantityLabel(values.grossAmount)}</td>
            <td><input {...props('items.' + index + '.discountRate', 'Discount Rate ' + (index + 1))} type="number" min={0} max={100} step="0.000001" value={row.discountRate} onChange={event => editor.updateItem(index, 'discountRate', event.target.value)} />{feedback('items.' + index + '.discountRate')}</td>
            <td className="numeric">{quantityLabel(values.discountAmount)}</td><td className="numeric">{quantityLabel(calculation.vatRate)}</td><td className="numeric">{quantityLabel(values.netAmount)}</td><td className="numeric">{quantityLabel(values.amount)}</td><td>{source.sourceNumber || row.requestNumber}</td>
            <td><button type="button" className="icon-button danger-text" aria-label={'Remove PO line ' + (index + 1)} onClick={() => editor.set('items', form.items.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={16} /></button></td>
          </tr>;
        })}{!form.items.length && <tr><td colSpan={16} className="purchase-empty-rows">Use Load Open PR to select posted request lines.</td></tr>}</tbody></table></div>
      </section>
    </fieldset></div><EntryFooter onClose={onClose} busy={editor.busy} label="Save purchase order" /></form>
  </Modal>;
}

function allocationUnits(item) {
  return (item.allocations || []).reduce((total, row) => {
    try { return total + decimalUnits(row.quantity, 6); } catch { return total; }
  }, 0n);
}

export function ReceivingForm({ record, orders, options, user, onClose, onSaved }) {
  const editor = useDocumentEditor(() => ({
    purchaseOrderId: record?.purchaseOrderId || '',
    srrDate: dateInput(record?.srrDate) || today(), drNumber: record?.drNumber || '', pezaReference: record?.pezaReference || '',
    invoiceNumber: record?.invoiceNumber || '', invoiceDate: dateInput(record?.invoiceDate), rate: record?.rate ?? 1, remarks: record?.remarks || '',
    items: record?.items?.map(row => ({ ...row, allocations: (row.allocations || []).map(allocation => ({ ...allocation, expiryDate: dateInput(allocation.expiryDate), mfgDate: dateInput(allocation.mfgDate), warehouseId: allocation.warehouseId ?? '', locationId: allocation.locationId ?? '' })) })) || [],
  }));
  const [tab, setTab] = useState('info');
  const tabRefs = useRef({});
  const { form, props, input, feedback } = editor;
  const order = orders.find(row => Number(row.id) === Number(form.purchaseOrderId));
  const supplier = (options.suppliers || []).find(row => Number(row.id) === Number(order?.supplierId || record?.supplierId));
  const source = order?.items || [];
  const eligibleOrders = orders.filter(row => ['posted', 'closed'].includes(row.status) && ((row.items || []).some(item => Number(item.balanceQuantity) > 0) || Number(row.id) === Number(record?.purchaseOrderId)));
  const vat = (options.vatCodes || []).find(row => (row.code || row.name) === (order?.vatCode || record?.vatCode));
  const calculation = {
    vatRate: order?.vatRate ?? record?.vatRate ?? vat?.rate ?? 0,
    vatInclusive: order?.vatInclusive ?? record?.vatInclusive ?? supplier?.vatInclusive ?? false,
    decimalInPrice: order?.decimalInPrice ?? record?.decimalInPrice ?? supplier?.decimalInPrice ?? 2,
    decimalInTotalPrice: order?.decimalInTotalPrice ?? record?.decimalInTotalPrice ?? supplier?.decimalInTotalPrice ?? 2,
  };
  const pricedItems = form.items.map(row => {
    const original = source.find(item => Number(item.id) === Number(row.orderItemId)) || row;
    return { ...row, unitPrice: original.unitPrice || row.unitPrice || 0, discountRate: original.discountRate || row.discountRate || 0 };
  });
  const totals = calculateTotals(pricedItems, calculation);
  const currency = order?.currency || record?.currency || '';

  useEffect(() => {
    if (!editor.focusTarget) return;
    focusModalControl(editor.controls.current[editor.focusTarget]);
    editor.setFocusTarget(null);
  }, [tab, editor.focusTarget]);

  function chooseOrder(value) {
    const selected = orders.find(row => Number(row.id) === Number(value));
    const items = (selected?.items || []).filter(row => Number(row.balanceQuantity) > 0).map(row => ({
      orderItemId: row.id, quantity: row.balanceQuantity, unit: row.unit, remarks: '', allocations: [],
    }));
    editor.set('purchaseOrderId', value);
    editor.set('rate', selected?.rate ?? 1);
    editor.set('items', items);
  }

  function updateAllocation(itemIndex, allocationIndex, key, value) {
    editor.setForm(current => ({ ...current, items: current.items.map((item, index) => index === itemIndex ? {
      ...item, allocations: item.allocations.map((row, rowIndex) => rowIndex === allocationIndex ? { ...row, [key]: value } : row),
    } : item) }));
    editor.setErrors(current => {
      const next = { ...current };
      delete next['items.' + itemIndex + '.allocations.' + allocationIndex + '.' + key];
      return next;
    });
  }

  function addAllocation(itemIndex) {
    const item = form.items[itemIndex];
    let remaining = 0n;
    try { remaining = decimalUnits(item.quantity, 6) - allocationUnits(item); } catch { /* An incomplete quantity is validated on Save. */ }
    if (remaining < 0n) remaining = 0n;
    editor.updateItem(itemIndex, 'allocations', [...item.allocations, { quantity: decimalString(remaining, 6), expiryDate: '', mfgDate: '', imLot: '', qcStatus: '', warehouseId: '', locationId: '' }]);
  }

  async function submit(event) {
    event.preventDefault();
    if (editor.busy) return;
    const invalid = {};
    if (!form.purchaseOrderId) invalid.purchaseOrderId = 'Select a posted purchase order.';
    if (!dateValid(form.srrDate)) invalid.srrDate = 'Enter a valid SRR Date.';
    if (!form.invoiceNumber.trim()) invalid.invoiceNumber = 'SI # is required.';
    for (const key of ['drNumber', 'pezaReference', 'invoiceNumber']) if (form[key].length > 80) invalid[key] = 'Use 80 characters or fewer.';
    if (form.invoiceDate && !dateValid(form.invoiceDate)) invalid.invoiceDate = 'Enter a valid SI Date.';
    if (!validDecimal(form.rate, 5, { positive: true })) invalid.rate = 'Enter a positive Rate with up to 5 decimal places.';
    if (form.remarks.length > 2000) invalid.remarks = 'Use 2,000 characters or fewer.';
    if (!form.items.length || form.items.length > 100) invalid.items = 'Select a PO with open lines to receive.';
    form.items.forEach((item, itemIndex) => {
      const key = 'items.' + itemIndex;
      if (!validDecimal(item.quantity, 6, { positive: true })) invalid[key + '.quantity'] = 'Enter a positive receiving quantity with up to 6 decimal places.';
      if (item.allocations.length > 200) invalid[key + '.allocations'] = 'Use no more than 200 allocations.';
      item.allocations.forEach((row, index) => {
        const allocation = key + '.allocations.' + index;
        if (!validDecimal(row.quantity, 6, { positive: true })) invalid[allocation + '.quantity'] = 'Enter a positive allocation quantity with up to 6 decimal places.';
        if (row.expiryDate && !dateValid(row.expiryDate)) invalid[allocation + '.expiryDate'] = 'Enter a valid Exp. Date.';
        if (row.mfgDate && !dateValid(row.mfgDate)) invalid[allocation + '.mfgDate'] = 'Enter a valid MFG Date.';
        if (row.expiryDate && row.mfgDate && row.expiryDate < row.mfgDate) invalid[allocation + '.expiryDate'] = 'Exp. Date cannot be earlier than MFG Date.';
        if ((row.imLot || '').length > 100) invalid[allocation + '.imLot'] = 'Use 100 characters or fewer.';
        if ((row.qcStatus || '').length > 50) invalid[allocation + '.qcStatus'] = 'Use 50 characters or fewer.';
      });
    });
    const first = editor.reject(invalid);
    if (first) {
      setTab(first.includes('.allocations') ? 'summary' : 'info');
      return;
    }
    const body = {
      purchaseOrderId: Number(form.purchaseOrderId), srrDate: form.srrDate, drNumber: form.drNumber.trim(), pezaReference: form.pezaReference.trim(),
      invoiceNumber: form.invoiceNumber.trim(), invoiceDate: form.invoiceDate || null, rate: String(form.rate), remarks: form.remarks.trim(),
      items: form.items.map(item => ({
        orderItemId: Number(item.orderItemId), quantity: String(item.quantity), unit: item.unit || '', remarks: item.remarks || '',
        allocations: item.allocations.map(row => ({
          quantity: String(row.quantity), expiryDate: row.expiryDate || null, mfgDate: row.mfgDate || null, imLot: (row.imLot || '').trim(), qcStatus: (row.qcStatus || '').trim(),
          warehouseId: row.warehouseId === '' || row.warehouseId == null ? null : Number(row.warehouseId),
          locationId: row.locationId === '' || row.locationId == null ? null : Number(row.locationId),
        })),
      })),
    };
    await editor.save('receivings', record, body, onSaved);
  }

  function tabKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'info' : event.key === 'End' ? 'summary' : tab === 'info' ? 'summary' : 'info';
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return <Modal title={record ? 'Edit receiving receipt' : 'New receiving receipt'} subtitle="Receive posted PO supplies and allocate quantities before posting to warehouse stock." className="purchase-document-modal" onClose={onClose} busy={editor.busy}>
    <form onSubmit={submit} noValidate>
      <div className="purchase-form-tabs" role="tablist" aria-label="Receiving receipt details" onKeyDown={tabKey}>
        {[['info', 'SRR Info'], ['summary', 'SRR Summary']].map(([key, label]) => <button key={key} ref={node => { tabRefs.current[key] = node; }} type="button" role="tab" id={editor.id + '-tab-' + key} aria-controls={editor.id + '-panel-' + key} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} disabled={editor.busy} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <div className="modal-body purchase-form-body"><ErrorNotice message={editor.error} /><fieldset disabled={editor.busy}>
        <div role="tabpanel" id={editor.id + '-panel-info'} aria-labelledby={editor.id + '-tab-info'} hidden={tab !== 'info'}>
          <section className="purchase-section"><h3>Supplies RR</h3><div className="purchase-header-grid">
            <ReadonlyField label="Branch *" value="TLP COMPANY" /><ReadonlyField label="SRR #" value={record?.number || ''} />
            {input('srrDate', 'SRR Date', { type: 'date', required: true })}{input('drNumber', 'DR #', { maxLength: 80 })}
            {editor.choice('purchaseOrderId', 'PO Ref #', eligibleOrders.map(row => ({ value: row.id, label: row.number + ' · ' + row.supplierName })), { onChange: chooseOrder })}
            <ReadonlyField label="Supplier *" value={order?.supplierName || record?.supplierName || ''} /><ReadonlyField label="Address" value={order?.supplierAddress || record?.supplierAddress || supplier?.address || ''} />
            {input('pezaReference', 'PEZA Ref #', { maxLength: 80 })}<ReadonlyField label="Currency *" value={currency} />
            {input('rate', 'Rate', { type: 'number', required: true, min: '0.00001', max: 1e9, step: '0.00001' })}{input('invoiceNumber', 'SI #', { required: true, maxLength: 80 })}{input('invoiceDate', 'SI Date', { type: 'date' })}
            <ReadonlyField label="VAT Code *" value={order?.vatCode || record?.vatCode || ''} /><ReadonlyField label="Re-Prints" value={record?.rePrints ?? record?.reprints ?? ''} />
            <ReadonlyField label="Status" value={statusLabel(record?.status || 'draft')} /><ActorField label="Received By" name={record?.receivedBy || user.name} />
          </div><Totals totals={totals} currency={currency || 'PHP'} places={calculation.decimalInTotalPrice} />{input('remarks', 'Remarks', { multiline: true, maxLength: 2000, wide: true })}</section>
          <section className="purchase-section"><div className="purchase-section-heading"><h3>Receipt lines</h3><button type="button" className="button secondary small" disabled={!form.items.length} onClick={() => setTab('summary')}>Allocate supplies</button></div>{feedback('items')}
            <div className="table-scroll purchase-entry-table purchase-financial-lines"><table><thead><tr><th>Sort</th><th>Supplies Id</th><th>Supplies Name</th><th>Supplies Description</th><th>UOP</th><th>Qty</th><th>Price</th><th>Curr</th><th>Gross Amount</th><th>Disc Rate (%)</th><th>Disc Amount</th><th>VAT %</th><th>Net Amount</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{form.items.map((item, index) => {
              const original = source.find(row => Number(row.id) === Number(item.orderItemId)) || item;
              const values = totals.items[index];
              return <tr key={item.orderItemId}>
                <td>{index + 1}</td><td>{original.suppliesId}</td><td>{original.suppliesName}</td><td>{original.description || '—'}</td><td>{original.unit}</td>
                <td><input {...props('items.' + index + '.quantity', 'Receipt Qty ' + (index + 1))} type="number" min="0.000001" max={1e9} step="0.000001" value={item.quantity} onChange={event => editor.updateItem(index, 'quantity', event.target.value)} />{feedback('items.' + index + '.quantity')}<small className="purchase-quantity-hint">PO balance: {quantityLabel(original.balanceQuantity)}</small></td>
                <td className="numeric">{quantityLabel(original.unitPrice)}</td><td>{currency}</td><td className="numeric">{quantityLabel(values.grossAmount)}</td><td className="numeric">{quantityLabel(original.discountRate)}</td><td className="numeric">{quantityLabel(values.discountAmount)}</td><td className="numeric">{quantityLabel(calculation.vatRate)}</td><td className="numeric">{quantityLabel(values.netAmount)}</td><td className="numeric">{quantityLabel(values.amount)}</td>
                <td><button type="button" className="icon-button danger-text" aria-label={'Remove receipt line ' + (index + 1)} onClick={() => editor.set('items', form.items.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={16} /></button></td>
              </tr>;
            })}{!form.items.length && <tr><td colSpan={15} className="purchase-empty-rows">Select a posted PO to load its open lines.</td></tr>}</tbody></table></div>
          </section>
        </div>
        <div role="tabpanel" id={editor.id + '-panel-summary'} aria-labelledby={editor.id + '-tab-summary'} hidden={tab !== 'summary'}>
          <section className="purchase-section"><h3>SRR Summary</h3><div className="table-scroll purchase-entry-table"><table><thead><tr><th>Supplies Name</th><th>Supplies Description</th><th>Qty</th><th>Balance</th><th>UOP</th><th>SRR Qty</th><th>Allocated Qty</th><th>Balance Qty</th></tr></thead><tbody>{form.items.map((item, index) => {
            const original = source.find(row => Number(row.id) === Number(item.orderItemId)) || item;
            const allocated = Number(allocationUnits(item)) / 1e6;
            const balance = Number(item.quantity || 0) - allocated;
            return <tr key={item.orderItemId}><td>{original.suppliesName}</td><td>{original.description || '—'}</td><td>{quantityLabel(original.quantity)}</td><td>{quantityLabel(original.balanceQuantity)}</td><td>{original.unit}</td><td>{quantityLabel(item.quantity)}</td><td>{quantityLabel(allocated)}</td><td className={Math.abs(balance) > 0.0000005 ? 'danger-text' : ''}>{quantityLabel(Math.abs(balance) < 0.0000005 ? 0 : balance)}</td></tr>;
          })}{!form.items.length && <tr><td colSpan={8} className="purchase-empty-rows">Choose a PO in SRR Info before adding allocations.</td></tr>}</tbody></table></div>
          <p className="purchase-allocation-help">Before posting, allocate each receipt quantity in full and choose a Warehouse and Location for every allocation.</p></section>
          {form.items.map((item, itemIndex) => {
            const original = source.find(row => Number(row.id) === Number(item.orderItemId)) || item;
            return <section className="purchase-section" key={item.orderItemId} aria-label={'Allocations for receipt line ' + (itemIndex + 1)}>
              <div className="purchase-section-heading"><h3>{original.suppliesName || 'Receipt line ' + (itemIndex + 1)}</h3><button type="button" className="button secondary small" disabled={item.allocations.length >= 200} onClick={() => addAllocation(itemIndex)}>Add allocation</button></div>
              <div className="table-scroll purchase-entry-table purchase-allocation-table"><table><thead><tr><th>Qty</th><th>Exp. Date</th><th>MFG Date</th><th>IMLot #</th><th>QC Status</th><th>Warehouse</th><th>Location</th><th>Actions</th></tr></thead><tbody>{item.allocations.map((allocation, index) => {
                const key = 'items.' + itemIndex + '.allocations.' + index;
                const suffix = (itemIndex + 1) + '-' + (index + 1);
                return <tr key={index}>
                  <td><input {...props(key + '.quantity', 'Allocation Qty ' + suffix)} type="number" min="0.000001" max={1e9} step="0.000001" value={allocation.quantity} onChange={event => updateAllocation(itemIndex, index, 'quantity', event.target.value)} />{feedback(key + '.quantity')}</td>
                  <td><input {...props(key + '.expiryDate', 'Exp. Date ' + suffix)} type="date" value={allocation.expiryDate || ''} onChange={event => updateAllocation(itemIndex, index, 'expiryDate', event.target.value)} />{feedback(key + '.expiryDate')}</td>
                  <td><input {...props(key + '.mfgDate', 'MFG Date ' + suffix)} type="date" value={allocation.mfgDate || ''} onChange={event => updateAllocation(itemIndex, index, 'mfgDate', event.target.value)} />{feedback(key + '.mfgDate')}</td>
                  <td><input {...props(key + '.imLot', 'IMLot # ' + suffix)} maxLength={100} value={allocation.imLot || ''} onChange={event => updateAllocation(itemIndex, index, 'imLot', event.target.value)} />{feedback(key + '.imLot')}</td>
                  <td><input {...props(key + '.qcStatus', 'QC Status ' + suffix)} maxLength={50} value={allocation.qcStatus || ''} onChange={event => updateAllocation(itemIndex, index, 'qcStatus', event.target.value)} />{feedback(key + '.qcStatus')}</td>
                  <td><select {...props(key + '.warehouseId', 'Warehouse ' + suffix)} value={allocation.warehouseId ?? ''} onChange={event => updateAllocation(itemIndex, index, 'warehouseId', event.target.value)}><option value="">Select warehouse</option>{(options.warehouses || []).map(row => <option key={row.id} value={row.id}>{row.code} · {row.description}</option>)}</select></td>
                  <td><select {...props(key + '.locationId', 'Location ' + suffix)} value={allocation.locationId ?? ''} onChange={event => updateAllocation(itemIndex, index, 'locationId', event.target.value)}><option value="">Select location</option>{(options.locations || []).map(row => <option key={row.id} value={row.id}>{row.code} · {row.description}</option>)}</select></td>
                  <td><button type="button" className="icon-button danger-text" aria-label={'Remove allocation ' + suffix} onClick={() => editor.updateItem(itemIndex, 'allocations', item.allocations.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={16} /></button></td>
                </tr>;
              })}{!item.allocations.length && <tr><td colSpan={8} className="purchase-empty-rows">No allocations added.</td></tr>}</tbody></table></div>
            </section>;
          })}
        </div>
      </fieldset></div><EntryFooter onClose={onClose} busy={editor.busy} label="Save receiving receipt" />
    </form>
  </Modal>;
}

export function PurchasingDocumentView({ kind, record, onClose }) {
  const request = kind === 'purchase-requests';
  const receiving = kind === 'receivings';
  const title = documentTitle(kind);
  const date = record.prDate || record.poDate || record.srrDate;
  return <Modal title={title} subtitle={record.number} className="purchase-document-modal" onClose={onClose}>
    <div className="modal-body document-sheet purchase-print-sheet">
      <div className="document-brand"><div className="brand"><div className="brand-mark">T</div><div><strong>TLP COMPANY</strong><span>PURCHASING</span></div></div><div><h2>{title}</h2><strong>{record.number}</strong></div></div>
      <div className="document-meta"><div><span>{request ? 'Requested by' : 'Supplier'}</span><strong>{request ? record.requestedBy || record.preparedBy : record.supplierName}</strong>{record.supplierAddress && <p>{record.supplierAddress}</p>}{record.deliveryAddress && <p>Delivery: {record.deliveryAddress}</p>}{record.requestedDept && <p>Department: {record.requestedDept}</p>}</div><dl><div><dt>Date</dt><dd>{dateLabel(date)}</dd></div><div><dt>Status</dt><dd><Badge value={record.status}>{statusLabel(record.status)}</Badge></dd></div>{record.neededDate && <div><dt>Needed Date</dt><dd>{dateLabel(record.neededDate)}</dd></div>}{record.deliveryDate && <div><dt>Delivery Date</dt><dd>{dateLabel(record.deliveryDate)}</dd></div>}{record.purchaseOrderNumber && <div><dt>PO Ref #</dt><dd>{record.purchaseOrderNumber}</dd></div>}{record.invoiceNumber && <div><dt>SI #</dt><dd>{record.invoiceNumber}</dd></div>}{record.currency && <div><dt>Currency</dt><dd>{record.currency}</dd></div>}</dl></div>
      <div className="table-scroll"><table className="document-table"><thead><tr><th>Supplies</th><th>UOP</th><th className="numeric">Qty</th>{request ? <><th>Needed Date</th><th>Remarks</th></> : <><th className="numeric">Price</th><th className="numeric">Disc. %</th><th className="numeric">VAT</th><th className="numeric">Amount</th></>}</tr></thead><tbody>{(record.items || []).map((row, index) => <tr key={row.id || index}><td><strong>{row.suppliesName}</strong><small>{row.suppliesCode}</small>{row.description && <small>{row.description}</small>}</td><td>{row.unit}</td><td className="numeric">{quantityLabel(row.quantity)}</td>{request ? <><td>{dateLabel(row.neededDate)}</td><td>{row.remarks || '—'}</td></> : <><td className="numeric">{quantityLabel(row.unitPrice)}</td><td className="numeric">{quantityLabel(row.discountRate)}</td><td className="numeric">{quantityLabel(row.vatAmount)}</td><td className="numeric">{quantityLabel(row.amount)}</td></>}</tr>)}</tbody></table></div>
      {!request && <div className="document-totals">{[['grossAmount', 'Gross amount'], ['discountAmount', 'Discount'], ['netAmount', 'Net amount'], ['vatAmount', 'VAT'], ['amount', 'Total']].map(([key, label]) => <div key={key}><span>{label}</span><strong>{currencyLabel(record[key], record.currency, record.decimalInTotalPrice ?? 2)}</strong></div>)}</div>}
      {receiving && (record.items || []).map((item, index) => <div className="purchase-print-allocations" key={item.id || index}><h3>{item.suppliesName} · Allocations</h3><table className="document-table"><thead><tr><th>Qty</th><th>Warehouse</th><th>Location</th><th>IMLot #</th><th>QC Status</th><th>Exp. Date</th><th>MFG Date</th></tr></thead><tbody>{(item.allocations || []).map((row, rowIndex) => <tr key={row.id || rowIndex}><td>{quantityLabel(row.quantity)}</td><td>{row.warehouseCode || row.warehouseId || '—'}</td><td>{row.locationCode || row.locationId || '—'}</td><td>{row.imLot || '—'}</td><td>{row.qcStatus || '—'}</td><td>{dateLabel(row.expiryDate)}</td><td>{dateLabel(row.mfgDate)}</td></tr>)}</tbody></table></div>)}
      {record.remarks && <div className="document-notes"><strong>Remarks</strong><p>{record.remarks}</p></div>}
      <div className="purchase-print-signatures"><div>Prepared / Received By<strong>{record.preparedBy || record.receivedBy || '—'}</strong></div>{request && <><div>Checked By<strong>{record.checkedBy || '—'}</strong></div><div>Approved By<strong>{record.approvedBy || '—'}</strong></div><div>Approved By (2nd)<strong>{record.approvedBy2 || '—'}</strong></div></>}</div>
      <div className="document-bottom">TLP Company · {record.number}</div>
    </div>
    <div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={() => window.print()}><Icon name="file" size={16} />Print document</button></div>
  </Modal>;
}

export function DocumentActionDialog({ kind, record, action, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const posting = action === 'post';
  let allocationIssue = '';
  if (posting && kind === 'receivings') {
    for (const item of record.items || []) {
      try {
        if (!item.allocations?.length || allocationUnits(item) !== decimalUnits(item.quantity, 6)) allocationIssue = 'Allocate every receipt quantity in full in SRR Summary before posting.';
        if (item.allocations?.some(row => !row.warehouseId || !row.locationId)) allocationIssue = 'Choose a Warehouse and Location for every allocation before posting.';
      } catch {
        allocationIssue = 'Review the receipt quantities and allocations before posting.';
      }
    }
  }
  async function perform() {
    setBusy(true);
    setError('');
    try {
      const result = await api('/' + kind + '/' + record.id + '/' + action, { method: 'POST' });
      onSaved(result);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title={(posting ? 'Post ' : 'Cancel ') + documentTitle(kind).toLowerCase()} subtitle={record.number} onClose={onClose} busy={busy}>
    <div className="modal-body"><ErrorNotice message={error || allocationIssue} /><p className="purchase-action-description">{posting ? kind === 'receivings' ? 'Posting records the allocated quantities in supplies stock and updates the purchase order balance.' : kind === 'purchase-orders' ? 'Posting allocates the selected PR quantities and makes this purchase order available for receiving.' : 'Posting makes this request available for purchase orders.' : 'This document will be marked Cancelled. Its history will remain available.'}</p></div>
    <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>{posting ? 'Review first' : 'Keep document'}</button><button className={'button ' + (posting ? 'primary' : 'danger')} disabled={busy || Boolean(allocationIssue)} onClick={perform}>{busy ? 'Working…' : posting ? 'Confirm post' : 'Confirm cancel'}</button></div>
  </Modal>;
}
