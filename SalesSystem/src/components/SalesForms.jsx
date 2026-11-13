import React, { useState } from 'react';
import { api, money, unitMoney, today, dateInput, dateLabel } from '../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../salesPricing.mjs';
import { Icon } from './Icons.jsx';
import { Modal, Field, FormFooter, ErrorNotice, Badge, PhotoField, roleLabel } from './UI.jsx';
import CustomerForm from './CustomerForm.jsx';
import ProductForm from './ProductForm.jsx';

function useSave(onSaved) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(action) {
    setBusy(true); setError('');
    try { const result = await action(); onSaved(result); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return { busy, error, save };
}
const trimFields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));

export function MasterForm({ kind, ...props }) {
  return kind === 'customers' ? <CustomerForm {...props} /> : <ProductForm {...props} />;
}

export function UserForm({ record, profile = false, actorRole = 'sales', onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', username: '', cpnumber: '', email: '', photo: '', role: 'sales', isActive: true, ...record, password: '' });
  const { busy, error, save } = useSave(onSaved);
  const canAssignRoles = actorRole === 'admin';
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  function submit(event) {
    event.preventDefault();
    if (!profile && ((!canAssignRoles && record) || (!canAssignRoles && actorRole !== 'saleshead'))) {
      save(() => Promise.reject(new Error('You do not have permission to manage this user account.')));
      return;
    }
    const body = trimFields({ name: form.name, username: form.username, cpnumber: form.cpnumber, email: form.email, photo: form.photo });
    if (!profile) { body.role = canAssignRoles ? form.role : 'sales'; body.isActive = form.isActive; if (form.password) body.password = form.password; }
    save(() => api(profile ? '/auth/profile' : '/users' + (record ? '/' + record.id : ''), { method: profile || record ? 'PUT' : 'POST', body }));
  }
  return <Modal title={profile ? 'My profile' : record ? 'Edit user account' : 'New user account'} subtitle={profile ? 'Your details in the TLP Company workspace.' : 'Manage access to your sales system.'} onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <PhotoField value={form.photo} name={form.name} onChange={value => set('photo', value)} />
      <Field label="Full name *"><input required maxLength={150} value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" /></Field>
      <Field label="Username *" hint="Use letters, numbers, underscores, dots, or hyphens."><input required maxLength={80} minLength={3} value={form.username} onChange={e => set('username', e.target.value)} autoComplete="off" /></Field>
      <Field label="Mobile number"><input type="tel" maxLength={30} value={form.cpnumber || ''} onChange={e => set('cpnumber', e.target.value)} autoComplete="tel" /></Field>
      <Field label="Email"><input type="email" maxLength={254} value={form.email || ''} onChange={e => set('email', e.target.value)} autoComplete="email" /></Field>
      {profile ? <Field label="Role" wide><input value={roleLabel(form.role)} disabled /></Field> : <>
        <Field label="Role *"><select value={canAssignRoles ? form.role : 'sales'} disabled={!canAssignRoles} onChange={e => set('role', e.target.value)}><option value="sales">Sales</option>{canAssignRoles && <><option value="saleshead">Sales Head</option><option value="admin">Administrator</option></>}</select></Field>
        <Field label={record ? 'New password (optional)' : 'Password *'} hint={record ? 'Leave blank to keep the current password. New passwords need at least 12 characters.' : 'Use at least 12 characters.'}><input type="password" minLength={12} maxLength={128} required={!record} value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" /></Field>
        <label className="checkbox span-2"><input type="checkbox" checked={Boolean(form.isActive)} onChange={e => set('isActive', e.target.checked)} />Account is active</label>
      </>}
    </fieldset></div><FormFooter onClose={onClose} busy={busy} label={profile ? 'Save profile' : 'Save user'} /></form>
  </Modal>;
}

export function OrderForm({ record, customers, products, onClose, onSaved }) {
  const [form, setForm] = useState({ customerId: record?.customerId || '', orderDate: dateInput(record?.orderDate) || today(), notes: record?.notes || '', status: record?.status || 'draft' });
  const [items, setItems] = useState(record?.items?.map(item => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })) || [{ productId: '', quantity: 1, unitPrice: 0 }]);
  const { busy, error, save } = useSave(onSaved);
  const [validation, setValidation] = useState('');
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  function update(index, key, value) {
    setItems(old => old.map((item, i) => i !== index ? item : { ...item, [key]: value, ...(key === 'productId' ? { unitPrice: products.find(p => String(p.id) === String(value))?.price || 0 } : {}) }));
  }
  const total = salesTotal(items);
  const currencies = [...new Set(items.map(item => products.find(product => String(product.id) === String(item.productId))).filter(Boolean).map(product => String(product.currency || 'PHP').trim().toUpperCase() || 'PHP'))];
  const currency = currencies[0] || record?.currency || 'PHP';
  function submit(event) {
    event.preventDefault(); setValidation('');
    if (!items.length || items.some(item => !item.productId || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0)) { setValidation('Add at least one product with a positive quantity and valid price.'); return; }
    if (new Set(items.map(item => String(item.productId))).size !== items.length) { setValidation('Use one line per product. Combine quantities for repeated products.'); return; }
    if (currencies.length > 1) { setValidation('Use products with the same currency in one sales order.'); return; }
    const body = { ...form, currency, customerId: Number(form.customerId), items: items.map(item => ({ productId: Number(item.productId), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) };
    save(() => api('/sales-orders' + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body }));
  }
  return <Modal wide title={record ? 'Edit ' + record.number : 'New sales order'} subtitle="Choose a customer, add products, and confirm when ready." onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error || validation} /><fieldset disabled={busy}>
      <div className="form-grid">
        <Field label="Customer *"><select required value={form.customerId} onChange={e => set('customerId', e.target.value)}><option value="">Select a customer</option>{customers.filter(c => c.isActive || c.id === record?.customerId).map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
        <Field label="Order date *"><input type="date" required value={form.orderDate} onChange={e => set('orderDate', e.target.value)} /></Field>
        <Field label="Currency"><input value={currency} readOnly /></Field>
      </div>
      <div className="section-label"><h3>Order items</h3><span>Prices in {currency}</span></div>
      <div className="order-lines"><div className="order-line line-head"><span>Product</span><span>Quantity</span><span>Unit price</span><span>Amount</span><span /></div>
        {items.map((item, i) => <div className="order-line" key={i}>
          <select aria-label={'Product ' + (i + 1)} required value={item.productId} onChange={e => update(i, 'productId', e.target.value)}><option value="">Select product</option>{products.filter(p => p.isActive || p.id === item.productId).map(p => <option key={p.id} value={p.id} disabled={items.some((line, index) => index !== i && String(line.productId) === String(p.id))}>{p.sku} · {p.name} ({p.stock} {p.unit})</option>)}</select>
          <input aria-label={'Quantity ' + (i + 1)} type="number" required min="0.001" max="1000000" step="0.001" value={item.quantity} onChange={e => update(i, 'quantity', e.target.value)} />
          <input aria-label={'Unit price ' + (i + 1)} type="number" required min="0" max="100000000" step="0.000001" value={item.unitPrice} onChange={e => update(i, 'unitPrice', e.target.value)} />
          <strong className="line-amount">{money(lineTotal(item), currency)}</strong>
          <button type="button" className="icon-button danger-text" aria-label={'Remove product ' + (i + 1)} disabled={items.length === 1} onClick={() => setItems(old => old.filter((_, index) => index !== i))}><Icon name="x" size={17} /></button>
        </div>)}
      </div>
      <div className="order-bottom"><button type="button" className="button secondary small" onClick={() => setItems(old => [...old, { productId: '', quantity: 1, unitPrice: 0 }])}>+ Add product</button><div><span>Order total</span><strong>{money(total, currency)}</strong></div></div>
      <div className="form-grid"><Field label="Status *"><select value={form.status} onChange={e => set('status', e.target.value)}><option value="draft">Draft</option><option value="confirmed">Confirmed</option></select></Field><div className="field-hint">Only confirmed orders can be invoiced or delivered. Stock is deducted when a delivery receipt is created.</div><Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field></div>
      {(!customers.some(c => c.isActive) || !products.some(p => p.isActive)) && <div className="notice">Create an active customer and product in their master lists before saving an order.</div>}
    </fieldset></div><FormFooter onClose={onClose} busy={busy} label="Save sales order" /></form>
  </Modal>;
}

