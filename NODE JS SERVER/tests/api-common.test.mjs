import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_BODY, checkOrigin, errorResponse, json, methodNotAllowed, readJson } from '../Api/common.js';
import { ApiError } from '../components/errors.js';

test('each frontend port can send same-origin proxy writes while cross-origin writes are rejected', () => {
  for (const port of [5188, 5190, 5191, 5192]) {
    const origin = `http://127.0.0.1:${port}`;
    assert.doesNotThrow(() => checkOrigin(new Request(origin + '/api/mock', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' } })));
    assert.throws(() => checkOrigin(new Request(origin + '/api/mock', { method: 'POST', headers: { Origin: 'http://unrelated.example' } })), error => error.status === 403);
    assert.throws(() => checkOrigin(new Request(origin + '/api/mock', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'cross-site' } })), error => error.status === 403);
  }
});

test('shared JSON parsing rejects invalid objects, content types, and oversized UTF-8 bodies', async () => {
  const request = body => new Request('http://127.0.0.1:5189/api/mock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.deepEqual(await readJson(request('{"name":"Mock"}')), { name: 'Mock' });
  for (const body of ['[]', 'null', 'true', '{broken']) await assert.rejects(readJson(request(body)), error => error.status === 400);
  await assert.rejects(readJson(new Request('http://127.0.0.1:5189/api/mock', { method: 'POST', body: '{}' })), error => error.status === 415);
  await assert.rejects(readJson(request(JSON.stringify({ text: 'é'.repeat(MAX_BODY / 2 + 1) }))), error => error.status === 413);
});

test('shared responses retain structured errors, allowed methods, and no-store JSON headers', async () => {
  const response = json({ success: true }, 201);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(await response.json(), { success: true });
  const denied = methodNotAllowed(['GET', 'POST']);
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get('Allow'), 'GET, POST');
  const conflict = errorResponse(new ApiError(409, 'Mock conflict'));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { message: 'Mock conflict' });
  assert.equal(errorResponse({ number: 1205 }).status, 409);
  assert.equal(errorResponse({ originalError: { info: { number: 2627 } } }).status, 409);
});
