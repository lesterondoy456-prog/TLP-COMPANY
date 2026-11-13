import { ApiError } from '../components/errors.js';

export const MAX_BODY = 1024 * 1024;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export async function readJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'Send this request as JSON.');
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY) throw new ApiError(413, 'This request is too large. Keep photos below 550 KB.');
  try {
    const input = JSON.parse(body);
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
    return input;
  } catch { throw new ApiError(400, 'Send a valid JSON object.'); }
}

export function checkOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('Origin');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw new ApiError(403, 'Open this request from your TLP Company workspace.');
  }
}

export function methodNotAllowed(allowed) {
  return json({ message: 'This request method is not supported.' }, 405, { Allow: allowed.join(', ') });
}

function sqlErrorNumber(error) {
  return error?.number || error?.originalError?.number || error?.originalError?.info?.number
    || error?.precedingErrors?.find(item => item.number)?.number;
}

export function errorResponse(error) {
  if (error instanceof ApiError) return json({ message: error.message }, error.status);
  const number = sqlErrorNumber(error);
  if ([2601, 2627].includes(number)) return json({ message: 'This code, SKU, username or sales document already exists. Use a unique value.' }, 409);
  if (number === 547) return json({ message: 'This record is referenced by a sales document and cannot be deleted. Deactivate it instead.' }, 409);
  if (number === 1205) return json({ message: 'Another transaction updated this record. Please retry.' }, 409);
  console.error('API error:', error.code || '', error.message);
  if (['ECONNCLOSED', 'ENOTOPEN', 'ESOCKET', 'ETIMEOUT', 'ELOGIN'].includes(error.code) || /Database is unavailable/.test(error.message)) {
    return json({ message: 'The database is unavailable. Check SQL Server and try again.' }, 503);
  }
  return json({ message: 'Unable to save or load this record. Please try again.' }, 500);
}