export function DocumentForm({ kind, orders, customers, onClose, onSaved }) {
  const invoice = kind === 'sales-invoices';
  const eligible = orders.filter(order => order.status === 'confirmed' && !(invoice ? order.invoiced : order.delivered));
  const [form, setForm] = useState({ orderId: '', invoiceDate: today(), dueDate: today(), deliveryDate: today(), receivedBy: '', address: '', notes: '' });
  const { busy, error, save } = useSave(onSaved);
  const selected = orders.find(order => String(order.id) === String(form.orderId));
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  function chooseOrder(value) {
    const order = orders.find(order => String(order.id) === String(value));
    const customer = customers.find(customer => customer.id === order?.customerId);
    setForm(f => ({ ...f, orderId: value, address: customer?.address || '', receivedBy: customer?.contactPerson || customer?.name || '' }));
  }
  function submit(event) {
    event.preventDefault();
    const body = invoice ? { orderId: Number(form.orderId), invoiceDate: form.invoiceDate, dueDate: form.dueDate, notes: form.notes } : { orderId: Number(form.orderId), deliveryDate: form.deliveryDate, receivedBy: form.receivedBy.trim(), address: form.address.trim(), notes: form.notes };
    save(() => api('/' + kind, { method: 'POST', body }));
  }
  return <Modal title={invoice ? 'New sales invoice' : 'New delivery receipt'} subtitle={invoice ? 'Create an invoice from a confirmed sales order.' : 'Record a full delivery and update product stock.'} onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <Field label="Sales order *" wide><select required value={form.orderId} onChange={e => chooseOrder(e.target.value)}><option value="">Select a confirmed order</option>{eligible.map(order => <option key={order.id} value={order.id}>{order.number} · {order.customerName} · {money(order.total, order.currency)}</option>)}</select></Field>
      {selected && <div className="document-summary span-2"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Order total</span><strong>{money(selected.total, selected.currency)}</strong></div></div>}
      {!eligible.length && <div className="notice span-2">No eligible orders. Create and confirm a sales order first. Each order can have one invoice and one full delivery receipt.</div>}
      {invoice ? <>
        <Field label="Invoice date *"><input type="date" required value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} /></Field>
        <Field label="Due date *"><input type="date" required min={form.invoiceDate} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
      </> : <>
        <Field label="Delivery date *"><input type="date" required value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} /></Field>
        <Field label="Received by *"><input required maxLength={150} value={form.receivedBy} onChange={e => set('receivedBy', e.target.value)} /></Field>
        <Field label="Delivery address *" wide><textarea required rows={2} maxLength={500} value={form.address} onChange={e => set('address', e.target.value)} /></Field>
        <div className="notice span-2"><Icon name="box" size={18} />Saving this receipt deducts all order quantities from stock. Insufficient stock will prevent the delivery.</div>
      </>}
      <Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={!eligible.length} label={invoice ? 'Create invoice' : 'Create delivery receipt'} /></form>
  </Modal>;
}

