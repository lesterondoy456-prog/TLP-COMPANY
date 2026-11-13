import { loadApi } from './load-api.mjs';
const { configurationMetadata } = loadApi('configuration');
import { calculateTotals as fixtureTotals, decimalString, decimalUnits } from '../../../PurchasingSystem/src/purchaseMath.js';
import { memoryReceivingRepository, receivingRouteWorkflow } from './receiving-memory-repository.mjs';

function calculatePurchaseTotals(items, settings = {}) {
  const totals = fixtureTotals(items, settings);
  return {
    ...totals,
    items: items.map((item, index) => ({
      ...item, ...totals.items[index], quantity: decimalString(decimalUnits(item.quantity, 6), 6),
      discountRate: decimalString(decimalUnits(item.discountRate || 0, 6), 6),
      vatRate: decimalString(decimalUnits(settings.vatRate || 0, 6), 6),
    })),
  };
}

function storedBody(body) {
  const values = structuredClone(body);
  for (const key of ['supplierId', 'purchaseOrderId']) if (values[key] !== undefined) values[key] = Number(values[key]);
  values.items = values.items.map(item => {
    for (const key of ['suppliesId', 'requestItemId', 'orderItemId']) if (item[key] !== undefined) item[key] = Number(item[key]);
    if (item.allocations) item.allocations = item.allocations.map(row => ({ ...row, warehouseId: Number(row.warehouseId), locationId: Number(row.locationId) }));
    return item;
  });
  return values;
}

