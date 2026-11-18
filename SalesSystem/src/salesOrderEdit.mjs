import { calculateSalesOrder } from './salesPricing.mjs';

const financialFields = ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount'];

function millionths(value) {
  const text = String(value ?? '0').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('The saved order pricing is invalid.');
  const [whole, raw = ''] = text.split('.');
  const fraction = raw.replace(/0+$/, '');
  if (fraction.length > 6) throw new Error('The saved order pricing precision is invalid.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
}

const decimal = value => `${value / 1000000n}.${(value % 1000000n).toString().padStart(6, '0')}`;

export function hasSalesInvoice(record, item) {
  if (item?.id == null) return false;
  if (typeof item.hasInvoice === 'boolean' || item.hasInvoice === 0 || item.hasInvoice === 1) return Boolean(item.hasInvoice);
  const quantity = String(item.invoicedQuantity ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(quantity)) return millionths(quantity) > 0n;
  return Boolean(record?.invoiced);
}

// Keep invoiced financial allocations frozen while repricing the editable lines.
// Fixed header discounts allocate only their unused remainder to editable items.
export function calculateEditableSalesOrder({ record, items }) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Add between 1 and 100 order items.');
  const snapshots = new Map((record.items || []).map(item => [String(item.id), item]));
  const rows = items.map(item => {
    const original = item.id == null ? undefined : snapshots.get(String(item.id));
    return { item: original && hasSalesInvoice(record, original) ? original : item, locked: Boolean(original && hasSalesInvoice(record, original)) };
  });
  const frozen = rows.filter(row => row.locked).map(row => row.item);
  const editable = rows.filter(row => !row.locked).map(row => row.item);
  if (!editable.length && rows.length === record.items?.length) return { ...record, items: rows.map(row => row.item) };

  for (const item of frozen) {
    if (financialFields.some(key => item[key] == null)) throw new Error('The saved SI item pricing is incomplete. Reopen the order before editing.');
  }
  const frozenAllocation = frozen.reduce((sum, item) => sum + millionths(item.headerDiscountAmount), 0n);
  let discount = record.discount;
  if (record.discountType === 'amount') {
    const remaining = millionths(record.discount) - frozenAllocation;
    if (remaining < 0n) throw new Error('The saved fixed discount is below the invoiced item allocation.');
    discount = decimal(remaining);
  }
  if (!editable.length && record.discountType === 'amount' && millionths(discount) > 0n) throw new Error('The saved fixed discount cannot be allocated without changing a locked item.');
  const repriced = editable.length ? calculateSalesOrder({
    items: editable, rate: record.rate ?? '1', vatRate: record.vatRate ?? '0',
    vatInclusive: Boolean(record.vatInclusive), discountType: record.discountType,
    discount, decimalInTotalPrice: record.decimalInTotalPrice ?? 2,
  }) : { items: [] };
  let index = 0;
  const resultItems = rows.map(row => row.locked ? row.item : repriced.items[index++]);
  const totals = Object.fromEntries(financialFields.map(key => [key, resultItems.reduce((sum, item) => sum + millionths(item[key]), 0n)]));
  if (totals.grossAmount > 1000000000000000000n || totals.amount > 1000000000000000000n) throw new Error('Order total exceeds the supported amount.');
  return {
    items: resultItems,
    ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, decimal(value)])),
    total: decimal(totals.amount), decimalInTotalPrice: record.decimalInTotalPrice ?? 2,
  };
}
