import React, { useEffect, useRef, useState } from 'react';
import { api, dateInput, today } from '../../api.js';
import { ErrorNotice, Modal, focusModalControl } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import { useDocumentEditor, ReadonlyField, EntryFooter, ActorField, Totals, sourceItems } from '../../components/DocumentControls.jsx';
import { currencyLabel, quantityLabel, statusLabel } from '../../components/PurchasingDisplay.jsx';
import { calculateTotals, decimalString, decimalUnits } from '../../purchaseMath.js';
import { validatePurchaseRequest, validatePurchaseOrder, validateReceiving } from '../../helper/validation.js';

function allocationUnits(item) {
  return (item.allocations || []).reduce((total, row) => {
    try { return total + decimalUnits(row.quantity, 6); } catch { return total; }
  }, 0n);
}

export function CreateReceivingReceiptForm({ record, orders, options, user, onClose, onSaved }) {
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
    const invalid = validateReceiving(form);
    if (![order?.supplierName || record?.supplierName, currency, order?.vatCode || record?.vatCode].every(value => typeof value === 'string' && value.trim())) {
      invalid.purchaseOrderId = 'Select a purchase order with Supplier, Currency, and VAT Code before saving.';
    }
    const first = editor.reject(invalid);
    if (first) {
      setTab(first.includes('.allocations') ? 'summary' : 'info');
      return;
    }
    const body = {
      purchaseOrderId: Number(form.purchaseOrderId), srrDate: form.srrDate, drNumber: form.drNumber.trim() || null, pezaReference: form.pezaReference.trim() || null,
      invoiceNumber: form.invoiceNumber.trim(), invoiceDate: form.invoiceDate || null, rate: String(form.rate), remarks: form.remarks.trim() || null,
      items: form.items.map(item => ({
        orderItemId: Number(item.orderItemId), quantity: String(item.quantity), unit: item.unit || '', remarks: String(item.remarks ?? '').trim() || null,
        allocations: item.allocations.map(row => ({
          quantity: String(row.quantity), expiryDate: row.expiryDate || null, mfgDate: row.mfgDate || null, imLot: (row.imLot || '').trim() || null, qcStatus: (row.qcStatus || '').trim() || null,
          warehouseId: row.warehouseId === '' || row.warehouseId == null ? null : Number(row.warehouseId),
          locationId: row.locationId === '' || row.locationId == null ? null : Number(row.locationId),
        })),
      })),
    };
    editor.setBusy(true);
    editor.setError('');
    try {
      const result = record
        ? await api(`/api/purchasing/receivings/${record.id}`, { method: 'PUT', body })
        : await api('/api/purchasing/receivings', { method: 'POST', body });
      onSaved(result);
    } catch (error) {
      editor.setError(error.message);
    } finally {
      editor.setBusy(false);
    }
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
            <ReadonlyField label="Branch *" value="TTI Laguna Philippines Inc." /><ReadonlyField label="SRR #" value={record?.number || ''} />
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
