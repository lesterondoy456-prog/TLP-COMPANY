import React, { useEffect, useRef, useState } from 'react';
import { api, money, today, dateInput } from '../../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../../salesPricing.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, RequiredLabel, FormFooter, ErrorNotice } from '../../components/UI.jsx';
import { validateOrderCurrency } from '../../helper/validation.js';
import useSave from '../../hooks/useSave.js';
import { useRealtimeRefresh } from '../../hooks/useRealtime.js';

export default function CreateOrderForm({
  record,
  customers: initialCustomers,
  products: initialProducts,
  onClose,
  onSaved
}) {
  // Keep an open document's choices stable while its surrounding lists refresh.
  const [choices] = useState(() => ({ customers: initialCustomers, products: initialProducts }));
  const { customers, products } = choices;

  const [form, setForm] = useState({ customerId: record?.customerId || '', orderDate: dateInput(record?.orderDate) || today(), currency: String(record?.currency || '').trim().toUpperCase(), notes: record?.notes || '', status: record?.status || 'draft' });
  const [items, setItems] = useState(record?.items?.map(item => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })) || [{ productId: '', quantity: 1, unitPrice: '' }]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(true);
  const [currencyError, setCurrencyError] = useState('');
  const { busy, error, save } = useSave(onSaved);
  const [validation, setValidation] = useState('');
  const currencyControl = useRef(null);
  const currencyRequest = useRef(null);
  function loadCurrencies() {
    currencyRequest.current?.abort();
    const controller = new AbortController();
    currencyRequest.current = controller;
    setCurrencyError('');
    api('/api/sales/product-options', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const activeCurrencies = (Array.isArray(result.currencies) ? result.currencies : [])
        .filter(option => option && option.isActive !== false && option.isActive !== 0 && typeof option.code === 'string' && option.code.trim())
        .map(option => ({ ...option, code: option.code.trim().toUpperCase() }));
      setCurrencyOptions([...new Map(activeCurrencies.map(option => [option.code, option])).values()]);
    }).catch(error => {
      if (!controller.signal.aborted) {
        setCurrencyOptions([]);
        setCurrencyError('Currency choices could not be loaded. Close and reopen this form to try again.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingCurrencies(false);
    });
  }
  useEffect(() => {
    loadCurrencies();
    return () => currencyRequest.current?.abort();
  }, []);
  useRealtimeRefresh(({ resources = [] }) => {
    if (resources.includes('*') || resources.includes('options')) loadCurrencies();
  });
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  function update(index, key, value) {
    setItems(old => old.map((item, i) => i !== index ? item : { ...item, [key]: value, ...(key === 'productId' ? { unitPrice: products.find(p => String(p.id) === String(value))?.price ?? '' } : {}) }));
  }
  const total = salesTotal(items);
  const currencies = [...new Set(items.map(item => products.find(product => String(product.id) === String(item.productId))).filter(Boolean).map(product => String(product.currency || '').trim().toUpperCase()))];
  const currency = currencyOptions.some(option => option.code === form.currency) ? form.currency : '';
  function submit(event) {
    event.preventDefault(); setValidation('');
    const currencyValidation = validateOrderCurrency(currency, currencyOptions, currencies);
    if (currencyValidation) { setValidation(currencyValidation); currencyControl.current?.focus(); return; }
    if (items.some(item => String(item.quantity ?? '').trim() === '' || String(item.unitPrice ?? '').trim() === '')) { setValidation('Enter a quantity and unit price for every order item.'); return; }
    if (!items.length || items.some(item => !item.productId || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0)) { setValidation('Add at least one product with a positive quantity and valid price.'); return; }
    if (new Set(items.map(item => String(item.productId))).size !== items.length) { setValidation('Use one line per product. Combine quantities for repeated products.'); return; }
    const body = { ...form, notes: String(form.notes ?? '').trim() || null, currency, customerId: Number(form.customerId), items: items.map(item => ({ productId: Number(item.productId), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) };
    save(() => api(record ? '/api/sales/sales-orders/' + record.id : '/api/sales/sales-orders', { method: record ? 'PUT' : 'POST', body }));
  }
  return <Modal wide title={record ? 'Edit ' + record.number : 'New sales order'} subtitle="Choose a customer, add products, and confirm when ready." onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error || validation || currencyError} /><fieldset disabled={busy}>
      <div className="form-grid">
        <Field label="Customer *"><select required value={form.customerId} onChange={e => set('customerId', e.target.value)}><option value="">Select a customer</option>{customers.filter(c => c.isActive || c.id === record?.customerId).map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
        <Field label="Order date *"><input type="date" required value={form.orderDate} onChange={e => set('orderDate', e.target.value)} /></Field>
        <Field label="Currency *"><select ref={currencyControl} required aria-required="true" value={currency} onChange={e => { set('currency', e.target.value); setValidation(''); }}><option value="">{loadingCurrencies ? 'Loading currencies...' : 'Select a currency'}</option>{currencyOptions.map(option => <option key={option.code} value={option.code}>{option.code}{option.description && option.description !== option.code ? ' · ' + option.description : ''}</option>)}</select></Field>
      </div>
      {!loadingCurrencies && !currencyError && !currencyOptions.length && <div className="notice">No active currencies are available. Add a currency in Configuration System before saving.</div>}
      <div className="section-label"><h3>Order items</h3><span>{currency ? 'Prices in ' + currency : 'Select a currency'}</span></div>
      <div className="order-lines"><div className="order-line line-head"><span><RequiredLabel required>Product</RequiredLabel></span><span><RequiredLabel required>Quantity</RequiredLabel></span><span><RequiredLabel required>Unit price</RequiredLabel></span><span>Amount</span><span /></div>
        {items.map((item, i) => <div className="order-line" key={i}>
          <select aria-label={'Product ' + (i + 1)} required value={item.productId} onChange={e => update(i, 'productId', e.target.value)}><option value="">Select product</option>{products.filter(p => p.isActive || p.id === item.productId).map(p => <option key={p.id} value={p.id} disabled={items.some((line, index) => index !== i && String(line.productId) === String(p.id))}>{p.sku} · {p.name} ({p.stock} {p.unit})</option>)}</select>
          <input aria-label={'Quantity ' + (i + 1)} type="number" required min="0.001" max="1000000" step="0.001" value={item.quantity} onChange={e => update(i, 'quantity', e.target.value)} />
          <input aria-label={'Unit price ' + (i + 1)} type="number" required min="0" max="100000000" step="0.000001" value={item.unitPrice} onChange={e => update(i, 'unitPrice', e.target.value)} />
          <strong className="line-amount">{currency ? money(lineTotal(item), currency) : '—'}</strong>
          <button type="button" className="icon-button danger-text" aria-label={'Remove product ' + (i + 1)} disabled={items.length === 1} onClick={() => setItems(old => old.filter((_, index) => index !== i))}><Icon name="x" size={17} /></button>
        </div>)}
      </div>
      <div className="order-bottom"><button type="button" className="button secondary small" onClick={() => setItems(old => [...old, { productId: '', quantity: 1, unitPrice: '' }])}>+ Add product</button><div><span>Order total</span><strong>{currency ? money(total, currency) : '—'}</strong></div></div>
      <div className="form-grid"><Field label="Status *"><select value={form.status} onChange={e => set('status', e.target.value)}><option value="draft">Draft</option><option value="confirmed">Confirmed</option></select></Field><div className="field-hint">Only confirmed orders can be invoiced or delivered. Stock is deducted when a delivery receipt is created.</div><Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field></div>
      {(!customers.some(c => c.isActive) || !products.some(p => p.isActive)) && <div className="notice">Create an active customer and product in their master lists before saving an order.</div>}
    </fieldset></div><FormFooter onClose={onClose} busy={busy} label="Save sales order" /></form>
  </Modal>;
}
