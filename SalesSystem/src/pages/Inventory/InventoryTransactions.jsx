import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, dateLabel } from '../../api.js';
import { Modal, Badge, ErrorNotice, LoadingSkeleton } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import RecordsCard from '../../components/RecordsCard.jsx';
import { useRealtimeRefresh } from '../../hooks/useRealtime.js';

const quantity = value => value == null || value === '' ? '\u2014' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value);
const movementLabel = type => ({ 'manual-in': 'Manual stock in', 'manual-out': 'Manual stock out', 'delivery-out': 'Delivery receipt' })[type] || type || '\u2014';
const recordedAt = value => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '\u2014';
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
};

export default function InventoryTransactions({ product, productId, onClose }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const request = useRef(null);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const result = await api('/api/sales/products/' + productId + '/stock-movements', { signal: controller.signal });
      if (current !== sequence.current) return;
      setSnapshot({ product: result.product, records: result.records || [] });
      setLoaded(true);
    } catch (failure) {
      if (current === sequence.current && failure.name !== 'AbortError') setError(failure.message);
    } finally { if (current === sequence.current) setLoading(false); }
  }, [productId]);
  useEffect(() => {
    load();
    return () => { sequence.current++; request.current?.abort(); };
  }, [load]);
  useRealtimeRefresh(change => {
    if (change.resources?.some(resource => ['*', 'products', 'stock-movements', 'delivery-receipts'].includes(resource))) load();
  });
  const currentProduct = snapshot?.product || product;
  const records = snapshot?.records || [];

  return <Modal wide title="Inventory transactions" subtitle={currentProduct?.sku || 'Product inventory'} className="inventory-transactions" onClose={onClose}>
    <div className="modal-body inventory-transactions-body">
      <dl className="inventory-product-summary">
        <div className="inventory-product-wide"><dt>Product</dt><dd><strong>{currentProduct?.sku || '\u2014'}</strong>{currentProduct?.description && <small>{currentProduct.description}</small>}</dd></div>
        <div><dt>UOP</dt><dd>{currentProduct?.unit || '\u2014'}</dd></div>
        <div><dt>Current stock</dt><dd>{quantity(currentProduct?.stock)}</dd></div>
      </dl>
      <ErrorNotice message={error} />
      {error && <button className="button secondary small inventory-history-retry" onClick={load} disabled={loading}>Retry transactions<Icon name="refresh" size={16} /></button>}
      {loading && !loaded ? <LoadingSkeleton label="Loading inventory transactions" /> : !loaded ? null : <>
        {loading && <p className="inventory-history-updating" role="status">Updating transactions...</p>}
        <RecordsCard title="Stock movements" label="Stock movements" icon="clock" rows={records} loading={loading} loaded={loaded} onRefresh={load} emptyTitle="No recorded stock movements" emptyDetail="Recorded manual movements and delivery receipts appear here." mobilePreview={['Movement date', 'Reference', 'Customer', 'Source / destination', 'Quantity in', 'Quantity out']} headers={<>
          <th>Movement</th><th>Movement date</th><th>Reference</th><th>Customer</th><th>Source / destination</th><th>Reason</th>
          <th className="numeric">Quantity in</th><th className="numeric">Quantity out</th><th className="numeric">Stock before</th><th className="numeric">Stock after</th><th>UOP</th>
          <th>Sales order</th><th>Invoice</th><th>Received by</th><th>Recorded by</th><th>Recorded at</th>
        </>} renderRow={row => <>
          <td><Badge value={row.direction === 'in' ? 'active' : 'unpaid'}>{movementLabel(row.type)}</Badge>{row.deliveryReceiptNumber && <small>{row.deliveryReceiptNumber}</small>}</td>
          <td>{dateLabel(row.movementDate)}</td><td>{row.reference || row.deliveryReceiptNumber || '\u2014'}</td><td>{row.customerName || '\u2014'}</td>
          <td className="inventory-history-address"><span className="inventory-direction-label">{row.direction === 'in' ? 'Source' : 'Destination'}</span><span>{row.type === 'delivery-out' ? row.address || row.sourceDestination || '\u2014' : row.sourceDestination || '\u2014'}</span></td><td className="inventory-history-reason">{row.reason || '\u2014'}</td>
          <td className="numeric">{row.direction === 'in' ? quantity(row.quantity) : '\u2014'}</td><td className="numeric">{row.direction === 'out' ? quantity(row.quantity) : '\u2014'}</td>
          <td className="numeric">{quantity(row.stockBefore)}</td><td className="numeric">{quantity(row.stockAfter)}</td><td>{row.unit || '\u2014'}</td>
          <td>{row.orderNumber || '\u2014'}</td><td>{row.invoiceNumber || '\u2014'}</td><td>{row.receivedBy || '\u2014'}</td>
          <td><strong>{row.createdByUsername || '\u2014'}</strong>{row.createdByName && <small>{row.createdByName}</small>}</td><td>{recordedAt(row.createdAt)}</td>
        </>} />
      </>}
    </div>
    <div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button></div>
  </Modal>;
}
