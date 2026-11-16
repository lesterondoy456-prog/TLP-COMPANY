import React, { useState } from 'react';
import { Icon } from '../../components/Icons.jsx';
import { Badge } from '../../components/UI.jsx';
import RecordsCard, { PageHeading } from '../../components/RecordsCard.jsx';
import { manualStockIssue } from '../../helper/validation.js';
import ManualStockMovementForm from './ManualStockMovementForm.jsx';
import InventoryTransactions from './InventoryTransactions.jsx';
import './Inventory.css';

const quantity = value => value == null || value === '' || !Number.isFinite(Number(value))
  ? '—' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(typeof value === 'string' ? value.trim() : value);

export default function InventoryPage({ data, loading, loaded, onReload, onSaved }) {
  const [dialog, setDialog] = useState(null);
  const [stockStatus, setStockStatus] = useState('all');
  const [productStatus, setProductStatus] = useState('all');
  const products = data.products.map(product => {
    const stock = product.stock == null || product.stock === '' ? null : Number(product.stock);
    const stockState = stock == null || !Number.isFinite(stock) ? 'not-set' : stock > 0 ? 'in-stock' : 'out-of-stock';
    return { ...product, stockState, stockStatus: stockState === 'in-stock' ? 'In stock' : stockState === 'out-of-stock' ? 'Out of stock' : 'Not set' };
  });
  const rows = products.filter(product => (stockStatus === 'all' || product.stockState === stockStatus)
    && (productStatus === 'all' || Boolean(product.isActive) === (productStatus === 'active')));
  const selectedProduct = data.products.find(product => product.id === dialog?.productId);
  function saved(result, message) { setDialog(null); onSaved(result, message); }
  const summary = [
    { label: 'Products', count: products.length, icon: 'grid' },
    { label: 'In stock', count: products.filter(product => product.stockState === 'in-stock').length, icon: 'box' },
    { label: 'Out of stock', count: products.filter(product => product.stockState === 'out-of-stock').length, icon: 'bag' },
  ];

  return <div className="inventory-page">
    <PageHeading title="Inventory" description="Monitor current finished-product stock by product and unit of measure." />
    <section className="inventory-summary" aria-label="Inventory summary" aria-busy={!loaded}>
      {summary.map(item => <article key={item.label}><div><span>{item.label}</span><Icon name={item.icon} size={17} /></div>{loaded ? <strong>{item.count.toLocaleString('en-PH')}</strong> : <span className="skeleton-bar" aria-label="Loading inventory count" />}</article>)}
    </section>
    <div className="inventory-filters">
      <label>Stock status<select aria-label="Stock status" value={stockStatus} onChange={event => setStockStatus(event.target.value)}><option value="all">All stock</option><option value="in-stock">In stock</option><option value="out-of-stock">Out of stock</option><option value="not-set">Not set</option></select></label>
      <label>Product status<select aria-label="Product status" value={productStatus} onChange={event => setProductStatus(event.target.value)}><option value="all">All products</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    </div>
    <RecordsCard title="Inventory" label="Product inventory" icon="grid" rows={rows} loading={loading} loaded={loaded} onRefresh={onReload} emptyTitle="No inventory records" emptyDetail={products.length ? 'No products match the selected stock and product filters.' : 'Products appear here after they are added in the Product tab.'} mobilePreview={['Description', 'UOP', 'Stock on hand', 'Product status']} headers={<>
      <th>Product code</th><th>Description</th><th>UOP</th><th className="numeric">Stock on hand</th><th>Status</th><th>Category</th><th>Product status</th><th className="actions-heading inventory-actions-column">Actions</th>
    </>} renderRow={product => {
      const issue = manualStockIssue(product);
      return <>
      <td><div className="entity-cell"><span className="entity-icon product"><Icon name="box" size={18} /></span><strong>{product.sku || '—'}</strong></div></td>
      <td className="inventory-description">{product.description || (product.name !== product.sku ? product.name : null) || '—'}</td><td>{product.unit || '—'}</td><td className="numeric inventory-quantity">{quantity(product.stock)}</td>
      <td><Badge value={product.stockState === 'in-stock' ? 'active' : product.stockState === 'out-of-stock' ? 'unpaid' : 'draft'}>{product.stockStatus}</Badge></td><td>{product.category || '—'}</td><td><Badge value={product.isActive ? 'active' : 'inactive'}>{product.isActive ? 'Active' : 'Inactive'}</Badge></td>
      <td className="inventory-actions-column"><div className="inventory-actions">
        <button className="icon-button" aria-label="View transactions" title="View transactions" onClick={() => setDialog({ type: 'transactions', productId: product.id })}><Icon name="clock" size={18} /></button>
        <button className="icon-button inventory-stock-in" aria-label="Manual stock in" title={issue ? 'Manual stock in: ' + issue : 'Manual stock in'} disabled={Boolean(issue)} onClick={() => setDialog({ type: 'in', productId: product.id })}><Icon name="arrowDown" size={18} /></button>
        <button className="icon-button inventory-stock-out" aria-label="Manual stock out" title={issue ? 'Manual stock out: ' + issue : 'Manual stock out'} disabled={Boolean(issue)} onClick={() => setDialog({ type: 'out', productId: product.id })}><Icon name="arrowUp" size={18} /></button>
      </div></td>
    </>;
    }} />
    {dialog?.type === 'transactions' && <InventoryTransactions key={'transactions:' + dialog.productId} product={selectedProduct} productId={dialog.productId} onClose={() => setDialog(null)} />}
    {['in', 'out'].includes(dialog?.type) && <ManualStockMovementForm key={dialog.type + ':' + dialog.productId} product={selectedProduct} productId={dialog.productId} direction={dialog.type} onClose={() => setDialog(null)} onSaved={saved} />}
  </div>;
}
