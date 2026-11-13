import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import { Avatar, Badge, roleLabel } from '../components/UI.jsx';
import RecordsCard, { PageHeading } from '../components/RecordsCard.jsx';
import Form from './Customer/Form.jsx';
import ConfirmDelete from '../components/ConfirmDelete.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
export default function CustomerPage({
  data,
  user,
  loading,
  loaded,
  onReload,
  onSaved,
  onError,
  overview
}) {
  const [dialog, setDialog] = useState(null);
  const [busyRow, setBusyRow] = useState(null);
  const detailSequence = useRef(0);
  useEffect(() => () => {
    detailSequence.current++;
  }, []);
  const rows = data['customers'];
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  async function details(row, type = 'view') {
    const request = ++detailSequence.current;
    setBusyRow(row.id);
    onError('');
    try {
      const result = await api('/api/sales/customers/' + row.id);
      if (detailSequence.current === request) setDialog({
        type,
        record: result.record
      });
    } catch (error) {
      if (detailSequence.current === request) onError(error.message);
    } finally {
      if (detailSequence.current === request) setBusyRow(null);
    }
  }
  return <>
    <PageHeading title="Customer" description="Build better relationships. Keep every customer detail organized." addLabel="New customer" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="Customer" label="Customers" icon="users" addLabel="New customer" rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><><th>Customer</th><th>Contact person</th><th>Contact details</th><th>Status</th></><th className="actions-heading">Actions</th></>} renderRow={row => <><><td><div className="entity-cell"><span className="entity-icon"><Icon name="users" size={18} /></span><div><strong>{row.name}</strong><small>{row.code}</small></div></div></td><td>{row.contactPerson || '—'}</td><td><span>{row.email || '—'}</span><small>{row.cpnumber || ''}</small></td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td></><td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => setDialog({
            type: 'edit',
            record: row
          })}>{busyRow === row.id ? 'Opening?' : 'Edit'}</button><button className="text-button danger-text" onClick={() => setDialog({
            type: 'delete',
            record: row
          })}>Delete</button></div></td></>} />
    {['new', 'edit'].includes(dialog?.type) && <Form record={dialog.record} customers={data.customers} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'delete' && <ConfirmDelete record={dialog.record} onDelete={() => api('/api/sales/customers/' + dialog.record.id, {
      method: 'DELETE'
    })} onClose={() => setDialog(null)} onSaved={result => saved(result, 'Record deleted.')} />}
  </>;
}
