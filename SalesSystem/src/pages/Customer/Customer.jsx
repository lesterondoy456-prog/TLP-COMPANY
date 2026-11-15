import React, { useState } from 'react';
import { api, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Badge } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateCustomerForm from './CreateCustomerForm.jsx';
import ConfirmDelete from '../../components/ConfirmDelete.jsx';
export default function CustomerPage({
  data,
  user,
  loading,
  loaded,
  onReload,
  onSaved,
  overview
}) {
  const [dialog, setDialog] = useState(null);
  const rows = data['customers'];
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  return <>
    <PageHeading title="Customer" description="Build better relationships. Keep every customer detail organized." addLabel="New customer" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <div className="customer-monitor">
      <RecordsCard title="Customer" label="Customers" icon="users" addLabel="New customer" mobilePreview={['Short name', 'Contact person', 'Sales address', 'DR address']} rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<>
        <th className="customer-name-column">Name</th>
        <th>Short name</th><th>Business style</th>
        <th className="customer-address-column">Sales address</th>
        <th className="customer-address-column">DR address</th>
        <th>TIN</th><th>Contact person</th><th>Phone</th><th>Fax</th>
        <th>Country of origin</th><th>Country</th><th className="customer-email-column">Email</th>
        <th>Payment term</th><th>Category</th>
        <th className="customer-number-column numeric">Price decimals</th><th className="customer-number-column numeric">Total decimals</th>
        <th>VAT mode</th><th>VAT code</th><th>Tax code</th><th>Last sales date</th>
        <th className="customer-notes-column">Remarks</th><th className="customer-status-column">Status</th>
        <th className="customer-actions-column actions-heading">Actions</th>
      </>} renderRow={row => {
        const deliveryAddresses = (row.deliveryAddresses || []).filter(address => typeof address === 'string' && address.trim());
        return <>
          <td className="customer-name-column"><div className="entity-cell"><span className="entity-icon"><Icon name="users" size={18} /></span><div><strong>{row.name || '—'}</strong></div></div></td>
          <td>{row.shortName || '—'}</td><td>{row.businessStyle || '—'}</td>
          {[row.salesAddressType, row.drAddressType].map((type, index) => <td className="customer-address-column" key={index}>
            {type === 'office' || type === 'delivery' ? <div className="customer-address-block">
              <span className="customer-address-label">{type === 'office' ? 'Office address' : 'Delivery address'}</span>
              {type === 'office' ? <p>{row.address || '—'}</p> : deliveryAddresses.length ? deliveryAddresses.map((address, addressIndex) => <p key={addressIndex}>{address}</p>) : <p>—</p>}
            </div> : '—'}
          </td>)}
          <td>{row.tin || '—'}</td><td>{row.contactPerson || '—'}</td><td>{row.cpnumber || '—'}</td><td>{row.faxNo || '—'}</td>
          <td>{row.countryOfOrigin || '—'}</td><td>{row.country || '—'}</td><td className="customer-email-column">{row.email || '—'}</td>
          <td>{row.paymentTerm || '—'}</td><td>{row.category || '—'}</td>
          <td className="numeric">{row.decimalInPrice ?? '—'}</td><td className="numeric">{row.decimalInTotalPrice ?? '—'}</td>
          <td>{row.vatInclusive == null ? '—' : row.vatInclusive ? 'Inclusive' : 'Exclusive'}</td><td>{row.vatCode || '—'}</td><td>{row.taxCode || '—'}</td><td>{dateLabel(row.lastSalesDate)}</td>
          <td className="customer-notes-column">{row.remarks || '—'}</td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td>
          <td className="customer-actions-column"><div className="row-actions"><button className="text-button" onClick={() => setDialog({ type: 'edit', record: row })}>Edit</button><button className="text-button danger-text" onClick={() => setDialog({ type: 'delete', record: row })}>Delete</button></div></td>
        </>;
      }} />
    </div>
    {['new', 'edit'].includes(dialog?.type) && <CreateCustomerForm record={dialog.record} customers={data.customers} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'delete' && <ConfirmDelete record={dialog.record} onDelete={() => api('/api/sales/customers/' + dialog.record.id, {
      method: 'DELETE'
    })} onClose={() => setDialog(null)} onSaved={result => saved(result, 'Record deleted.')} />}
  </>;
}