export function mockPurchasing(actor, warehouseActor) {
  const supplier = { id: 50, code: 'SUP-MOCK', name: 'Mock Supplier', shortName: 'Mock', businessStyle: 'Wholesale', address: 'Supplier Office', contactPerson: 'Supplier Contact', paymentTerm: '30 DAYS', vatCode: 'VS', vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2, isActive: true };
  const supplies = { id: 30, code: 'S-MOCK', name: 'Mock Paper', description: 'Paper Roll', unit: 'kg', minimumStock: '1.000000', category: 'Raw Materials', stock: '0.000000', isActive: true, suppliers: [{ supplierId: 50, price: '5.000000', currency: 'PHP', moq: '0.000000', remarks: '' }], inventorySchedules: [] };
  const options = {
    suppliers: [supplier], supplies: [supplies], users: [actor], products: [], shipments: ['By Air', 'By Land', 'By Boat', 'N/A'],
    units: [{ id: 1, name: 'kg', description: 'Kilogram', forSupplies: true, isActive: true }], currencies: [{ id: 1, code: 'PHP', description: 'Philippine Peso', isDefault: true, isActive: true }],
    paymentTerms: [{ id: 1, description: '30 DAYS', forSupplier: true, isActive: true }], vatCodes: [{ id: 1, code: 'VS', description: 'Vatable Sales', rate: 12, isActive: true }],
    taxCodes: [], countries: [], suppliesCategories: [{ id: 1, name: 'Raw Materials', isActive: true }],
    warehouses: [{ id: 200, code: 'WH-MOCK', description: 'Mock Warehouse', isActive: true }], locations: [{ id: 300, code: 'LOC-MOCK', description: 'Mock Location', isActive: true }],
  };
  const requests = [];
  const orders = [];
  let memory;
  let allocationId = 10000;
  let failNextReceivingPost = false;
  const writes = [];
  const stockState = () => memory?.snapshot() || { productStock: 7, orders, receipts: [], inventory: {}, ledger: [], audit: [] };
  const orderRows = () => stockState().orders.map(order => ({ ...order, items: order.items.map(item => ({ ...item, receivedQuantity: item.receivedQuantity || '0.000000', balanceQuantity: decimalString(decimalUnits(item.quantity, 6) - decimalUnits(item.receivedQuantity || 0, 6), 6) })) }));
  const requestRows = () => requests.map(request => ({ ...request, items: request.items.map(item => {
    const linked = orderRows().filter(order => ['posted', 'closed'].includes(order.status)).flatMap(order => order.items.map(row => ({ ...row, number: order.number }))).filter(row => row.requestItemId === item.id);
    const ordered = linked.reduce((sum, row) => sum + decimalUnits(row.quantity, 6), 0n);
    return { ...item, orderedQuantity: decimalString(ordered, 6), balanceQuantity: decimalString(decimalUnits(item.quantity, 6) - ordered, 6), purchaseOrderNumbers: linked.map(row => row.number).join(', ') };
  }) }));
  const receiptRows = () => stockState().receipts.map(receipt => ({ ...receipt, items: receipt.items.map(item => ({ ...item, allocatedQuantity: decimalString(item.allocations.reduce((sum, row) => sum + decimalUnits(row.quantity, 6), 0n), 6) })) }));
  const stockRows = () => Object.entries(stockState().inventory).map(([key, amount], index) => {
    const movement = stockState().ledger.find(row => [row.suppliesId, row.warehouseId, row.locationId, row.imLot, row.qcStatus, row.expiryDate || '', row.mfgDate || ''].join('|') === key);
    return { ...supplies, ...movement, id: index + 1, suppliesId: supplies.id, quantity: decimalString(amount, 6), warehouseCode: 'WH-MOCK', warehouseDescription: 'Mock Warehouse', locationCode: 'LOC-MOCK', locationDescription: 'Mock Location' };
  });

  async function onApi({ project, method, pathname, body }) {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: project === 'WarehouseSystem' ? warehouseActor : actor } };
    if (method === 'GET' && pathname === '/api/configuration') return { json: { modules: configurationMetadata() } };
    if (method === 'GET' && pathname === '/api/purchasing-options') return { json: options };
    if (method === 'GET' && pathname === '/api/inventory') return { json: { records: stockRows() } };
    if (method === 'GET' && pathname === '/api/inventory/movements') return { json: { records: stockState().ledger.map((movement, index) => ({ ...movement, id: index + 1, receiptNumber: 'SRR-MOCK-001', receivedDate: '2026-11-13', warehouseCode: 'WH-MOCK', locationCode: 'LOC-MOCK' })) } };
    const lists = { 'purchase-requests': requestRows, 'purchase-orders': orderRows, receivings: receiptRows, suppliers: () => [supplier], supplies: () => [supplies] };
    const match = pathname.match(/^\/api\/(purchase-requests|purchase-orders|receivings|suppliers|supplies)(?:\/(\d+))?(?:\/(post))?$/);
    if (match) {
      const [, kind, rawId, action] = match;
      const id = Number(rawId || 1);
      if (method === 'GET') return { json: rawId ? { record: lists[kind]().find(record => record.id === id) } : { records: lists[kind]() } };
      writes.push({ method, pathname, body });
      try {
        if (method === 'POST' && action === 'post') {
          if (kind === 'purchase-requests') requests.find(record => record.id === id).status = 'posted';
          if (kind === 'purchase-orders') {
            orders.find(record => record.id === id).status = 'posted';
            requests.forEach(record => { record.status = 'closed'; });
          }
          if (kind === 'receivings') {
            if (failNextReceivingPost) { failNextReceivingPost = false; return { status: 503, json: { message: 'Mock receiving temporarily unavailable.' } }; }
            return { json: await receivingRouteWorkflow(memory.repository).post(id, actor) };
          }
          return { json: { record: lists[kind]().find(record => record.id === id) } };
        }
        if (kind === 'purchase-requests' && method === 'POST' && !rawId) {
          const values = storedBody(body);
          const record = { ...values, id: 1, number: 'PR-MOCK-001', branch: 'TTI Laguna Philippines Inc.', status: 'draft', preparedBy: actor.name, preparedById: actor.id, items: values.items.map((item, index) => ({ ...item, id: 100 + index, requestId: 1, suppliesCode: supplies.code, suppliesName: supplies.name, description: supplies.description, unit: supplies.unit })) };
          requests.push(record);
          return { status: 201, json: { record: requestRows()[0] } };
        }
        if (kind === 'purchase-orders' && method === 'POST' && !rawId) {
          const values = storedBody(body);
          const items = values.items.map(item => {
            const source = requestRows().flatMap(record => record.items.map(row => ({ ...row, requestNumber: record.number }))).find(row => row.id === item.requestItemId);
            return { ...item, suppliesId: source.suppliesId, suppliesCode: supplies.code, suppliesName: supplies.name, description: supplies.description, unit: supplies.unit, requestNumber: source.requestNumber, requestId: 1 };
          });
          const totals = calculatePurchaseTotals(items, { vatRate: 12, vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2 });
          const record = { ...values, ...totals, id: 1, number: 'PO-MOCK-001', branch: 'TTI Laguna Philippines Inc.', status: 'draft', supplierName: supplier.name, supplierAddress: supplier.address, supplierContactPerson: supplier.contactPerson, vatRate: '12.000000', vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2, preparedBy: actor.name, preparedById: actor.id, items: totals.items.map((item, index) => ({ ...item, id: 200 + index, orderId: 1, receivedQuantity: '0.000000' })) };
          orders.push(record);
          return { status: 201, json: { record: orderRows()[0] } };
        }
        if (kind === 'receivings' && ['POST', 'PUT'].includes(method)) {
          const previous = memory?.snapshot();
          const current = previous?.receipts.find(record => record.id === id);
          const values = storedBody(body);
          const order = orderRows().find(record => record.id === values.purchaseOrderId);
          const priced = values.items.map(item => {
            const source = order.items.find(row => row.id === item.orderItemId);
            return { ...source, ...item, unitPrice: source.unitPrice, discountRate: source.discountRate };
          });
          const totals = calculatePurchaseTotals(priced, order);
          const record = { ...values, ...totals, id: 1, number: 'SRR-MOCK-001', status: 'draft', purchaseOrderNumber: order.number, supplierId: supplier.id, supplierName: supplier.name, supplierAddress: supplier.address, currency: 'PHP', rate: values.rate || '1.00000', vatRate: '12.000000', vatCode: 'VS', vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2, receivedBy: actor.name, receivedById: actor.id,
            items: totals.items.map((item, index) => ({ ...item, id: 1000 + index, allocations: item.allocations.map(allocation => ({ ...allocation, id: ++allocationId })) })) };
          memory = memoryReceivingRepository({ productStock: 7, orders: previous?.orders || structuredClone(orders), receipts: [record], inventory: previous?.inventory || {}, ledger: previous?.ledger || [], audit: previous?.audit || [] });
          return { status: method === 'POST' ? 201 : 200, json: { record: receiptRows()[0] } };
        }
      } catch (error) { return { status: error.status || 500, json: { message: error.message } }; }
      return undefined;
    }
    if (method === 'GET' && ['/api/customers', '/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
  }
  return { onApi, writes, options, snapshot: stockState, rejectNextReceivingPost: () => { failNextReceivingPost = true; } };
}
