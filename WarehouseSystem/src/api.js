export const SYSTEM = 'warehouse';

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const headers = new Headers(options.headers);
  if (write) headers.set('Content-Type', 'application/json');
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin', ...options, method, headers,
      ...(write ? { body: JSON.stringify(options.body ?? {}) } : {}),
    });
  } catch {
    throw new Error('Cannot connect to the server. Check that NODE JS SERVER is running, then try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || 'Unable to complete this request. Please try again.');
    error.status = response.status;
    if (response.status === 401 && path !== '/api/warehouse/auth/login' && path !== '/api/warehouse/auth/session') window.dispatchEvent(new Event('session-expired'));
    throw error;
  }
  const authPath = path.split('?')[0];
  if (['/api/warehouse/auth/session', '/api/warehouse/auth/login', '/api/warehouse/auth/profile'].includes(authPath)
      && (!result.user || result.user.system !== SYSTEM)) {
    throw new Error('The server returned an account for another application. Please sign in here again.');
  }
  return result;
}

function currencyAmount(value, currency, maximumFractionDigits) {
  const code = String(currency || 'PHP').trim().toUpperCase() || 'PHP';
  const format = { minimumFractionDigits: 2, maximumFractionDigits };
  return /^[A-Z]{3}$/.test(code)
    ? new Intl.NumberFormat('en-PH', { ...format, style: 'currency', currency: code }).format(Number(value) || 0)
    : code + ' ' + new Intl.NumberFormat('en-PH', format).format(Number(value) || 0);
}
export const money = (value, currency = 'PHP') => currencyAmount(value, currency, 2);
export const unitMoney = (value, currency = 'PHP') => currencyAmount(value, currency, 6);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const dateInput = value => value ? String(value).slice(0, 10) : '';
export const dateLabel = value => value ? new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(dateInput(value) + 'T00:00:00Z')) : '—';
