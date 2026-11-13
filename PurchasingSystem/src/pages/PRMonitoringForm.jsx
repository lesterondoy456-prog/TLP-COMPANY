import React, { useEffect, useState } from 'react';
import { api, dateInput, today } from '../api.js';
import { ErrorNotice, Modal, focusModalControl } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';
import { useDocumentEditor, ReadonlyField, EntryFooter, ActorField, Totals, sourceItems } from '../components/DocumentControls.jsx';
import { currencyLabel, quantityLabel, statusLabel } from '../components/PurchasingDisplay.jsx';
import { calculateTotals, decimalString, decimalUnits } from '../purchaseMath.js';
import { validatePurchaseRequest, validatePurchaseOrder, validateReceiving } from '../helper/validation.js';

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
    const invalid = validatePurchaseRequest(form);
    if (editor.reject(invalid)) return;
    const body = { ...form, number: form.number.trim(), remarks: form.remarks.trim(), items: form.items.map(row => ({ suppliesId: Number(row.suppliesId), quantity: String(row.quantity), unit: row.unit, neededDate: row.neededDate || form.neededDate, remarks: (row.remarks || '').trim() })) };
    editor.setBusy(true);
    editor.setError('');
    try {
      const result = record
        ? await api(`/api/purchasing/purchase-requests/${record.id}`, { method: 'PUT', body })
        : await api('/api/purchasing/purchase-requests', { method: 'POST', body });
      onSaved(result);
    } catch (error) {
      editor.setError(error.message);
    } finally {
      editor.setBusy(false);
    }
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
