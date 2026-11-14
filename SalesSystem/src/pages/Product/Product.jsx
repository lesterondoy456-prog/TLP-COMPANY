import React, { useEffect, useRef, useState } from 'react';
import { api, unitMoney, dateLabel } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { Badge } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import CreateProductForm from './CreateProductForm.jsx';
import ConfirmDelete from '../../components/ConfirmDelete.jsx';
const count = value => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 6
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
    <div className="product-monitor"><RecordsCard title="Product" label="Products" icon="box" addLabel="New product" rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} headers={<>
      <th className="product-code-column">Code</th><th className="product-description-column">Description</th>
      <th className="product-model-column">Model / Item code</th><th className="product-model-column">Category / Platform</th>
      <th className="product-small-column">Rev</th><th className="product-small-column">UOP</th><th className="product-small-column">UOP2</th>
      <th className="product-number-column numeric">Qty per UOP2</th><th className="product-number-column numeric">MOQ</th><th className="product-number-column numeric">SPQ</th>
      <th>VAT setting</th><th className="numeric">Unit cost</th><th className="numeric">Selling price</th><th className="product-small-column">Currency</th>
      <th className="product-approvals-column">Customer approvals</th><th className="product-model-column">Process</th>
      <th className="product-number-column numeric">Divisor</th><th className="product-number-column numeric">Weight</th>
      <th className="product-model-column">Product header</th><th>Tag color</th><th>Inventory setup</th>
      <th className="product-supplies-column">Linked supplies</th><th className="product-description-column">Remarks</th>
      <th className="product-number-column numeric">Stock on hand</th><th className="product-number-column">Status</th><th className="product-actions-column actions-heading">Actions</th>
    </>} renderRow={row => <>
      <td className="product-code-column"><div className="entity-cell"><span className="entity-icon product"><Icon name="box" size={18} /></span><strong>{row.sku || '—'}</strong></div></td>
      <td className="product-description-column">{row.description || (row.name !== row.sku ? row.name : null) || '—'}</td>
      <td>{row.model || '—'}</td><td>{row.category || '—'}</td><td>{row.revision ?? '—'}</td><td>{row.unit || '—'}</td><td>{row.secondaryUnit || '—'}</td>
      <td className="numeric">{row.quantityPerSecondaryUnit == null ? '—' : count(row.quantityPerSecondaryUnit)}</td><td className="numeric">{row.moq == null ? '—' : count(row.moq)}</td><td className="numeric">{row.spq == null ? '—' : count(row.spq)}</td>
      <td>{row.vatMode === 'customer' ? 'Customer setting' : row.vatMode === 'inclusive' ? 'Inclusive' : row.vatMode === 'exclusive' ? 'Exclusive' : '—'}</td>
      <td className="numeric">{row.unitCost == null ? '—' : row.currency ? unitMoney(row.unitCost, row.currency) : count(row.unitCost)}</td><td className="numeric product-price-cell">{row.price == null ? '—' : row.currency ? unitMoney(row.price, row.currency) : count(row.price)}</td><td>{row.currency || '—'}</td>
      <td className="product-approvals-column">{row.customerApprovals?.length ? row.customerApprovals.map((approval, index) => <div className="product-related-block" key={approval.customerId ?? index}><strong>{approval.customerName || '—'}</strong><span>Approval date · {dateLabel(approval.approvalDate)}</span><p>{approval.approvalRemarks || '—'}</p></div>) : '—'}</td>
      <td className="product-lines-cell">{(row.processes || []).map(process => process.name).filter(Boolean).join('\n') || '—'}</td>
      <td className="numeric">{row.divisor == null ? '—' : count(row.divisor)}</td><td className="numeric">{row.weight == null ? '—' : count(row.weight)}</td>
      <td><strong>{row.productHeaderCode || '—'}</strong>{row.productHeaderName && <small>{row.productHeaderName}</small>}</td><td>{row.tagColor || '—'}</td><td>{row.inventorySetup === 'monthly' ? 'Monthly' : row.inventorySetup === 'quarterly' ? 'Quarterly' : '—'}</td>
      <td className="product-supplies-column">{row.linkedSupplies?.length ? row.linkedSupplies.map((supply, index) => <div className="product-related-block" key={supply.suppliesId ?? index}><strong>{supply.name || supply.code || '—'}</strong><span>{supply.quantity == null ? '—' : count(supply.quantity)} {supply.unit || ''}</span></div>) : '—'}</td>
      <td className="product-lines-cell">{row.remarks || '—'}</td><td className={'numeric ' + (Number(row.stock) === 0 ? 'danger-text' : '')}>{row.stock == null ? '—' : count(row.stock)}</td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td>
      <td className="product-actions-column"><div className="row-actions"><button className="text-button" disabled={busyRow === row.id} onClick={() => details(row, 'edit')}>{busyRow === row.id ? 'Opening…' : 'Edit'}</button><button className="text-button danger-text" onClick={() => setDialog({ type: 'delete', record: row })}>Delete</button></div></td>
    </>} /></div>
    {['new', 'edit'].includes(dialog?.type) && <CreateProductForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'delete' && <ConfirmDelete record={dialog.record} onDelete={() => api('/api/sales/products/' + dialog.record.id, {
      method: 'DELETE'
    })} onClose={() => setDialog(null)} onSaved={result => saved(result, 'Record deleted.')} />}
  </>;
}
