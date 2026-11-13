import React, { useEffect, useState } from 'react';
import { api, dateInput, today } from '../../api.js';
import { ErrorNotice, Modal, focusModalControl } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import { useDocumentEditor, ReadonlyField, EntryFooter, ActorField, Totals, sourceItems } from '../../components/DocumentControls.jsx';
import { currencyLabel, quantityLabel, statusLabel } from '../../components/PurchasingDisplay.jsx';
import { calculateTotals, decimalString, decimalUnits } from '../../purchaseMath.js';
import { validatePurchaseRequest, validatePurchaseOrder, validateReceiving } from '../../helper/validation.js';

export function CreatePurchaseOrderForm({ record, requests, options, user, onClose, onSaved }) {
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
      const price = (supply?.suppliers || []).find(item => Number(item.supplierId) === Number(form.supplierId))?.price ?? '';
      return { requestItemId: row.id, quantity: row.balanceQuantity, unitPrice: price, discountRate: '', remarks: '', unit: row.unit };
    });
    editor.set('items', [...form.items, ...items].slice(0, 100));
    setSelectedRequests([]);
    setShowRequests(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (editor.busy) return;
    const invalid = validatePurchaseOrder(form);
    if (editor.reject(invalid)) return;
    const body = {
      supplierId: Number(form.supplierId), poDate: form.poDate, deliveryDate: form.deliveryDate, currency: form.currency, rate: String(form.rate), paymentTerm: form.paymentTerm,
      shipment: form.shipment, suppliesCategory: form.suppliesCategory || null, vatCode: form.vatCode, deliveryAddress: form.deliveryAddress.trim() || null, remarks: form.remarks.trim() || null,
      items: form.items.map(row => ({ requestItemId: Number(row.requestItemId), quantity: String(row.quantity), unitPrice: String(row.unitPrice), discountRate: row.discountRate == null || String(row.discountRate).trim() === '' ? null : String(row.discountRate), currency: form.currency, unit: row.unit || '', remarks: String(row.remarks ?? '').trim() || null })),
    };
    editor.setBusy(true);
    editor.setError('');
    try {
      const result = record
        ? await api(`/api/purchasing/purchase-orders/${record.id}`, { method: 'PUT', body })
        : await api('/api/purchasing/purchase-orders', { method: 'POST', body });
      onSaved(result);
    } catch (error) {
      editor.setError(error.message);
    } finally {
      editor.setBusy(false);
    }
  }

  return <Modal title={record ? 'Edit purchase order' : 'New purchase order'} subtitle="Load posted purchase request lines and prepare the supplier order." className="purchase-document-modal" onClose={onClose} busy={editor.busy}>
    <form onSubmit={submit} noValidate><div className="modal-body purchase-form-body"><ErrorNotice message={editor.error} /><fieldset disabled={editor.busy}>
      <section className="purchase-section"><h3>Purchase Order</h3><div className="purchase-header-grid">
        <ReadonlyField label="Branch *" value="TTI Laguna Philippines Inc." /><ReadonlyField label="PO #" value={record?.number || ''} />
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
            <td><input {...props('items.' + index + '.discountRate', 'Discount Rate ' + (index + 1))} type="number" min={0} max={100} step="0.000001" value={row.discountRate ?? ''} onChange={event => editor.updateItem(index, 'discountRate', event.target.value)} />{feedback('items.' + index + '.discountRate')}</td>
            <td className="numeric">{quantityLabel(values.discountAmount)}</td><td className="numeric">{quantityLabel(calculation.vatRate)}</td><td className="numeric">{quantityLabel(values.netAmount)}</td><td className="numeric">{quantityLabel(values.amount)}</td><td>{source.sourceNumber || row.requestNumber}</td>
            <td><button type="button" className="icon-button danger-text" aria-label={'Remove PO line ' + (index + 1)} onClick={() => editor.set('items', form.items.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={16} /></button></td>
          </tr>;
        })}{!form.items.length && <tr><td colSpan={16} className="purchase-empty-rows">Use Load Open PR to select posted request lines.</td></tr>}</tbody></table></div>
      </section>
    </fieldset></div><EntryFooter onClose={onClose} busy={editor.busy} label="Save purchase order" /></form>
  </Modal>;
}
