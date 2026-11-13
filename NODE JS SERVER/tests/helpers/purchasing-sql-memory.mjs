import assert from 'node:assert/strict';
import { invokeRoute, loadRouterWithDatabase } from './load-api.mjs';

// This adapter models only SQL reads/writes. Pricing runs in the production
// router callback; no calculation from the API is exposed or copied here.
export async function priceOnRoute(items, settings = {}, { receiving = false, update = false, remarks = '' } = {}) {
  const config = { vatRate: 0, vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2, ...settings };
  const sourceOrder = { id: 10, status: 'posted', currency: 'PHP', rate: '1.00000', ...config, items: items.map((item, index) => ({
    ...item, id: index + 100, requestItemId: index + 1, requestId: 20,
    suppliesId: index + 500, suppliesCode: 'MOCK-' + index, suppliesName: 'Mock supply', description: '',
    unit: 'pcs', currency: 'PHP', quantity: '1000000000.000000', receivedQuantity: '0.000000',
  })) };
  const initial = update ? { header: { id: receiving ? 1 : 10, status: 'draft', ...config }, items: [], audit: [] } : { items: [], audit: [] };
  let committed = structuredClone(initial);
  let active;
  const database = {
    sql: new Proxy({}, { get: (_object, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    async transaction(work) {
      assert.equal(active, undefined);
      active = { state: structuredClone(committed) };
      try { const result = await work(active); committed = active.state; return result; }
      finally { active = undefined; }
    },
    request(scope) {
      assert.equal(scope, active, 'Every save/query must use its transaction scope.');
      const params = {};
      return {
        input(name, type, value) {
          if (['NVarChar', 'VarChar'].includes(type?.type)) assert.equal(type.args[0], -1, 'Text parameter bindings must use SQL MAX without truncation.');
          params[name] = value;
          return this;
        },
        async query(statement) {
          assert.equal(scope, active);
          const state = scope.state;
          const sql = statement.trim();
          if (sql.startsWith('SELECT id,code,') && sql.includes('FROM dbo.Suppliers')) return { recordset: [{ id: 2, name: 'Mock supplier', address: '', contactPerson: '', isActive: true, ...config }] };
          if (sql.startsWith('SELECT rate FROM dbo.ConfigVatCodes')) return { recordset: [{ rate: config.vatRate }] };
          if (/^SELECT id FROM dbo.Config(Currencies|PaymentTerms|SuppliesCategories)/.test(sql)) return { recordset: [{ id: 1 }] };
          if (sql.startsWith('SELECT d.*,r.status')) return { recordset: [{
            requestStatus: 'posted', requestNumber: 'MOCK-PR', requestId: 20,
            requestedQuantity: '1000000000.000000', orderedQuantity: '0.000000',
            suppliesId: params.id + 500, suppliesCode: 'MOCK-' + params.id, suppliesName: 'Mock supply', description: '', unit: 'pcs',
          }] };
          if (sql.startsWith('SELECT o.id') && sql.includes('FROM dbo.PurchaseOrders o')) {
            if (receiving) {
              const { items: lines, ...header } = sourceOrder;
              return { recordsets: [[header], lines.map(item => ({ ...item, orderId: header.id }))] };
            }
            return { recordsets: [state.header ? [state.header] : [], state.items.map(item => ({ ...item, orderId: state.header?.id }))] };
          }
          if (sql.startsWith('SELECT r.id') && sql.includes('FROM dbo.SuppliesReceipts r')) return { recordsets: [
            state.header ? [{ ...sourceOrder, ...state.header, items: undefined }] : [],
            state.items.map(item => ({ ...sourceOrder.items.find(source => source.id === item.orderItemId), ...item, receiptId: state.header?.id })), [],
          ] };
          if (/^INSERT INTO dbo\.(PurchaseOrders|SuppliesReceipts)\(/.test(sql)) {
            const id = receiving ? 1 : 10;
            state.header = { ...sourceOrder, ...params, id, status: 'draft', items: undefined };
            return { recordset: [{ id }] };
          }
          if (/^UPDATE dbo\.(PurchaseOrders|SuppliesReceipts) SET/.test(sql)) { state.header = { ...state.header, ...params }; return { recordset: [] }; }
          if (sql.startsWith('DELETE ')) { state.items = []; return { recordset: [] }; }
          if (/^INSERT INTO dbo\.(PurchaseOrderItems|SuppliesReceiptItems)\(/.test(sql)) {
            const id = 1000 + state.items.length;
            state.items.push({ ...params, id });
            return { recordset: [{ id }] };
          }
          if (sql.startsWith('INSERT INTO dbo.AuditTrail')) { state.audit.push({ ...params }); return { recordset: [] }; }
          throw new Error('Unexpected SQL in pricing route adapter: ' + sql.slice(0, 100));
        },
      };
    },
  };
  const base = receiving ? '/receivings' : '/purchase-orders';
  const body = receiving ? {
    purchaseOrderId: 10, srrDate: '2026-11-13', invoiceNumber: 'MOCK-SI', invoiceDate: null, rate: '1', remarks,
    items: items.map((item, index) => ({ orderItemId: index + 100, quantity: item.quantity, unit: 'pcs', allocations: [] })),
  } : {
    supplierId: 2, poDate: '2026-11-13', deliveryDate: '2026-11-14', currency: 'PHP', rate: 1,
    paymentTerm: 'Mock cash', shipment: 'N/A', vatCode: 'MOCK', remarks,
    items: items.map((item, index) => ({ ...item, requestItemId: index + 1, currency: 'PHP', unit: 'pcs' })),
  };
  const router = loadRouterWithDatabase('purchasing', database);
  const response = await invokeRoute(router, update ? 'PUT' : 'POST', base + (update ? '/:id' : ''), {
    body, params: { id: receiving ? 1 : 10 }, get: name => name.toLowerCase() === 'content-type' ? 'application/json' : undefined,
    purchasingUser: { id: 1, system: 'purchasing', role: 'admin', name: 'Mock Administrator' },
  });
  assert.equal(response.statusCode, update ? 200 : 201);
  assert.equal(committed.audit.length, 1, 'A successful draft saves its audit in the same transaction.');
  return response.body.record;
}
