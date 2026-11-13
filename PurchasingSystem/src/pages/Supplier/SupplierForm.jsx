import React, { useEffect, useState } from 'react';
import { api, dateInput } from '../../api.js';
import { ErrorNotice, Modal, focusModalControl } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import { textValues, useMasterForm, FormTabs, MasterFooter } from '../../components/MasterControls.jsx';
import { SUPPLIER_TEXT, SUPPLIES_TEXT, validateSupplier, validateSupplies } from '../../helper/validation.js';

export function SupplierForm({ record, options, onClose, onSaved }) {
  const editor = useMasterForm(() => ({
    ...textValues(SUPPLIER_TEXT, record),
    decimalInPrice: record?.decimalInPrice ?? 2,
    decimalInTotalPrice: record?.decimalInTotalPrice ?? 2,
    vatInclusive: record?.vatInclusive === true,
    isActive: record?.isActive !== false,
  }), SUPPLIER_TEXT);
  const { form, set, props, errorFor, textField, choiceField } = editor;
  const paymentTerms = (options.paymentTerms || []).map(row => ({ value: row.name || row.description || '', label: row.name || row.description || '' }));
  const vatCodes = (options.vatCodes || []).map(row => ({ value: row.code || row.name || '', label: [row.code || row.name, row.description, row.rate != null ? row.rate + '%' : ''].filter(Boolean).join(' · ') }));
  const taxCodes = (options.taxCodes || []).map(row => ({ value: row.code || row.name || '', label: [row.code || row.name, row.description].filter(Boolean).join(' · ') }));

  useEffect(() => {
    if (!editor.focusTarget) return;
    focusModalControl(editor.controls.current[editor.focusTarget]);
    editor.setFocusTarget(null);
  }, [editor.focusTarget]);

  async function submit(event) {
    event.preventDefault();
    if (editor.busy) return;
    const invalid = validateSupplier(form);
    editor.setErrors(invalid);
    editor.setError('');
    const first = Object.keys(invalid)[0];
    if (first) {
      editor.setError('Please correct the highlighted fields before saving.');
      editor.focus(first);
      return;
    }
    const body = Object.fromEntries(Object.keys(SUPPLIER_TEXT).map(key => [key, String(form[key]).trim()]));
    Object.assign(body, { decimalInPrice: Number(form.decimalInPrice), decimalInTotalPrice: Number(form.decimalInTotalPrice), vatInclusive: form.vatInclusive, isActive: form.isActive });
    editor.setBusy(true);
    try {
      const result = record
        ? await api(`/api/purchasing/suppliers/${record.id}`, { method: 'PUT', body })
        : await api('/api/purchasing/suppliers', { method: 'POST', body });
      onSaved(result);
    } catch (error) {
      editor.setError(error.message);
    } finally {
      editor.setBusy(false);
    }
  }

  return <Modal title={record ? 'Edit supplier' : 'New supplier'} subtitle="Supplier information, purchase order preferences, and tax settings." className="purchase-master-modal" onClose={onClose} busy={editor.busy}>
    <form onSubmit={submit} noValidate>
      <FormTabs tabs={[{ id: 'basic', title: 'Basic Info' }]} active="basic" onChange={() => {}} id={editor.id} disabled={editor.busy} />
      <div className="modal-body purchase-form-body"><ErrorNotice message={editor.error} />
        <fieldset disabled={editor.busy}>
          <div role="tabpanel" id={editor.id + '-panel-basic'} aria-labelledby={editor.id + '-tab-basic'}>
            <div className="purchase-master-layout">
              <section className="purchase-section"><h3>Basic Information</h3><div className="purchase-fields">
                <label className="field"><span>Supplier Id</span><input readOnly value={record?.id ?? ''} /></label>
                {textField('name', { wide: true })}{textField('shortName')}{textField('businessStyle')}
                {textField('address', { wide: true, multiline: true })}{textField('remarks', { wide: true, multiline: true })}
              </div></section>
              <section className="purchase-section"><h3>Other Information</h3><div className="purchase-fields">
                {textField('tin')}{textField('contactPerson')}{textField('email', { wide: true, type: 'email' })}
                {choiceField('countryOfOrigin', options.countries || [], 'name')}{choiceField('country', options.countries || [], 'name')}
                {textField('cpnumber', { type: 'tel' })}{textField('faxNo', { type: 'tel' })}
              </div></section>
              <section className="purchase-section"><h3>PO</h3><div className="purchase-fields">
                {[['decimalInPrice', 'Decimal in Price *'], ['decimalInTotalPrice', 'Decimal in Total Price *']].map(([key, label]) => <label className="field" key={key}><span>{label}</span><input {...props(key, label)} type="number" min={0} max={6} step={1} value={form[key]} onChange={event => set(key, event.target.value)} />{errorFor(key)}</label>)}
                {choiceField('paymentTerm', paymentTerms, 'value', { wide: true, labelKey: 'label' })}
              </div></section>
              <section className="purchase-section"><h3>TAX</h3><div className="purchase-fields">
                {choiceField('vatCode', vatCodes, 'value', { wide: true, labelKey: 'label', optional: false })}
                <fieldset className="purchase-radio-group purchase-span-2" aria-label="VAT calculation"><legend className="sr-only">VAT calculation</legend><label><input type="radio" name="supplierVat" checked={form.vatInclusive} onChange={() => set('vatInclusive', true)} />Inclusive</label><label><input type="radio" name="supplierVat" checked={!form.vatInclusive} onChange={() => set('vatInclusive', false)} />Exclusive</label></fieldset>
                {choiceField('taxCode', taxCodes, 'value', { wide: true, labelKey: 'label' })}
              </div></section>
            </div>
          </div>
        </fieldset>
      </div>
      <MasterFooter active={form.isActive} onActive={value => set('isActive', value)} onClose={onClose} busy={editor.busy} label="Save supplier" />
    </form>
  </Modal>;
}
