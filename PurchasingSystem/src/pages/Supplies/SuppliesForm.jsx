import React, { useEffect, useState } from 'react';
import { api, dateInput } from '../../api.js';
import { ErrorNotice, Modal, focusModalControl } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import { textValues, useMasterForm, FormTabs, MasterFooter } from '../../components/MasterControls.jsx';
import { SUPPLIER_TEXT, SUPPLIES_TEXT, validateSupplier, validateSupplies } from '../../helper/validation.js';

export function SuppliesForm({ record, options, onClose, onSaved }) {
  const editor = useMasterForm(() => ({
    ...textValues(SUPPLIES_TEXT, record),
    productId: record?.productId ?? '',
    minimumStock: record?.minimumStock ?? '',
    thickness: record?.thickness ?? '',
    netWeight: record?.netWeight ?? '',
    inventorySetup: record?.inventorySetup || '',
    inventorySchedules: (record?.inventorySchedules || []).map(row => ({ scheduleDate: dateInput(row.scheduleDate), month: row.month || '' })),
    suppliers: (record?.suppliers || []).map(row => ({ ...row })),
    isActive: record?.isActive !== false,
  }), SUPPLIES_TEXT);
  const [tab, setTab] = useState('basic');
  const { form, setForm, set, props, errorFor, textField, choiceField, numberField } = editor;

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
    const invalid = validateSupplies(form);
    editor.setErrors(invalid);
    editor.setError('');
    const first = Object.keys(invalid)[0];
    if (first) {
      setTab(first.startsWith('inventory') ? 'inventory' : 'basic');
      editor.focus(first);
      editor.setError('Please correct the highlighted fields before saving.');
      return;
    }
    const body = {
      ...Object.fromEntries(Object.keys(SUPPLIES_TEXT).map(key => [key, String(form[key] ?? '').trim() || null])),
      productId: form.productId === '' ? null : Number(form.productId),
      minimumStock: String(form.minimumStock ?? '').trim() === '' ? null : Number(form.minimumStock), thickness: String(form.thickness ?? '').trim() === '' ? null : Number(form.thickness), netWeight: String(form.netWeight ?? '').trim() === '' ? null : Number(form.netWeight),
      inventorySetup: form.inventorySetup || null,
      inventorySchedules: form.inventorySchedules.map(row => ({ scheduleDate: row.scheduleDate || null, month: (row.month || '').trim() || null })),
      suppliers: form.suppliers.map(row => ({ supplierId: Number(row.supplierId), moq: String(row.moq ?? '').trim() === '' ? null : Number(row.moq), price: String(row.price ?? '').trim() === '' ? null : Number(row.price), currency: row.currency || null, remarks: (row.remarks || '').trim() || null })),
      isActive: form.isActive,
    };
    editor.setBusy(true);
    try {
      const result = record
        ? await api(`/api/purchasing/supplies/${record.id}`, { method: 'PUT', body })
        : await api('/api/purchasing/supplies', { method: 'POST', body });
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
            </div></section>
            <section className="purchase-section"><h3>Other Information</h3><div className="purchase-fields">
              {numberField('minimumStock', 'Minimum Stock')}{textField('color')}{numberField('thickness', 'Thickness')}
              {choiceField('unit', options.units || [], 'name', { optional: false })}{numberField('netWeight', 'Net Weight')}{choiceField('weightUnit', options.units || [], 'name')}
              {choiceField('category', options.suppliesCategories || [], 'name', { wide: true })}
            </div></section>
            <section className="purchase-section purchase-span-2">
              <div className="purchase-section-heading"><h3>Supplier</h3><button type="button" className="button secondary small" disabled={form.suppliers.length >= 100} onClick={() => set('suppliers', [...form.suppliers, { supplierId: '', moq: '', price: '', currency: '', remarks: '' }])}>Add supplier</button></div>
              <div className="table-scroll purchase-entry-table"><table><thead><tr><th>Supplier</th><th>MOQ</th><th>Price</th><th>Curr</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>{form.suppliers.map((row, index) => <tr key={index}>
                <td><select {...props('suppliers.' + index + '.supplierId', 'Supplier ' + (index + 1))} value={row.supplierId} onChange={event => updateRow('suppliers', index, 'supplierId', event.target.value)}><option value="">Select supplier</option>{(options.suppliers || []).map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>{errorFor('suppliers.' + index + '.supplierId')}</td>
                <td><input {...props('suppliers.' + index + '.moq', 'Supplier MOQ ' + (index + 1))} type="number" min={0} max={1e9} step="0.000001" value={row.moq ?? ''} onChange={event => updateRow('suppliers', index, 'moq', event.target.value)} />{errorFor('suppliers.' + index + '.moq')}</td>
                <td><input {...props('suppliers.' + index + '.price', 'Supplier Price ' + (index + 1))} type="number" min={0} max={1e9} step="0.000001" value={row.price ?? ''} onChange={event => updateRow('suppliers', index, 'price', event.target.value)} />{errorFor('suppliers.' + index + '.price')}</td>
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
