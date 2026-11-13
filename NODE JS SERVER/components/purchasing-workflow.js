import { ApiError } from './errors.js';

const powers = Array.from({ length: 20 }, (_, index) => 10n ** BigInt(index));

export function decimalUnits(value, scale, label = 'Value', maximum = '1000000000') {
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
    throw new ApiError(400, `${label} must be a valid decimal number.`);
  }
  const source = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(source)) throw new ApiError(400, `${label} must be zero or greater.`);
  const [whole, originalFraction = ''] = source.split('.');
  const fraction = originalFraction.replace(/0+$/, '');
  if (fraction.length > scale) throw new ApiError(400, `${label} supports at most ${scale} decimal places.`);
  const result = BigInt(whole) * powers[scale] + BigInt((fraction + '0'.repeat(scale)).slice(0, scale) || '0');
  if (result > BigInt(maximum) * powers[scale]) throw new ApiError(400, `${label} is too large.`);
  return result;
}

export function decimalString(value, scale) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / powers[scale];
  const fraction = scale ? `.${String(absolute % powers[scale]).padStart(scale, '0')}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

function roundedDivide(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

export function calculatePurchaseTotals(items, { vatRate = 0, vatInclusive = false, decimalInPrice = 6, decimalInTotalPrice = 2 } = {}) {
  if (!Number.isInteger(decimalInPrice) || decimalInPrice < 0 || decimalInPrice > 6) throw new ApiError(400, 'Price decimal places must be 0–6.');
  if (!Number.isInteger(decimalInTotalPrice) || decimalInTotalPrice < 0 || decimalInTotalPrice > 6) throw new ApiError(400, 'Total decimal places must be 0–6.');
  const scale = decimalInTotalPrice;
  const vat = decimalUnits(vatRate, 6, 'VAT rate', '100');
  const percentages = 100n * powers[6];
  const totals = { grossAmount: 0n, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
  const calculated = items.map(item => {
    const quantity = decimalUnits(item.quantity, 6, 'Quantity');
    if (!quantity) throw new ApiError(400, 'Quantity must be greater than zero.');
    const enteredPrice = decimalUnits(item.unitPrice, 6, 'Unit price');
    const priceStep = powers[6 - decimalInPrice];
    const price = roundedDivide(enteredPrice, priceStep) * priceStep;
    const discount = decimalUnits(item.discountRate ?? 0, 6, 'Discount rate', '100');
    const grossAmount = roundedDivide(quantity * price * powers[scale], powers[12]);
    const discountAmount = roundedDivide(grossAmount * discount, percentages);
    const afterDiscount = grossAmount - discountAmount;
    const vatAmount = vatInclusive
      ? roundedDivide(afterDiscount * vat, percentages + vat)
      : roundedDivide(afterDiscount * vat, percentages);
    const netAmount = vatInclusive ? afterDiscount - vatAmount : afterDiscount;
    const amount = netAmount + vatAmount;
    const values = { grossAmount, discountAmount, netAmount, vatAmount, amount };
    for (const key of Object.keys(totals)) {
      totals[key] += values[key];
      if (totals[key] > 1000000000000n * powers[scale]) throw new ApiError(400, 'The document total exceeds the supported amount.');
    }
    return {
      ...item, quantity: decimalString(quantity, 6), unitPrice: decimalString(price, 6),
      discountRate: decimalString(discount, 6), vatRate: decimalString(vat, 6),
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, decimalString(value, scale)])),
    };
  });
  return { items: calculated, ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, decimalString(value, scale)])) };
}

function positiveQuantity(value, label) {
  const quantity = decimalUnits(value, 6, label);
  if (!quantity) throw new ApiError(400, `${label} must be greater than zero.`);
  return quantity;
}

export function createReceivingWorkflow(repository) {
  return {
    async post(receiptId, user) {
      return repository.transaction(async scope => {
        const receipt = await repository.getReceiptForUpdate(scope, receiptId);
        if (!receipt) throw new ApiError(404, 'The receiving receipt could not be found.');
        if (receipt.status === 'posted') return { record: await repository.getReceipt(scope, receiptId), alreadyPosted: true };
        if (receipt.status !== 'draft') throw new ApiError(409, 'Only an unposted receiving receipt can be posted.');
        const order = await repository.getOrderForUpdate(scope, receipt.purchaseOrderId);
        if (!order || !['posted', 'closed'].includes(order.status)) throw new ApiError(409, 'Receiving requires a posted purchase order.');
        if (!Array.isArray(receipt.items) || !receipt.items.length) throw new ApiError(400, 'Add at least one receiving item.');
        const orderItems = new Map(order.items.map(item => [item.id, item]));
        const usedItems = new Set();
        const movements = [];
        for (const item of receipt.items) {
          const source = orderItems.get(item.orderItemId);
          if (!source || source.suppliesId !== item.suppliesId) throw new ApiError(400, 'Receiving items must match their purchase order Supplies.');
          if (usedItems.has(source.id)) throw new ApiError(400, 'A purchase order line can appear only once in a receipt.');
          usedItems.add(source.id);
          if (item.unit && item.unit !== source.unit) throw new ApiError(400, 'Receiving UOM must match the purchase order.');
          const quantity = positiveQuantity(item.quantity, 'Receiving quantity');
          const outstanding = decimalUnits(source.quantity, 6, 'Ordered quantity') - decimalUnits(source.receivedQuantity || 0, 6, 'Received quantity');
          if (quantity > outstanding) throw new ApiError(409, 'Receiving quantity exceeds the remaining purchase order balance.');
          if (!Array.isArray(item.allocations) || !item.allocations.length) throw new ApiError(400, 'Allocate every receiving item to stock before posting.');
          let allocated = 0n;
          for (const allocation of item.allocations) {
            const allocationQuantity = positiveQuantity(allocation.quantity, 'Allocation quantity');
            allocated += allocationQuantity;
            if (!Number.isInteger(allocation.warehouseId) || allocation.warehouseId <= 0
                || !Number.isInteger(allocation.locationId) || allocation.locationId <= 0
                || !await repository.validateDestination(scope, allocation)) {
              throw new ApiError(400, 'Every allocation needs an active Warehouse and Location.');
            }
            movements.push({
              ...allocation, quantity: decimalString(allocationQuantity, 6), suppliesId: item.suppliesId,
              receiptId, receiptItemId: item.id, allocationId: allocation.id, user,
            });
          }
          if (allocated !== quantity) throw new ApiError(400, 'Allocated quantity must equal the receiving item quantity exactly.');
        }
        // Every source balance and destination is validated before the first
        // stock effect. The repository transaction also rolls back later errors.
        for (const movement of movements) await repository.addStock(scope, movement);
        await repository.markReceiptPosted(scope, receiptId, user);
        await repository.refreshPurchaseOrderStatus(scope, order.id);
        await repository.recordAudit(scope, user, 'receivings', 'post', receiptId);
        return { record: await repository.getReceipt(scope, receiptId), alreadyPosted: false };
      });
    },
  };
}
