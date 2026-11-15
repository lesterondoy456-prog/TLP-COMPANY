import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { loadApi } from './helpers/load-api.mjs';

// Real RGB pixels in a valid PNG, not a small image padded with unused bytes.
// Uncompressed IDAT keeps the file above10MB without a large binary fixture.
function largePng() {
  const width = 2048, height = 2048, stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * stride + 1 + x * 3;
    raw[offset] = x % 256; raw[offset + 1] = y % 256; raw[offset + 2] = (x + y) % 256;
  }
  const table = Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    return value >>> 0;
  });
  const chunk = (name, data) => {
    const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    let crc = 0xffffffff;
    for (const byte of type) crc = table[(crc ^ byte) & 255] ^ crc >>> 8;
    for (const byte of data) crc = table[(crc ^ byte) & 255] ^ crc >>> 8;
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

const png = largePng();
const pngHash = createHash('sha256').update(png).digest('hex');
const dataPrefix = 'data:image/png;base64,';
const photoLength = dataPrefix.length + 4 * Math.ceil(png.length / 3);
assert.ok(png.length > 10 * 1024 * 1024);

async function assertPreview(dialog) {
  const photo = dialog.locator('.photo-field .avatar img');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate(image => image.complete && image.naturalWidth === 2048 && image.naturalHeight === 2048)).toBe(true);
  assert.equal(await photo.evaluate(image => image.getAttribute('src').length), photoLength);
  await expect(dialog.locator('.photo-field').getByRole('alert')).toHaveCount(0);
}

async function upload(dialog) {
  await expect(dialog.locator('.photo-field')).not.toContainText('250 KB');
  await dialog.getByLabel('Profile photo', { exact: true }).setInputFiles({ name: 'valid-over-10mb.png', mimeType: 'image/png', buffer: png });
  await assertPreview(dialog);
}

function inspectPhoto(value) {
  if (value === null) return { bytes: 0, hash: null, characters: 0 };
  assert.equal(typeof value, 'string');
  assert.equal(value.startsWith(dataPrefix), true);
  assert.equal(value.length, photoLength, 'The whole data URI reaches the mocked endpoint.');
  const decoded = Buffer.from(value.slice(dataPrefix.length), 'base64');
  const hash = createHash('sha256').update(decoded).digest('hex');
  assert.equal(decoded.length, png.length);
  assert.equal(hash, pngHash, 'The submitted photo preserves every PNG byte.');
  return { bytes: decoded.length, hash, characters: value.length };
}

const systems = [
  { project: 'SalesSystem', system: 'sales', first: 'Customer', manager: 'SalesUserLogin', role: 'sales' },
  { project: 'PurchasingSystem', system: 'purchasing', first: 'PR Monitoring', manager: 'PurchasingUserLogin', role: 'purchasing' },
  { project: 'WarehouseSystem', system: 'warehouse', first: 'Supplies Stock', manager: 'WarehouseUserLogin', role: 'warehouse' },
  { project: 'ConfigurationSystem', system: 'configuration', first: 'ATC', manager: 'ConfigurationUserLogin', role: 'configuration' },
];

