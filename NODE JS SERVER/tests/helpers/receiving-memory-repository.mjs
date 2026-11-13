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
// come from the production receiving coordinator under test.
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
  return { repository, snapshot: () => structuredClone(state), events, stockCalls: () => stockCalls };
}
