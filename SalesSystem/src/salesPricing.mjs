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
