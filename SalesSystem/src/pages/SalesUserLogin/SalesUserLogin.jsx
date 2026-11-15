import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Avatar, Badge, roleLabel } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import SalesUserForm from './SalesUserForm.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
export default function SalesUserLoginPage({
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
  const isAdmin = user.role === 'admin';
  const ownUsers = data.users.filter(record => record.system === user.system);
  const rows = isAdmin ? ownUsers : ownUsers.filter(record => record.role === 'sales');
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  return <>
    <PageHeading title="SalesUserLogin" description="Manage your team, their profiles, and access to the workspace." addLabel="New user" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="SalesUserLogin" label="User accounts" icon="shield" addLabel="New user" mobilePreview={['Username', 'Mobile number', 'Role']} rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><><th>Team member</th><th>Username</th><th>Mobile number</th><th>Role</th><th>Status</th></>{isAdmin && <th className="actions-heading">Actions</th>}</>} renderRow={row => <><><td><div className="entity-cell"><Avatar user={row} /><div><strong>{row.name}{row.system === user.system && row.id === user.id && <span className="you-label">you</span>}</strong><small>{row.email || '—'}</small></div></div></td><td>{row.username}</td><td>{row.cpnumber || '—'}</td><td><Badge value={row.role}>{roleLabel(row.role)}</Badge></td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td></>{isAdmin && <td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => setDialog({
            type: 'edit',
            record: row
          })}>{busyRow === row.id ? 'Opening?' : 'Edit'}</button></div></td>}</>} />
    {['new', 'edit'].includes(dialog?.type) && <SalesUserForm record={dialog.record} actorRole={user.role} onClose={() => setDialog(null)} onSaved={saved} />}
  </>;
}
