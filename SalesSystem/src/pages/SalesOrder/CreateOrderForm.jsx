import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, today, dateInput } from '../../api.js';
import { calculateSalesOrder } from '../../salesPricing.mjs';
import { calculateEditableSalesOrder, hasSalesInvoice } from '../../salesOrderEdit.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, RequiredLabel, FormFooter, ErrorNotice, focusModalControl } from '../../components/UI.jsx';
import { validateOrderForm } from '../../helper/validation.js';
import useSave from '../../hooks/useSave.js';
import { useRealtimeRefresh } from '../../hooks/useRealtime.js';
import './SalesOrder.css';

export default function CreateOrderForm({ record, customers: initialCustomers, products: initialProducts, user, onClose, onSaved }) {
  // A background list refresh must not replace an open document's draft.
  const [choices] = useState(() => ({ customers: initialCustomers, products: initialProducts }));
  const { customers, products } = choices;
  const [form, setForm] = useState({
    customerId: record?.customerId ?? '', billToCustomerId: record?.billToCustomerId ?? record?.customerId ?? '',
    billToAddress: record?.billToAddress ?? record?.customerAddress ?? '',
    orderDate: dateInput(record?.orderDate) || today(), expectedDeliveryDate: dateInput(record?.expectedDeliveryDate),
    currency: String(record?.currency || '').trim().toUpperCase(), rate: record?.rate ?? '1',
    paymentTerm: record?.paymentTerm ?? '', shipment: record?.shipment ?? '', countryOfOrigin: record?.countryOfOrigin ?? '',
    vatCode: record?.vatCode ?? '', vatInclusive: record?.vatInclusive ?? null,
    discountType: record?.discountType ?? '', discount: record?.discount ?? '',
    notes: record?.notes ?? '', status: record?.status || 'draft',
  });
  const [items, setItems] = useState(record?.items?.map(item => ({
    ...item, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice,
    refNumber: item.refNumber ?? '', quotationNumber: item.quotationNumber ?? '',
    discountRate: item.discountRate ?? '', deliveryDate: dateInput(item.deliveryDate),
  })) || [{ productId: '', quantity: 1, unitPrice: '', refNumber: '', quotationNumber: '', discountRate: '', deliveryDate: '' }]);
  const [removedItemIds, setRemovedItemIds] = useState([]);
  const hasInvoice = Boolean(record && (record.invoiced || record.items?.some(item => hasSalesInvoice(record, item))));
  const legacyDelivered = Boolean(record?.delivered && !hasInvoice);
  const headerLocked = hasInvoice || legacyDelivered;
  const itemLocked = item => legacyDelivered || hasSalesInvoice(record, item);
  const canSave = !headerLocked || !legacyDelivered && (items.some(item => !itemLocked(item)) || removedItemIds.length > 0);
  const [options, setOptions] = useState({ currencies: [], paymentTerms: [], vatCodes: [], countries: [], shipments: [] });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionError, setOptionError] = useState('');
  const [validation, setValidation] = useState('');
  const [errors, setErrors] = useState({});
  const optionRequest = useRef(null);
  const controls = useRef({});
  const { busy, error, save } = useSave(onSaved);

  function loadOptions() {
    optionRequest.current?.abort();
    const controller = new AbortController();
    optionRequest.current = controller;
    setOptionError('');
    api('/api/sales/sales-order-options', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const active = values => (Array.isArray(values) ? values : []).filter(option => option && option.isActive !== false && option.isActive !== 0);
      const currencies = active(result.currencies).filter(option => typeof option.code === 'string' && option.code.trim()).map(option => ({ ...option, code: option.code.trim().toUpperCase() }));
      setOptions({
        currencies: [...new Map(currencies.map(option => [option.code, option])).values()],
        paymentTerms: active(result.paymentTerms), vatCodes: active(result.vatCodes),
        countries: active(result.countries), shipments: active(result.shipments),
      });
    }).catch(() => {
      if (!controller.signal.aborted) {
        setOptions({ currencies: [], paymentTerms: [], vatCodes: [], countries: [], shipments: [] });
        setOptionError('Order choices could not be loaded. Reopen this form to try again.');
      }
    }).finally(() => { if (!controller.signal.aborted) setLoadingOptions(false); });
  }
  useEffect(() => { loadOptions(); return () => optionRequest.current?.abort(); }, []);
  useRealtimeRefresh(({ resources = [] }) => { if (resources.includes('*') || resources.includes('options')) loadOptions(); });

  const billTo = customers.find(row => String(row.id) === String(form.billToCustomerId));
  const billToAddresses = [...new Set([billTo?.address, ...(billTo?.deliveryAddresses || [])].filter(value => typeof value === 'string' && value.trim()))];
  const decimals = Number(headerLocked ? record?.decimalInTotalPrice ?? 2 : billTo?.decimalInTotalPrice ?? record?.decimalInTotalPrice ?? 2);
  const currency = headerLocked || options.currencies.some(option => option.code === form.currency) ? form.currency : '';
  const vat = headerLocked ? { code: record?.vatCode, rate: record?.vatRate } : options.vatCodes.find(option => option.code === form.vatCode);
  const productCurrencies = [...new Set(items.map(item => item.currency ?? products.find(product => String(product.id) === String(item.productId))?.currency).map(code => String(code || '').trim().toUpperCase()))];
  const sourceCurrency = headerLocked ? record?.sourceCurrency || (productCurrencies.length === 1 ? productCurrencies[0] : '') : productCurrencies.length === 1 ? productCurrencies[0] : '';
  let preview = null;
  let calculationError = '';
  if (legacyDelivered) preview = { ...record, items };
  else if (hasInvoice) {
    try { preview = calculateEditableSalesOrder({ record, items }); }
    catch (error) { calculationError = error.message; }
  } else if (currency && vat?.rate != null && typeof form.vatInclusive === 'boolean' && items.every(item => item.productId && String(item.quantity).trim() && String(item.unitPrice).trim())) {
    try { preview = calculateSalesOrder({ items, rate: form.rate, vatRate: vat.rate, vatInclusive: form.vatInclusive, discountType: form.discountType || null, discount: form.discountType && String(form.discount).trim() ? form.discount : null, decimalInTotalPrice: decimals }); }
    catch (error) { calculationError = error.message; }
  }
  const amount = value => value != null && currency ? money(value, currency, decimals) : '—';

  function set(key, value) {
    if (headerLocked) return;
    setForm(current => ({ ...current, [key]: value, ...(key === 'discountType' && !value ? { discount: '' } : {}) }));
    setErrors(current => { const next = { ...current }; delete next[key]; if (key === 'discountType') delete next.discount; return next; });
    setValidation('');
  }
  function chooseCustomer(value) {
    if (headerLocked) return;
    const selected = customers.find(row => String(row.id) === String(value));
    const address = selected?.salesAddressType === 'delivery' ? selected.deliveryAddresses?.[0] || selected.address || '' : selected?.address || '';
    setForm(current => ({
      ...current, customerId: value, billToCustomerId: value, billToAddress: address,
      paymentTerm: selected?.paymentTerm ?? '', countryOfOrigin: selected?.countryOfOrigin ?? '',
      vatCode: selected?.vatCode ?? '', vatInclusive: selected?.vatInclusive ?? null,
      discountType: selected?.discountType ?? '', discount: selected?.discount ?? '',
    }));
    setErrors({}); setValidation('');
  }
  function chooseBillTo(value) {
    if (headerLocked) return;
    const selected = customers.find(row => String(row.id) === String(value));
    const address = selected?.salesAddressType === 'delivery' ? selected.deliveryAddresses?.[0] || selected.address || '' : selected?.address || '';
    setForm(current => ({ ...current, billToCustomerId: value, billToAddress: address }));
    setErrors(current => { const next = { ...current }; delete next.billToCustomerId; return next; });
  }
  function update(index, key, value) {
    if (itemLocked(items[index])) return;
    const selected = key === 'productId' ? products.find(product => String(product.id) === String(value)) : null;
    setItems(old => old.map((item, i) => i !== index ? item : { ...item, [key]: value, ...(key === 'productId' ? { unitPrice: selected?.price ?? '', productName: selected?.name ?? '', description: selected?.description ?? '', sku: selected?.sku ?? '', unit: selected?.unit ?? '', currency: selected?.currency ?? '', sourceCurrency: selected?.currency ?? '' } : {}) }));
    setErrors(current => { const next = { ...current }; delete next['items.' + index + '.' + key]; return next; });
    setValidation('');
  }
  function control(key) {
    const labels = { customerId: 'Customer *', billToCustomerId: 'Bill to *', billToAddress: 'Billing address', orderDate: 'Order date *', expectedDeliveryDate: 'Expected delivery date *', currency: 'Currency *', rate: 'Rate *', paymentTerm: 'Payment term *', shipment: 'Shipment *', countryOfOrigin: 'Country of origin', vatCode: 'VAT code *', vatInclusive: 'VAT pricing *', discountType: 'Discount type', discount: form.discountType === 'percent' ? 'Discount (%)' : 'Discount amount (' + (currency || 'order currency') + ')', notes: 'Notes', status: 'Status *' };
    const itemControl = /^items\.(\d+)\./.exec(key);
    return { name: key, ref: node => { controls.current[key] = node; }, disabled: itemControl ? itemLocked(items[Number(itemControl[1])]) : headerLocked, 'aria-label': labels[key], 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? 'order-error-' + key : undefined };
  }
  function fieldError(key) { return errors[key] && <small className="field-error" id={'order-error-' + key}>{errors[key]}</small>; }
  function removeItem(index) {
    const item = items[index];
    if (itemLocked(item) || items.length === 1) return;
    if (item.id) setRemovedItemIds(current => [...current, item.id]);
    setItems(old => old.filter((_, row) => row !== index));
    setErrors({}); setValidation('');
  }
  function submit(event) {
    event.preventDefault();
    if (busy || !canSave) return;
    const invalid = validateOrderForm({ ...form, currency }, items, options, products, customers, { headerLocked, itemLocked, savedItems: record?.items, sourceCurrency: record?.sourceCurrency || record?.currency });
    setErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first) { setValidation(invalid[first]); focusModalControl(controls.current[first]); return; }
    if (calculationError || !preview) { setValidation(calculationError || 'Complete the order details to calculate the totals.'); return; }
    setValidation('');
    const serializeItem = item => ({
      ...(item.id ? { id: item.id } : {}),
      productId: Number(item.productId), quantity: String(item.quantity), unitPrice: String(item.unitPrice),
      refNumber: String(item.refNumber).trim() || null, quotationNumber: String(item.quotationNumber).trim() || null,
      discountRate: String(item.discountRate).trim() ? String(item.discountRate) : null, deliveryDate: item.deliveryDate || null,
    });
    if (hasInvoice) {
      const body = { items: items.filter(item => !itemLocked(item)).map(serializeItem), removedItemIds };
      save(() => api('/api/sales/sales-orders/' + record.id + '/items', { method: 'PATCH', body }));
      return;
    }
    const body = {
      ...form, currency, customerId: Number(form.customerId), billToCustomerId: Number(form.billToCustomerId),
      billToName: billTo?.salesName || billTo?.name || '', billToAddress: form.billToAddress || null,
      countryOfOrigin: form.countryOfOrigin || null, notes: String(form.notes).trim() || null,
      discountType: form.discountType || null, discount: form.discountType && String(form.discount).trim() ? String(form.discount) : null,
      items: items.map(serializeItem),
    };
    save(() => api(record ? '/api/sales/sales-orders/' + record.id : '/api/sales/sales-orders', { method: record ? 'PUT' : 'POST', body }));
  }

  return <Modal wide className="sales-order-modal" title={record ? 'Edit ' + record.number : 'New sales order'} subtitle="Order information, billing and tax settings, followed by the product details." onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate><div className="modal-body"><ErrorNotice message={error || validation || (!headerLocked && optionError)} />
      {headerLocked && <div className="notice sales-order-lock-notice" role="status">{legacyDelivered ? 'This legacy order has delivery records without item-level sales invoice links. Order details and items are locked to preserve those saved documents.' : 'This order has sales invoice items. Order information, billing, currency and tax settings are locked. Only items without an SI can be edited.'}</div>}
      <fieldset disabled={busy}>
      <fieldset disabled={headerLocked} className="sales-order-header">
        <section className="sales-order-section"><h3>Order information</h3><div className="sales-order-fields">
          <Field label="SO number"><input readOnly value={record?.number || 'Assigned when saved'} /></Field>
          <Field label="Status *"><select {...control('status')} required value={form.status} onChange={e => set('status', e.target.value)}>{headerLocked && !['draft', 'confirmed'].includes(form.status) && <option value={form.status}>{form.status}</option>}<option value="draft">Draft</option><option value="confirmed">Confirmed</option></select>{fieldError('status')}</Field>
          <Field label="Order date *"><input {...control('orderDate')} type="date" required value={form.orderDate} onChange={e => set('orderDate', e.target.value)} />{fieldError('orderDate')}</Field>
          <Field label="Expected delivery date *"><input {...control('expectedDeliveryDate')} type="date" required min={form.orderDate} value={form.expectedDeliveryDate} onChange={e => set('expectedDeliveryDate', e.target.value)} />{fieldError('expectedDeliveryDate')}</Field>
          <Field label="Customer *" wide><select {...control('customerId')} required value={form.customerId} onChange={e => chooseCustomer(e.target.value)}><option value="">Select a customer</option>{headerLocked ? <option value={form.customerId}>{record?.customerName || customers.find(row => String(row.id) === String(form.customerId))?.name || 'Saved customer'}</option> : customers.filter(row => row.isActive || row.id === record?.customerId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{fieldError('customerId')}</Field>
          <Field label="Bill to *" wide><select {...control('billToCustomerId')} required value={form.billToCustomerId} onChange={e => chooseBillTo(e.target.value)}><option value="">Select a billing customer</option>{headerLocked ? <option value={form.billToCustomerId}>{record?.billToName || record?.customerName || 'Saved billing customer'}</option> : customers.filter(row => row.isActive || row.id === record?.billToCustomerId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{fieldError('billToCustomerId')}</Field>
          <Field label="Billing address" wide>{billToAddresses.length > 1 && <select aria-label="Billing address choice" value={billToAddresses.includes(form.billToAddress) ? form.billToAddress : ''} onChange={e => set('billToAddress', e.target.value)}><option value="">Select a customer address</option>{billToAddresses.map((address, index) => <option key={address} value={address}>{address === billTo?.address ? 'Office address' : 'Delivery address ' + index}</option>)}</select>}<textarea {...control('billToAddress')} aria-label="Billing address" rows={3} readOnly value={form.billToAddress} />{fieldError('billToAddress')}</Field>
        </div></section>
        <section className="sales-order-section"><h3>Currency and delivery</h3><div className="sales-order-fields">
          <Field label="Currency *"><select {...control('currency')} required aria-required="true" value={currency} onChange={e => set('currency', e.target.value)}><option value="">{loadingOptions ? 'Loading currencies…' : 'Select a currency'}</option>{headerLocked ? <option value={currency}>{currency}</option> : options.currencies.map(option => <option key={option.code} value={option.code}>{option.code}{option.description ? ' · ' + option.description : ''}</option>)}</select>{fieldError('currency')}</Field>
          <Field label="Rate *"><input {...control('rate')} type="number" required min="0.000001" max="1000000" step="0.000001" value={form.rate} onChange={e => set('rate', e.target.value)} />{fieldError('rate')}</Field>
          <p className="sales-order-rate span-2">{sourceCurrency && currency ? '1 ' + sourceCurrency + ' = ' + (form.rate || '—') + ' ' + currency : 'Select products and an order currency to see the conversion.'}</p>
          <Field label="Payment term *" wide><select {...control('paymentTerm')} required value={headerLocked || options.paymentTerms.some(option => (option.name || option.description) === form.paymentTerm) ? form.paymentTerm : ''} onChange={e => set('paymentTerm', e.target.value)}><option value="">Select payment term</option>{headerLocked ? <option value={form.paymentTerm}>{form.paymentTerm || 'None saved'}</option> : options.paymentTerms.map(option => <option key={option.id ?? option.name ?? option.description} value={option.name || option.description}>{option.name || option.description}</option>)}</select>{fieldError('paymentTerm')}</Field>
          <Field label="Shipment *"><select {...control('shipment')} required value={form.shipment} onChange={e => set('shipment', e.target.value)}><option value="">Select shipment</option>{headerLocked ? <option value={form.shipment}>{options.shipments.find(option => option.value === form.shipment)?.label || form.shipment || 'None saved'}</option> : options.shipments.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{fieldError('shipment')}</Field>
          <Field label="Country of origin"><select {...control('countryOfOrigin')} value={headerLocked || options.countries.some(option => option.name === form.countryOfOrigin) ? form.countryOfOrigin : ''} onChange={e => set('countryOfOrigin', e.target.value)}><option value="">None</option>{headerLocked ? form.countryOfOrigin && <option value={form.countryOfOrigin}>{form.countryOfOrigin}</option> : options.countries.map(option => <option key={option.id ?? option.name} value={option.name}>{option.name}</option>)}</select>{fieldError('countryOfOrigin')}</Field>
          <Field label="Prepared by" wide><input readOnly value={record?.preparedByName || user?.name || ''} /></Field>
          <p className="field-hint span-2">Confirm an order when it is ready to invoice. Stock is deducted when its sales invoice is created.</p>
        </div></section>
        <section className="sales-order-section"><h3>Tax and discount</h3><div className="sales-order-fields">
          <Field label="VAT code *" wide><select {...control('vatCode')} required value={vat ? form.vatCode : ''} onChange={e => set('vatCode', e.target.value)}><option value="">Select VAT code</option>{headerLocked ? <option value={form.vatCode}>{form.vatCode}{vat?.rate != null ? ' (' + Number(vat.rate) + '%)' : ''}</option> : options.vatCodes.map(option => <option key={option.id ?? option.code} value={option.code}>{option.code}{option.description ? ' · ' + option.description : ''}{option.rate != null ? ' (' + Number(option.rate) + '%)' : ''}</option>)}</select>{fieldError('vatCode')}</Field>
          <Field label="VAT pricing *" wide><select {...control('vatInclusive')} required value={form.vatInclusive === null ? '' : form.vatInclusive ? 'inclusive' : 'exclusive'} onChange={e => set('vatInclusive', e.target.value === '' ? null : e.target.value === 'inclusive')}><option value="">Select VAT pricing</option><option value="inclusive">Inclusive</option><option value="exclusive">Exclusive</option></select>{fieldError('vatInclusive')}</Field>
          <Field label="Discount type" wide><select {...control('discountType')} value={form.discountType} onChange={e => set('discountType', e.target.value)}><option value="">None</option><option value="percent">Percent</option><option value="amount">Amount</option></select>{fieldError('discountType')}</Field>
          {form.discountType && <Field label={form.discountType === 'percent' ? 'Discount (%)' : 'Discount amount (' + (currency || 'order currency') + ')'} wide><input {...control('discount')} type="number" min="0" max={form.discountType === 'percent' ? '100' : undefined} step="0.000001" value={form.discount} onChange={e => set('discount', e.target.value)} />{fieldError('discount')}</Field>}
          <Field label="Notes" wide><textarea {...control('notes')} rows={3} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} />{fieldError('notes')}</Field>
          <p className="field-hint span-2">VAT and discount start from the customer settings. Changes here apply only to this order.</p>
        </div></section>
      </fieldset>
      {!headerLocked && !loadingOptions && !optionError && !options.currencies.length && <div className="notice">No active currencies are available. Add a currency in Configuration System before saving.</div>}
      <div className="section-label"><h3>Order items</h3><span>{currency ? 'Amounts in ' + currency : 'Select a currency'}</span></div>
      <div className="sales-order-items-scroll"><table className="sales-order-items"><thead><tr className="line-head"><th>Ref no.</th><th><RequiredLabel required>Product</RequiredLabel></th><th>Description</th><th>UOM</th><th><RequiredLabel required>Quantity</RequiredLabel></th><th><RequiredLabel required>Unit price</RequiredLabel></th><th>Source currency</th><th>Converted price</th><th>VAT</th><th>Discount (%)</th><th>Gross amount</th><th>Discount amount</th><th>Net amount</th><th>VAT amount</th><th>Amount</th><th>Delivery date</th><th>Quotation no.</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {items.map((item, index) => {
          const catalog = products.find(row => String(row.id) === String(item.productId));
          const locked = itemLocked(item);
          const product = locked ? { name: item.productName, sku: item.sku, description: item.description ?? item.productDescription, unit: item.unit, currency: item.currency ?? item.sourceCurrency } : item.id || item.productName || item.sku ? { ...catalog, name: item.productName ?? catalog?.name, sku: item.sku ?? catalog?.sku, description: item.description ?? item.productDescription ?? catalog?.description, unit: item.unit ?? catalog?.unit, currency: item.currency ?? item.sourceCurrency ?? catalog?.currency } : catalog;
          const calculated = locked ? item : preview?.items[index];
          return <tr key={item.id ?? 'new-' + index} className={locked ? 'sales-order-item-locked' : ''} data-invoice-locked={locked ? 'true' : 'false'} aria-label={locked ? legacyDelivered ? 'Saved delivery item, read only' : 'Sales invoice item, read only' : undefined}>
            <td><input {...control('items.' + index + '.refNumber')} aria-label={'Reference ' + (index + 1)} maxLength={100} value={item.refNumber} onChange={e => update(index, 'refNumber', e.target.value)} />{fieldError('items.' + index + '.refNumber')}</td>
            <td><select {...control('items.' + index + '.productId')} aria-label={'Product ' + (index + 1)} title={product ? (product.sku || '') + ' · ' + (product.name || '') : undefined} required value={item.productId} onChange={e => update(index, 'productId', e.target.value)}><option value="">Select product</option>{locked ? <option value={item.productId}>{item.sku || 'Saved product'} · {item.productName || item.description || ''}</option> : <>{item.productId && !catalog && <option value={item.productId}>{item.sku || 'Saved product'} · {item.productName || item.description || ''}</option>}{products.filter(row => row.isActive || String(row.id) === String(item.productId)).map(row => <option key={row.id} value={row.id} disabled={items.some((line, lineIndex) => lineIndex !== index && String(line.productId) === String(row.id))}>{String(row.id) === String(item.productId) ? (product?.sku || row.sku) + ' · ' + (product?.name || row.name) : row.sku + ' · ' + row.name}</option>)}</>}</select>{fieldError('items.' + index + '.productId')}</td>
            <td className="sales-order-description">{product?.description || product?.name || '—'}</td><td>{product?.unit || '—'}</td>
            <td><input {...control('items.' + index + '.quantity')} aria-label={'Quantity ' + (index + 1)} type="number" required min="0.001" max="1000000" step="0.001" value={item.quantity} onChange={e => update(index, 'quantity', e.target.value)} />{fieldError('items.' + index + '.quantity')}</td>
            <td><input {...control('items.' + index + '.unitPrice')} aria-label={'Unit price ' + (index + 1)} type="number" required min="0" max="100000000" step="0.000001" value={item.unitPrice} onChange={e => update(index, 'unitPrice', e.target.value)} />{fieldError('items.' + index + '.unitPrice')}</td>
            <td>{product?.currency || '—'}</td><td className="numeric">{calculated ? unitMoney(calculated.convertedUnitPrice, currency) : '—'}</td><td>{vat?.code || '—'}{vat?.rate != null && <small>{Number(vat.rate)}% · {form.vatInclusive === null ? '—' : form.vatInclusive ? 'Inclusive' : 'Exclusive'}</small>}</td>
            <td><input {...control('items.' + index + '.discountRate')} aria-label={'Discount rate ' + (index + 1)} type="number" min="0" max="100" step="0.000001" value={item.discountRate} onChange={e => update(index, 'discountRate', e.target.value)} />{fieldError('items.' + index + '.discountRate')}</td>
            <td className="numeric">{amount(calculated?.grossAmount)}</td><td className="numeric">{amount(calculated?.discountAmount)}</td><td className="numeric">{amount(calculated?.netAmount)}</td><td className="numeric">{amount(calculated?.vatAmount)}</td><td className="numeric"><strong>{amount(calculated?.amount)}</strong></td>
            <td><input {...control('items.' + index + '.deliveryDate')} aria-label={'Delivery date ' + (index + 1)} type="date" min={form.orderDate} value={item.deliveryDate} onChange={e => update(index, 'deliveryDate', e.target.value)} />{!item.deliveryDate && form.expectedDeliveryDate && <small>Uses {form.expectedDeliveryDate}</small>}{fieldError('items.' + index + '.deliveryDate')}</td>
            <td><input {...control('items.' + index + '.quotationNumber')} aria-label={'Quotation number ' + (index + 1)} maxLength={100} value={item.quotationNumber} onChange={e => update(index, 'quotationNumber', e.target.value)} />{fieldError('items.' + index + '.quotationNumber')}</td>
            <td><button type="button" className="icon-button danger-text" aria-label={'Remove product ' + (index + 1)} disabled={locked || items.length === 1} onClick={() => removeItem(index)}><Icon name="x" size={17} /></button></td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="order-bottom"><button type="button" className="button secondary small" disabled={legacyDelivered || items.length >= 100} onClick={() => setItems(old => [...old, { productId: '', quantity: 1, unitPrice: '', refNumber: '', quotationNumber: '', discountRate: '', deliveryDate: '' }])}>+ Add product</button><div><span>Order total</span><strong>{amount(preview?.total)}</strong></div></div>
      <div className="sales-order-totals" aria-live="polite">{[['Gross amount', 'grossAmount'], ['Discount amount', 'discountAmount'], ['Net amount', 'netAmount'], ['VAT amount', 'vatAmount'], ['Total amount', 'amount']].map(([label, key]) => <div key={key}><span>{label}</span><strong>{amount(preview?.[key])}</strong></div>)}</div>
      {calculationError && <p className="field-error">{calculationError}</p>}
      {!headerLocked && (!customers.some(row => row.isActive) || !products.some(row => row.isActive)) && <div className="notice">Create an active customer and product in their master lists before saving an order.</div>}
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={!canSave || hasInvoice && Boolean(calculationError)} label="Save sales order" /></form>
  </Modal>;
}