for (const settings of systems) {
  test(`${settings.project} previews, submits and removes a real photo larger than10MB in profile and account forms`, { timeout: 120000 }, async t => {
    let actor = { id: 1, system: settings.system, name: 'Photo Administrator', username: 'permanent_photo_admin', role: 'admin', isActive: true, cpnumber: null, email: null, photo: null };
    const accounts = [];
    const writes = [];
    const modules = settings.system === 'configuration' ? loadApi('configuration').configurationMetadata() : [];
    const app = await mockBrowser(t, async ({ method, pathname, body }) => {
      if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
      if (method === 'GET' && pathname === '/api/users') return { json: { records: [actor, ...accounts] } };
      if (method === 'GET' && pathname === '/api/configuration') return { json: { modules } };
      if (method === 'PUT' && pathname === '/api/auth/profile') {
        assert.equal(Object.hasOwn(body, 'username'), false);
        const photo = inspectPhoto(body.photo);
        writes.push({ method, pathname, ...photo, name: body.name, email: body.email, mobile: body.cpnumber });
        actor = { ...actor, ...body };
        return { json: { user: actor } };
      }
      if (method === 'POST' && pathname === '/api/users') {
        const photo = inspectPhoto(body.photo);
        writes.push({ method, pathname, ...photo, username: body.username, role: body.role, password: body.password });
        const { password, ...profile } = body;
        const record = { ...profile, id: 2, system: settings.system };
        accounts.push(record);
        return { status: 201, json: { record } };
      }
      if (method === 'GET') return { json: { records: [] } };
      throw new Error('Only mocked account/profile writes are allowed; no business records may be saved.');
    }, { project: settings.project });
    const { page, origin } = app;
    await page.goto(origin);
    await expect(page.getByRole('heading', { level: 1, name: settings.first, exact: true })).toBeVisible();
    const openProfile = async () => {
      await page.locator('.sidebar').getByRole('button', { name: 'Open profile: ' + actor.name, exact: true }).click();
      return page.getByRole('dialog', { name: 'My profile', exact: true });
    };
    let profile = await openProfile();
    await upload(profile);
    await profile.locator('.photo-field').screenshot({ path: fileURLToPath(new URL(`../.qa/screenshots/${settings.system}-large-photo-preview.png`, import.meta.url)) });
    await profile.getByLabel('Full name *', { exact: true }).fill('Updated ' + settings.system + ' Photo Profile');
    await profile.getByLabel('Email', { exact: true }).fill('photo-' + settings.system + '@example.test');
    await profile.getByLabel('Mobile number', { exact: true }).fill('+63 917 123 4567');
    await profile.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(profile).toHaveCount(0);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].bytes, png.length);
    assert.equal(writes[0].name, 'Updated ' + settings.system + ' Photo Profile');
    assert.equal(writes[0].email, 'photo-' + settings.system + '@example.test');
    assert.equal(writes[0].mobile, '+63 917 123 4567');
    assert.equal(actor.username, 'permanent_photo_admin');

    profile = await openProfile();
    await assertPreview(profile);
    await profile.locator('.photo-field').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(profile.locator('.photo-field .avatar img')).toHaveCount(0);
    await profile.getByLabel('Full name *', { exact: true }).fill('Final ' + settings.system + ' Profile');
    await profile.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(profile).toHaveCount(0);
    assert.equal(writes.length, 2);
    assert.equal(writes[1].hash, null);
    assert.equal(actor.photo, null, 'Removing the photo submits NULL.');

    await page.locator('.sidebar').getByRole('button', { name: settings.manager, exact: true }).click();
    await page.getByRole('button', { name: 'New user', exact: false }).click();
    const account = page.getByRole('dialog', { name: 'New user account', exact: true });
    await account.getByLabel('Full name *', { exact: true }).fill('Large Photo ' + settings.system + ' Account');
    await expect(account.getByRole('textbox', { name: /^Username/ })).toBeEditable();
    await account.getByRole('textbox', { name: /^Username/ }).fill('large_photo_' + settings.system);
    await account.getByLabel(/^Password \*/).fill('Mock12');
    await upload(account);
    await account.getByRole('button', { name: 'Save user', exact: true }).click();
    await expect(account).toHaveCount(0);
    assert.equal(writes.length, 3);
    assert.equal(writes[2].pathname, '/api/users');
    assert.equal(writes[2].bytes, png.length);
    assert.equal(writes[2].hash, pngHash);
    assert.equal(writes[2].username, 'large_photo_' + settings.system);
    assert.equal(writes[2].role, settings.role);
    assert.equal(writes[2].password, 'Mock12');
    assert.ok(app.apiRequests.filter(call => call.method !== 'GET').every(call => ['/api/auth/profile', '/api/users'].includes(call.pathname)));
    app.assertSafe();
    t.diagnostic(`PNG fixture: ${png.length}bytes, ${photoLength} data-URI characters; profile and account payload hashes match.`);
  });
}
