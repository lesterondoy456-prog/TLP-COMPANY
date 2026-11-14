import React, { useState } from 'react';
import { api, money, balanceAmount } from '../../api.js';
import { Modal, Field, FormFooter, ErrorNotice } from '../../components/UI.jsx';
import { validateInvoicePayment } from '../../helper/validation.js';
import useSave from '../../hooks/useSave.js';

export default function InvoicePaymentForm({ record, onClose, onSaved }) {
  const [amount, setAmount] = useState(record.paidAmount ?? 0);
  const { busy, error, save } = useSave(onSaved);
  const [validation, setValidation] = useState('');
  function submit(event) {
    event.preventDefault();
    setValidation('');
    const invalid = validateInvoicePayment(amount, record.total);
    if (invalid) { setValidation(invalid); return; }
    save(() => api('/api/sales/sales-invoices/' + record.id + '/payment', { method: 'PATCH', body: { paidAmount: String(amount) } }));
  }
  return <Modal title="Record payment" subtitle={record.number + ' · ' + record.customerName} onClose={onClose} busy={busy}>
    <form onSubmit={submit}>
      <div className="modal-body"><ErrorNotice message={validation || error} /><div className="document-summary"><div><span>Invoice total</span><strong>{money(record.total, record.currency, record.decimalInTotalPrice ?? 2)}</strong></div><div><span>Current balance</span><strong>{money(balanceAmount(record.total, record.paidAmount), record.currency, record.decimalInTotalPrice ?? 2)}</strong></div></div>
        <Field label={'Total received to date (' + (record.currency || 'PHP') + ') *'} hint="Enter the cumulative amount received, including earlier payments."><input type="number" min="0" max={record.total} step="0.000001" required value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} autoFocus /></Field>
      </div><FormFooter onClose={onClose} busy={busy} label="Save payment" />
    </form>
  </Modal>;
}
