import React, { useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Avatar, Badge, roleLabel } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateProductForm from './CreateProductForm.jsx';
import ConfirmDelete from '../../components/ConfirmDelete.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
export default function ProductPage({
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
  const rows = data['products'];
  function saved(result, message) {
    setDialog(null);
    onSaved(result, message);
  }
  async function details(row, type = 'view') {
    const request = ++detailSequence.current;
    setBusyRow(row.id);
    onError('');
    try {
      const result = await api('/api/sales/products/' + row.id);
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
    <PageHeading title="Product" description="Your product catalog, pricing, and stock in one place." addLabel="New product" loading={loading} onAdd={() => setDialog({
      type: 'new'
    })} />
    {overview}
    <RecordsCard title="Product" label="Products" icon="box" addLabel="New product" rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<><><th>Product</th><th>Unit</th><th className="numeric">Selling price</th><th className="numeric">Stock on hand</th><th>Status</th></><th className="actions-heading">Actions</th></>} renderRow={row => <><><td><div className="entity-cell"><span className="entity-icon product"><Icon name="box" size={18} /></span><div><strong>{row.name}</strong><small>{row.sku}</small></div></div></td><td>{row.unit}</td><td className="numeric">{(row.price == null ? '—' : unitMoney(row.price, row.currency))}</td><td className={'numeric ' + (Number(row.stock) === 0 ? 'danger-text' : '')}>{count(row.stock)}</td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td></><td><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row, 'edit')}>{busyRow === row.id ? 'Opening?' : 'Edit'}</button><button className="text-button danger-text" onClick={() => setDialog({
            type: 'delete',
            record: row
          })}>Delete</button></div></td></>} />
    {['new', 'edit'].includes(dialog?.type) && <CreateProductForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'delete' && <ConfirmDelete record={dialog.record} onDelete={() => api('/api/sales/products/' + dialog.record.id, {
      method: 'DELETE'
    })} onClose={() => setDialog(null)} onSaved={result => saved(result, 'Record deleted.')} />}
  </>;
}
