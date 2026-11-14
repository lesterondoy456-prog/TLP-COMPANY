function units(value, places) {
  const source = String(value ?? '0').trim();
  if (!/^\d+(?:\.\d+)?$/.test(source)) throw new Error('Invalid decimal.');
  const [whole, raw = ''] = source.split('.');
  const fraction = raw.replace(/0+$/, '');
  if (fraction.length > places) throw new Error('Too many decimal places.');
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
}

export function salesLineCents(item) {
  try { return (units(item.quantity || 0, 3) * units(item.unitPrice || 0, 6) + 5000000n) / 10000000n; }
  catch { return 0n; }
}

export const salesLineTotal = item => Number(salesLineCents(item)) / 100;
export const salesTotal = items => Number(items.reduce((total, item) => total + salesLineCents(item), 0n)) / 100;

const round = (value, divisor) => (value + divisor / 2n) / divisor;
const sixDecimals = (value, places) => {
  const scaled = value * 10n ** BigInt(6 - places);
  return (scaled / 1000000n) + '.' + (scaled % 1000000n).toString().padStart(6, '0');
};

export function calculateSalesOrder({ items, rate = 1, vatRate = 0, vatInclusive = false, discountType = null, discount = null, decimalInTotalPrice = 2 }) {
  const places = Number(decimalInTotalPrice);
  if (!Number.isInteger(places) || places < 0 || places > 6) throw new Error('Total precision must be from 0 to 6.');
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Add between 1 and 100 order items.');
  if (rate == null || String(rate).trim() === '') throw new Error('Enter an exchange rate.');
  if (vatRate == null || String(vatRate).trim() === '') throw new Error('Set the VAT rate in Configuration before saving.');
  if (typeof vatInclusive !== 'boolean') throw new Error('Choose Inclusive or Exclusive VAT.');
  const exchange = units(rate, 6);
  const vat = units(vatRate, 6);
  const percent = 100000000n;
  if (exchange <= 0n || exchange > 1000000000000n) throw new Error('Exchange rate must be greater than zero and at most 1,000,000.');
  if (vat > percent) throw new Error('VAT rate must be from 0 to 100.');
  if (discountType && !['percent', 'amount'].includes(discountType)) throw new Error('Choose Percent, Amount or None for the discount.');
  const lines = items.map(item => {
    if (item.quantity == null || String(item.quantity).trim() === '' || item.unitPrice == null || String(item.unitPrice).trim() === '') throw new Error('Enter a quantity and unit price for every order item.');
    const quantity = units(item.quantity, 3);
    const price = units(item.unitPrice, 6);
    if (quantity <= 0n || quantity > 1000000000n || price > 100000000000000n) throw new Error('Order quantity or unit price exceeds the allowed range.');
    const converted = round(price * exchange, 1000000n);
    if (converted > 1000000000000000000n) throw new Error('The converted price is too large.');
    const gross = round(quantity * converted, 10n ** BigInt(9 - places));
    if (gross > 1000000000000n * 10n ** BigInt(places)) throw new Error('Order gross amount exceeds the supported amount.');
    const lineRate = item.discountRate == null || String(item.discountRate).trim() === '' ? 0n : units(item.discountRate, 6);
    if (lineRate > percent) throw new Error('Line discount must be from 0 to 100.');
    const lineDiscount = round(gross * lineRate, percent);
    return { item, converted, gross, lineDiscount, remaining: gross - lineDiscount };
  });
  let remainingNet = lines.reduce((sum, line) => sum + line.remaining, 0n);
  const enteredDiscount = discount == null || String(discount).trim() === '' || !discountType ? 0n : units(discount, 6);
  if (discountType === 'percent' && enteredDiscount > percent) throw new Error('Percentage discount cannot exceed 100.');
  const headerDiscount = discountType === 'percent' ? round(remainingNet * enteredDiscount, percent)
    : discountType === 'amount' ? round(enteredDiscount, 10n ** BigInt(6 - places)) : 0n;
  if (headerDiscount > remainingNet) throw new Error('Header discount cannot exceed the amount after line discounts.');
  let remainingDiscount = headerDiscount;
  const totals = { grossAmount: 0n, lineDiscountAmount: 0n, headerDiscountAmount: headerDiscount, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
  const calculatedItems = lines.map(line => {
    const allocation = remainingNet === 0n ? 0n : remainingNet === line.remaining ? remainingDiscount : remainingDiscount * line.remaining / remainingNet;
    remainingNet -= line.remaining;
    remainingDiscount -= allocation;
    const discountAmount = line.lineDiscount + allocation;
    const discounted = line.gross - discountAmount;
    const tax = round(discounted * vat, vatInclusive ? percent + vat : percent);
    const net = vatInclusive ? discounted - tax : discounted;
    const amount = vatInclusive ? discounted : discounted + tax;
    totals.grossAmount += line.gross;
    totals.lineDiscountAmount += line.lineDiscount;
    totals.discountAmount += discountAmount;
    totals.netAmount += net;
    totals.vatAmount += tax;
    totals.amount += amount;
    return { ...line.item, convertedUnitPrice: sixDecimals(line.converted, 6), grossAmount: sixDecimals(line.gross, places), lineDiscountAmount: sixDecimals(line.lineDiscount, places), headerDiscountAmount: sixDecimals(allocation, places), discountAmount: sixDecimals(discountAmount, places), netAmount: sixDecimals(net, places), vatAmount: sixDecimals(tax, places), amount: sixDecimals(amount, places), lineTotal: sixDecimals(amount, places) };
  });
  if (totals.grossAmount > 1000000000000n * 10n ** BigInt(places) || totals.amount > 1000000000000n * 10n ** BigInt(places)) throw new Error('Order total exceeds the supported amount.');
  return { items: calculatedItems, ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, sixDecimals(value, places)])), total: sixDecimals(totals.amount, places), decimalInTotalPrice: places };
}
