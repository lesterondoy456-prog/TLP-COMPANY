import React, { useState } from 'react';
import { api, money, unitMoney, today, dateInput, dateLabel } from '../../api.js';
import { salesLineTotal as lineTotal, salesTotal } from '../../salesPricing.mjs';
import { Icon } from '../../components/Icons.jsx';
import { Modal, Field, FormFooter, ErrorNotice, Badge, PhotoField, roleLabel } from '../../components/UI.jsx';
import useSave from '../../hooks/useSave.js';

export default function InvoicePaymentForm({ record, onClose, onSaved }) {
  const [amount, setAmount] = useState(record.paidAmount ?? 0);
  const { busy, error, save } = useSave(onSaved);
  return <Modal title="Record payment" subtitle={record.number + ' · ' + record.customerName} onClose={onClose} busy={busy}>
    <form onSubmit={event => { event.preventDefault(); save(() => api('/api/sales/sales-invoices/' + record.id + '/payment', { method: 'PATCH', body: { paidAmount: Number(amount) } })); }}>
      <div className="modal-body"><ErrorNotice message={error} /><div className="document-summary"><div><span>Invoice total</span><strong>{money(record.total, record.currency)}</strong></div><div><span>Current balance</span><strong>{money(Number(record.total) - Number(record.paidAmount), record.currency)}</strong></div></div>
        <Field label={'Total received to date (' + (record.currency || 'PHP') + ') *'} hint="Enter the cumulative amount received, including earlier payments."><input type="number" min="0" max={record.total} step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} autoFocus /></Field>
      </div><FormFooter onClose={onClose} busy={busy} label="Save payment" />
    </form>
  </Modal>;
}
