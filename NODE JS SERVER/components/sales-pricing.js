import { calculatePurchaseTotals } from './purchasing-workflow.js';
import { ApiError } from './errors.js';

export function commonSalesCurrency(products) {
  const currencies = new Set(products.map(product => String(product.currency || 'PHP').trim().toUpperCase() || 'PHP'));
  if (currencies.size !== 1) throw new ApiError(400, 'Use products with the same currency in one sales order.');
  return [...currencies][0];
}

// Sales keeps two-place document totals while retaining six-place unit prices.
export function salesOrderPricing(items) {
  const calculated = calculatePurchaseTotals(items, { decimalInPrice: 6, decimalInTotalPrice: 2 });
  return { total: Number(calculated.amount), lineTotals: calculated.items.map(item => Number(item.amount)) };
}
