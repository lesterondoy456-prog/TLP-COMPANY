const powers = Array.from({ length: 20 }, (_, index) => 10n ** BigInt(index));

export function decimalUnits(value, places) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Enter a valid nonnegative number.');
  const [whole, rawFraction = ''] = text.split('.');
  const fraction = rawFraction.replace(/0+$/, '');
  if (fraction.length > places) throw new Error('Use no more than ' + places + ' decimal places.');
  return BigInt(whole) * powers[places] + BigInt(fraction.padEnd(places, '0') || '0');
}

export function decimalString(value, places) {
  const whole = value / powers[places];
  const fraction = places ? '.' + (value % powers[places]).toString().padStart(places, '0') : '';
  return whole.toString() + fraction;
}

export function validDecimal(value, places, { positive = false, maximum = 1e9 } = {}) {
  try {
    const units = decimalUnits(value, places);
    return (!positive || units > 0n) && units <= BigInt(maximum) * powers[places];
  } catch {
    return false;
  }
}

const roundedDivide = (numerator, denominator) => (numerator + denominator / 2n) / denominator;

export function calculateTotals(items, { vatRate = 0, vatInclusive = false, decimalInPrice = 6, decimalInTotalPrice = 2 } = {}) {
  const places = Math.min(6, Math.max(0, Number(decimalInTotalPrice) || 0));
  const pricePlaces = Math.min(6, Math.max(0, Number(decimalInPrice) || 0));
  const percentages = 100n * powers[6];
  let vat;
  try { vat = decimalUnits(vatRate, 6); } catch { vat = 0n; }
  const totals = { grossAmount: 0n, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
  const calculated = items.map(item => {
    try {
      const quantity = decimalUnits(item.quantity, 6);
      const rawPrice = decimalUnits(item.unitPrice, 6);
      const priceFactor = powers[6 - pricePlaces];
      const price = roundedDivide(rawPrice, priceFactor) * priceFactor;
      const discount = decimalUnits(item.discountRate || 0, 6);
      if (discount > percentages) throw new Error('Discount exceeds 100%.');
      const grossAmount = roundedDivide(quantity * price * powers[places], powers[12]);
      const discountAmount = roundedDivide(grossAmount * discount, percentages);
      const afterDiscount = grossAmount - discountAmount;
      const vatAmount = vatInclusive
        ? roundedDivide(afterDiscount * vat, percentages + vat)
        : roundedDivide(afterDiscount * vat, percentages);
      const netAmount = vatInclusive ? afterDiscount - vatAmount : afterDiscount;
      const values = { grossAmount, discountAmount, netAmount, vatAmount, amount: netAmount + vatAmount };
      for (const key of Object.keys(totals)) totals[key] += values[key];
      return { unitPrice: decimalString(price, 6), ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, decimalString(value, places)])) };
    } catch {
      return Object.fromEntries(Object.keys(totals).map(key => [key, '0']));
    }
  });
  return { items: calculated, ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, decimalString(value, places)])) };
}