export function ShippingInvoiceForm({ invoices, shippingInvoices, onClose, onSaved }) {
  const shipped = new Set(shippingInvoices.map(record => String(record.invoiceId)));
  const eligible = invoices.filter(invoice => !shipped.has(String(invoice.id)));
  const [form, setForm] = useState({ invoiceId: '', shippingDate: today(), carrier: '', trackingNumber: '', notes: '' });
  const { busy, error, save } = useSave(onSaved);
  const selected = invoices.find(invoice => String(invoice.id) === String(form.invoiceId));
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function chooseInvoice(value) {
    const invoice = invoices.find(record => String(record.id) === String(value));
    const invoiceDate = dateInput(invoice?.invoiceDate);
    setForm(current => ({ ...current, invoiceId: value, shippingDate: invoiceDate && current.shippingDate < invoiceDate ? invoiceDate : current.shippingDate }));
  }
  function submit(event) {
    event.preventDefault();
    const body = { invoiceId: Number(form.invoiceId), shippingDate: form.shippingDate, carrier: form.carrier.trim(), trackingNumber: form.trackingNumber.trim(), notes: form.notes.trim() };
    save(() => api('/shipping-invoices', { method: 'POST', body }));
  }
  return <Modal title="New shipping invoice" subtitle="Choose an existing invoice and enter its shipping details." onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="form-grid">
      <Field label="Invoice *" wide><select required value={form.invoiceId} onChange={event => chooseInvoice(event.target.value)}><option value="">Select an invoice</option>{eligible.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.customerName} · {money(invoice.total, invoice.currency)}</option>)}</select></Field>
      {selected && <div className="document-summary span-2"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Invoice total</span><strong>{money(selected.total, selected.currency)}</strong></div></div>}
      {!eligible.length && <div className="notice span-2">No eligible invoices. Create an invoice first. Each invoice can have one shipping invoice.</div>}
      <Field label="Shipping date *"><input type="date" required min={dateInput(selected?.invoiceDate) || undefined} value={form.shippingDate} onChange={event => set('shippingDate', event.target.value)} /></Field>
      <Field label="Carrier"><input maxLength={150} value={form.carrier} onChange={event => set('carrier', event.target.value)} /></Field>
      <Field label="Tracking number" wide><input maxLength={100} value={form.trackingNumber} onChange={event => set('trackingNumber', event.target.value)} /></Field>
      <Field label="Notes" wide><textarea rows={2} maxLength={2000} value={form.notes} onChange={event => set('notes', event.target.value)} /></Field>
    </fieldset></div><FormFooter onClose={onClose} busy={busy} disabled={!eligible.length} label="Create shipping invoice" /></form>
  </Modal>;
}

