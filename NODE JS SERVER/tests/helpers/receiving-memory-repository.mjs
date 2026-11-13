import { loadRouterWithDatabase, invokeRoute } from './load-api.mjs';
import assert from 'node:assert/strict';

const micro = value => BigInt(Math.round(Number(value) * 1_000_000));
const quantity = value => Number(value) / 1_000_000;

export function receivingFixture() {
  return {
    productStock: 7,
    orders: [{ id: 10, status: 'posted', items: [
      { id: 100, suppliesId: 500, quantity: 10, receivedQuantity: 0, unit: 'kg' },
      { id: 101, suppliesId: 501, quantity: 5, receivedQuantity: 0, unit: 'pcs' },
    ] }],
    receipts: [{ id: 1, purchaseOrderId: 10, status: 'draft', items: [{
      id: 1001, orderItemId: 100, suppliesId: 500, quantity: 3, unit: 'kg', allocations: [{
        id: 10001, quantity: 3, warehouseId: 200, locationId: 300, imLot: 'LOT-A', qcStatus: 'Accepted', expiryDate: null, mfgDate: null,
      }],
    }] }],
    inventory: {}, ledger: [], audit: [],
  };
}

// Repository semantics only; all validation, replay handling and effect ordering
// come from the actual production receiving route under test.
export function memoryReceivingRepository(initial = receivingFixture(), { failStockCall = 0, failAudit = false } = {}) {
  let state = structuredClone(initial);
  let queue = Promise.resolve();
  let stockCalls = 0;
  const events = [];
  const activeScopes = new Set();
  const scoped = scope => { assert.ok(activeScopes.has(scope), 'Every repository operation must use its transaction scope.'); return scope.state; };
  const repository = {
    async transaction(work) {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      const scope = { state: structuredClone(state) };
      activeScopes.add(scope);
      events.push('begin');
      try {
        const result = await work(scope);
        state = scope.state;
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      } finally {
        activeScopes.delete(scope);
        release();
      }
    },
    async getReceiptForUpdate(scope, id) { events.push('receipt-lock'); return scoped(scope).receipts.find(row => row.id === id); },
    async getOrderForUpdate(scope, id) { events.push('order-lock'); return scoped(scope).orders.find(row => row.id === id); },
    async validateDestination(scope, allocation) { scoped(scope); return allocation.warehouseId === 200 && allocation.locationId === 300; },
    async addStock(scope, movement) {
      const draft = scoped(scope);
      stockCalls++;
      events.push('stock');
      if (failStockCall && stockCalls === failStockCall) throw new Error('Injected stock-write failure');
      assert.equal(draft.ledger.some(row => row.allocationId === movement.allocationId), false, 'Allocation ledger must be unique.');
      draft.ledger.push(structuredClone(movement));
      const key = [movement.suppliesId, movement.warehouseId, movement.locationId, movement.imLot, movement.qcStatus, movement.expiryDate || '', movement.mfgDate || ''].join('|');
      draft.inventory[key] = (draft.inventory[key] || 0n) + micro(movement.quantity);
    },
    async markReceiptPosted(scope, id) { scoped(scope).receipts.find(row => row.id === id).status = 'posted'; events.push('posted'); },
    async refreshPurchaseOrderStatus(scope, id) {
      const draft = scoped(scope);
      const order = draft.orders.find(row => row.id === id);
      for (const item of order.items) {
        const received = draft.receipts.filter(receipt => receipt.purchaseOrderId === id && receipt.status === 'posted')
          .flatMap(receipt => receipt.items).filter(row => row.orderItemId === item.id)
          .reduce((sum, row) => sum + micro(row.quantity), 0n);
        item.receivedQuantity = quantity(received);
      }
      order.status = order.items.every(item => micro(item.receivedQuantity) === micro(item.quantity)) ? 'closed' : 'posted';
      events.push('order-refreshed');
    },
    async recordAudit(scope, user, module, action, id) {
      if (failAudit) throw new Error('Injected audit failure');
      scoped(scope).audit.push({ userId: user.id, module, action, id });
      events.push('audit');
    },
    async getReceipt(scope, id) { return structuredClone(scoped(scope).receipts.find(row => row.id === id)); },
  };

  const database = {
    sql: new Proxy({}, { get: (_object, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    transaction: work => repository.transaction(work),
    request(scope) {
      const params = {};
      return {
        input(name, _type, value) { params[name] = value; return this; },
        async query(statement) {
          const draft = scoped(scope);
          const text = statement.trim();
          if (/^SELECT r\.id/.test(text) && text.includes('FROM dbo.SuppliesReceipts r')) {
            const receipt = text.includes('WITH (UPDLOCK,HOLDLOCK)')
              ? await repository.getReceiptForUpdate(scope, params.id) : await repository.getReceipt(scope, params.id);
            if (!receipt) return { recordsets: [[], [], []] };
            const { items, ...header } = structuredClone(receipt);
            return { recordsets: [[header], items.map(({ allocations, ...item }) => ({ ...item, receiptId: header.id })), items.flatMap(item => item.allocations.map(allocation => ({ ...allocation, receiptItemId: item.id })))] };
          }
          if (/^SELECT o\.id/.test(text) && text.includes('FROM dbo.PurchaseOrders o')) {
            const order = await repository.getOrderForUpdate(scope, params.id);
            if (!order) return { recordsets: [[], []] };
            const { items, ...header } = structuredClone(order);
            return { recordsets: [[header], items.map(item => ({ ...item, orderId: header.id }))] };
          }
          if (text.startsWith('SELECT w.id FROM dbo.ConfigWarehouses')) return { recordset: await repository.validateDestination(scope, { warehouseId: params.warehouse, locationId: params.location }) ? [{ id: params.warehouse }] : [] };
          const stockKey = () => [params.suppliesId, params.warehouseId, params.locationId, params.imLot, params.qcStatus, params.expiryDate || '', params.mfgDate || ''].join('|');
          scope.inventoryRows ||= new Map();
          if (text.startsWith('SELECT id FROM dbo.SupplyInventory')) {
            const index = Object.keys(draft.inventory).indexOf(stockKey());
            if (index < 0) return { recordset: [] };
            scope.inventoryRows.set(index + 1, { ...params });
            return { recordset: [{ id: index + 1 }] };
          }
          if (text.startsWith('INSERT INTO dbo.SupplyInventory')) {
            const id = Object.keys(draft.inventory).length + 1;
            scope.inventoryRows.set(id, { ...params });
            return { recordset: [{ id }] };
          }
          if (text.startsWith('UPDATE dbo.SupplyInventory')) {
            scope.inventoryRows.set(params.id, { ...params });
            return { recordset: [{ id: params.id }] };
          }
          if (text.startsWith('INSERT INTO dbo.SupplyStockMovements')) {
            await repository.addStock(scope, { ...scope.inventoryRows.get(params.inventoryId), ...params });
            return { recordset: [] };
          }
          if (text.startsWith('UPDATE dbo.SuppliesReceipts')) { await repository.markReceiptPosted(scope, params.id); return { recordset: [] }; }
          if (text.startsWith('UPDATE o SET status=CASE')) { await repository.refreshPurchaseOrderStatus(scope, params.id); return { recordset: [] }; }
          if (text.startsWith('INSERT INTO dbo.AuditTrail')) {
            await repository.recordAudit(scope, { id: params.userId }, params.module, params.action, Number(params.recordId));
            return { recordset: [] };
          }
          throw new Error('Unexpected SQL in receiving route test: ' + text.slice(0, 100));
        },
      };
    },
  };
  repository.database = database;
  return { repository, database, snapshot: () => structuredClone(state), events, stockCalls: () => stockCalls };
}

export function receivingRouteWorkflow(repository) {
  const router = loadRouterWithDatabase('purchasing', repository.database);
  return { post: async (id, user) => (await invokeRoute(router, 'POST', '/receivings/:id/post', { params: { id }, purchasingUser: { ...user, system: 'purchasing' } })).body };
}