export function PaymentForm({ record, onClose, onSaved }) {
  const [amount, setAmount] = useState(record.paidAmount ?? 0);
  const { busy, error, save } = useSave(onSaved);
  return <Modal title="Record payment" subtitle={record.number + ' · ' + record.customerName} onClose={onClose} busy={busy}>
    <form onSubmit={event => { event.preventDefault(); save(() => api('/sales-invoices/' + record.id + '/payment', { method: 'PATCH', body: { paidAmount: Number(amount) } })); }}>
      <div className="modal-body"><ErrorNotice message={error} /><div className="document-summary"><div><span>Invoice total</span><strong>{money(record.total, record.currency)}</strong></div><div><span>Current balance</span><strong>{money(Number(record.total) - Number(record.paidAmount), record.currency)}</strong></div></div>
        <Field label={'Total received to date (' + (record.currency || 'PHP') + ') *'} hint="Enter the cumulative amount received, including earlier payments."><input type="number" min="0" max={record.total} step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} autoFocus /></Field>
      </div><FormFooter onClose={onClose} busy={busy} label="Save payment" />
    </form>
  </Modal>;
}

export function DeleteDialog({ kind, record, onClose, onSaved }) {
  const { busy, error, save } = useSave(onSaved);
  return <Modal title="Delete this record?" subtitle={record.name || record.number} onClose={onClose} busy={busy}><div className="modal-body"><ErrorNotice message={error} /><p className="delete-description">This permanently removes the record. Records used in sales documents cannot be deleted.</p></div><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>Keep record</button><button className="button danger" disabled={busy} onClick={() => save(() => api('/' + kind + '/' + record.id, { method: 'DELETE' }))}>{busy ? 'Deleting…' : 'Delete record'}</button></div></Modal>;
}

export function DocumentView({ kind, record, onClose }) {
  const delivery = kind === 'delivery-receipts';
  const shipping = kind === 'shipping-invoices';
  const title = kind === 'sales-orders' ? 'Sales Order' : delivery ? 'Delivery Receipt' : shipping ? 'Shipping Invoice' : 'Invoice';
  return <Modal wide title={title} subtitle={record.number} onClose={onClose}><div className="modal-body document-sheet">
    <div className="document-brand"><div className="brand"><div className="brand-mark">T</div><div><strong>TLP COMPANY</strong><span>SALES MANAGEMENT</span></div></div><div><h2>{title}</h2><strong>{record.number}</strong></div></div>
    <div className="document-meta"><div><span>{delivery || shipping ? 'Deliver to' : 'Customer'}</span><strong>{record.customerName}</strong>{(record.address || record.customerAddress) && <p>{record.address || record.customerAddress}</p>}{record.receivedBy && <p>Received by: {record.receivedBy}</p>}{shipping && record.carrier && <p>Carrier: {record.carrier}</p>}{shipping && record.trackingNumber && <p>Tracking: {record.trackingNumber}</p>}</div><dl><div><dt>{shipping ? 'Shipping date' : 'Date'}</dt><dd>{dateLabel(shipping ? record.shippingDate : record.orderDate || record.invoiceDate || record.deliveryDate)}</dd></div>{shipping && record.invoiceNumber && <div><dt>Invoice</dt><dd>{record.invoiceNumber}</dd></div>}{record.orderNumber && <div><dt>Sales order</dt><dd>{record.orderNumber}</dd></div>}{shipping && record.deliveryNumber && <div><dt>Delivery receipt</dt><dd>{record.deliveryNumber}</dd></div>}{record.dueDate && <div><dt>Due date</dt><dd>{dateLabel(record.dueDate)}</dd></div>}{record.status && <div><dt>Status</dt><dd><Badge>{record.status}</Badge></dd></div>}</dl></div>
    <div className="table-scroll"><table className="document-table"><thead><tr><th>Product</th><th>Unit</th><th className="numeric">Quantity</th>{!delivery && <><th className="numeric">Unit price</th><th className="numeric">Amount</th></>}</tr></thead><tbody>{(record.items || []).map((item, i) => <tr key={item.id || i}><td><strong>{item.productName}</strong><small>{item.sku}</small></td><td>{item.unit || '—'}</td><td className="numeric">{Number(item.quantity)}</td>{!delivery && <><td className="numeric">{unitMoney(item.unitPrice, record.currency)}</td><td className="numeric">{money(item.lineTotal ?? lineTotal(item), record.currency)}</td></>}</tr>)}</tbody></table></div>
    {!delivery && <div className="document-totals"><div><span>Total</span><strong>{money(record.total, record.currency)}</strong></div>{record.paidAmount !== undefined && <><div><span>Paid</span><span>{money(record.paidAmount, record.currency)}</span></div><div><span>Balance</span><strong>{money(Number(record.total) - Number(record.paidAmount), record.currency)}</strong></div></>}</div>}
    {record.notes && <div className="document-notes"><strong>Notes</strong><p>{record.notes}</p></div>}
    {delivery && <div className="signature-row"><div><span />Prepared by</div><div><span />Received by</div></div>}
    <div className="document-bottom">TLP Company · {record.number}</div>
  </div><div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={() => window.print()}><Icon name="file" size={17} />Print document</button></div></Modal>;
}
