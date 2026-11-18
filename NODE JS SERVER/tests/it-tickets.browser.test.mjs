import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const projects = { SalesSystem: 'sales', PurchasingSystem: 'purchasing', WarehouseSystem: 'warehouse', ConfigurationSystem: 'configuration', ITTicketSystem: 'itticket' };
const labels = { sales: 'Sales', purchasing: 'Purchasing', warehouse: 'Warehouse', configuration: 'Configuration', itticket: 'IT Support' };
const actors = Object.fromEntries(Object.values(projects).map(system => [system, { id: 11, system, name: labels[system] + ' Test User', username: 'mock_' + system, role: system === 'itticket' ? 'it' : system === 'sales' ? 'sales' : system, isActive: true }]));
const pdfBytes = Buffer.from('%PDF-1.7\nMock-only support attachment.\n');

async function fixture(t, project = 'ITTicketSystem') {
  const state = { tickets: [], mutations: [], nextId: 100, nextHistory: 1000, tick: 0 };
  const timestamp = () => new Date(Date.UTC(2026, 10, 18, 1, state.tick++)).toISOString();
  function seed(category, ownerSystem = 'sales', changes = {}) {
    const id = state.nextId++;
    const at = timestamp();
    const owner = actors[ownerSystem];
    const record = { id, number: 'IT-' + String(id).padStart(7, '0'), ownerSystem, ownerId: owner.id, ownerName: owner.name, category, note: 'Initial ' + category + ' note ' + id, status: 'pending', version: 1, createdAt: at, updatedAt: at, attachments: [], history: [], ...changes };
    record.history = [{ id: state.nextHistory++, ticketId: id, kind: 'created', status: 'pending', note: record.note, displayNote: record.note, actorSystem: ownerSystem, actorId: record.ownerId, actorName: record.ownerName, createdAt: at }];
    state.tickets.push(record);
    return record;
  }
  function detail(record, system) {
    return { ...structuredClone(record), attachmentCount: record.attachments.length, attachments: record.attachments.map(file => ({ ...file, data: undefined, downloadUrl: '/api/' + system + (system === 'itticket' ? '' : '/helpdesk') + '/tickets/' + record.id + '/attachments/' + file.id })) };
  }
  const app = await mockBrowser(t, async call => {
    const { method, pathname, body, system } = call;
    const actor = actors[system];
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    const prefix = system === 'itticket' ? '/api/tickets' : '/api/helpdesk/tickets';
    if (pathname === prefix && method === 'GET') return { json: { records: state.tickets.filter(record => system === 'itticket' || record.ownerSystem === system && record.ownerId === actor.id).map(record => detail(record, system)) } };
    if (pathname === prefix && method === 'POST') {
      assert.notEqual(system, 'itticket');
      assert.deepEqual(Object.keys(body).sort(), ['attachments', 'category', 'note', 'requestKey']);
      assert.match(body.requestKey.replaceAll('-', ''), /^[a-f\d]{32}$/i);
      assert.ok(['request', 'support'].includes(body.category)); assert.ok(body.note.trim());
      if (body.category === 'request') assert.deepEqual(body.attachments, []);
      const record = seed(body.category, system, { note: body.note });
      record.attachments = body.attachments.map((file, index) => ({ id: index + 1, ticketId: record.id, name: file.name, type: file.type, bytes: Buffer.from(file.data, 'base64').length, data: file.data }));
      state.mutations.push(structuredClone(call));
      return { status: 201, json: { record: detail(record, system) } };
    }
    if (pathname.startsWith(prefix + '/')) {
      const suffix = pathname.slice(prefix.length + 1);
      const id = Number(suffix.split('/')[0]);
      const record = state.tickets.find(ticket => ticket.id === id && (system === 'itticket' || ticket.ownerSystem === system && ticket.ownerId === actor.id));
      if (!record) return { status: 404, json: { message: 'The ticket could not be found.' } };
      if (method === 'GET' && /^\d+$/.test(suffix)) return { json: { record: detail(record, system) } };
      const attachment = suffix.match(/^\d+\/attachments\/(\d+)$/);
      if (method === 'GET' && attachment) {
        const file = record.attachments.find(file => file.id === Number(attachment[1]));
        assert.ok(file); return { contentType: file.type, headers: { 'Content-Disposition': 'attachment; filename="' + file.name + '"' }, body: Buffer.from(file.data, 'base64') };
      }
      assert.equal(system, 'itticket', 'Requester pages must never submit status or note corrections.');
      assert.equal(method, 'PATCH');
      state.mutations.push(structuredClone(call));
      if (body.version !== record.version) return { status: 409, json: { message: 'This ticket changed. Refresh it before saving.' } };
      if (/^\d+\/status$/.test(suffix)) {
        assert.deepEqual(Object.keys(body).sort(), ['note', 'status', 'version']);
        assert.ok(body.status === 'ongoing' || body.note.trim(), 'Every non-ongoing status needs its audit note.');
        const at = timestamp();
        record.status = body.status; record.version++; record.updatedAt = at;
        record.history.push({ id: state.nextHistory++, ticketId: id, kind: 'status', status: body.status, note: body.note, displayNote: body.note, actorSystem: system, actorId: actor.id, actorName: actor.name, createdAt: at });
        return { json: { record: detail(record, system) } };
      }
      const correction = suffix.match(/^\d+\/history\/(\d+)\/note$/);
      if (correction) {
        assert.deepEqual(Object.keys(body).sort(), ['note', 'version']);
        const original = record.history.find(entry => entry.id === Number(correction[1]));
        assert.ok(original && original.actorSystem === 'itticket');
        const at = timestamp();
        record.version++; record.updatedAt = at;
        original.displayNote = body.note; original.noteEditedAt = at; original.noteEditedBy = actor.name;
        record.history.push({ id: state.nextHistory++, ticketId: id, kind: 'note-edit', status: original.status, note: body.note, displayNote: body.note, targetHistoryId: original.id, actorSystem: system, actorId: actor.id, actorName: actor.name, createdAt: at });
        return { json: { record: detail(record, system) } };
      }
    }
    if (method === 'GET' && pathname === '/api/configuration') return { json: { modules: [{ kind: 'atc', title: 'ATC', fields: [{ key: 'code', label: 'Code', type: 'text', required: true, default: '' }], readOnly: false }] } };
    if (method === 'GET' && pathname === '/api/configuration/atc') return { json: { records: [] } };
    if (method === 'GET' && pathname === '/api/purchasing-options') return { json: { suppliers: [], supplies: [], currencies: [], paymentTerms: [], vatCodes: [], warehouses: [], locations: [] } };
    if (method === 'GET' && ['/api/customers', '/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users', '/api/purchase-requests', '/api/inventory'].includes(pathname)) return { json: { records: [] } };
    throw new Error('Unexpected isolated ticket request: ' + system + ' ' + method + ' ' + pathname);
  }, { project, viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  app.page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  t.after(() => app.assertSafe());
  return { ...app, state, seed, consoleErrors };
}

async function openWorkspace(app, project) {
  if (project) await app.gotoProject(project); else await app.page.goto(app.origin);
  if (project === 'ITTicketSystem') { await expect(app.page.getByRole('heading', { name: 'IT Ticket Monitoring', level: 1, exact: true })).toBeVisible(); return; }
  await expect(app.page.locator('.sidebar').getByRole('button', { name: 'Help Desk', exact: true })).toBeVisible();
  try { await app.page.locator('.sidebar').getByRole('button', { name: 'Help Desk', exact: true }).click(); }
  catch (error) {
    await app.screenshot('helpdesk-navigation-failure.png');
    throw new Error(error.message + '\nPage text: ' + (await app.page.locator('body').innerText()).slice(0, 3000) + '\nConsole: ' + JSON.stringify(app.consoleErrors) + '\nCalls: ' + JSON.stringify(app.apiRequests.map(({ system, method, pathname }) => ({ system, method, pathname }))));
  }
  await expect(app.page.getByRole('heading', { name: 'Help Desk', level: 1, exact: true })).toBeVisible();
}

async function openManager(app) {
  await app.page.goto(app.origin);
  await expect(app.page.getByRole('heading', { name: 'IT Ticket Monitoring', level: 1, exact: true })).toBeVisible();
}

async function assertPageFits(app, screenshotName) {
  const geometry = await app.page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('body *')].flatMap(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.right > innerWidth + 1 && getComputedStyle(element).visibility !== 'hidden' ? [{ tag: element.tagName, className: element.className?.baseVal ?? element.className, width: rect.width, left: rect.left, right: rect.right }] : [];
  }).slice(0, 15) }));
  await app.screenshot(screenshotName);
  assert.ok(geometry.scrollWidth <= geometry.width, JSON.stringify(geometry));
}

async function openTicket(app, record, mobile = false) {
  await app.page.getByRole('button', { name: (mobile ? 'Open ticket ' : 'View ticket ') + record.number, exact: true }).click();
  const dialog = app.page.getByRole('dialog', { name: record.number, exact: true });
  await expect(dialog.locator('.helpdesk-timeline')).toBeVisible();
  return dialog;
}

for (const project of ['SalesSystem', 'PurchasingSystem', 'WarehouseSystem', 'ConfigurationSystem']) {
  test(project + ' Help Desk requires category/note, limits uploads to Support, and monitors only its own tickets without status controls', { timeout: 90000 }, async t => {
    const app = await fixture(t, project);
    const { page, state } = app;
    const system = projects[project];
    const hidden = app.seed('request', system, { ownerId: 99, ownerName: 'Other private requester', note: 'PRIVATE-OTHER-USER' });
    await openWorkspace(app);
    await expect(page.locator('.helpdesk-workspace')).not.toContainText(hidden.number);
    await expect(page.locator('.helpdesk-workspace')).not.toContainText('PRIVATE-OTHER-USER');
    await page.getByRole('button', { name: 'New ticket', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'New help desk ticket', exact: true });
    const submit = dialog.getByRole('button', { name: 'Submit ticket', exact: true });
    await submit.click();
    await expect(dialog.getByRole('alert')).toHaveText('Choose Request or Support Request.');
    await dialog.getByLabel('Ticket category', { exact: true }).selectOption('request');
    await submit.click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter the initial note for this ticket.');
    await expect(dialog.getByLabel('Support attachments', { exact: true })).toHaveCount(0);
    await dialog.getByLabel('Ticket category', { exact: true }).selectOption('support');
    await dialog.getByLabel('Support attachments', { exact: true }).setInputFiles({ name: 'support-only.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
    await expect(dialog.locator('.helpdesk-upload')).toContainText('support-only.pdf');
    await dialog.getByLabel('Ticket category', { exact: true }).selectOption('request');
    await expect(dialog.getByLabel('Support attachments', { exact: true })).toHaveCount(0);
    assert.equal(state.mutations.length, 0);
    await dialog.getByLabel('Initial note', { exact: true }).fill('Need a replacement monitor for ' + system);
    await submit.click();
    await expect(dialog).toHaveCount(0);
    const request = state.tickets.at(-1);
    dialog = page.getByRole('dialog', { name: request.number, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.helpdesk-next-step')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Edit status note/ })).toHaveCount(0);
    await expect(dialog.locator('.helpdesk-detail-top .helpdesk-status')).toHaveText('Pending');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'New ticket', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'New help desk ticket', exact: true });
    await dialog.getByLabel('Ticket category', { exact: true }).selectOption('support');
    await dialog.getByLabel('Initial note', { exact: true }).fill('Printer support concern for ' + system);
    const upload = dialog.getByLabel('Support attachments', { exact: true });
    await upload.setInputFiles({ name: 'unsafe.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not allowed') });
    await expect(dialog.getByRole('alert')).toContainText('Choose PDF');
    assert.equal(state.mutations.length, 1);
    await upload.setInputFiles({ name: 'printer-evidence.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
    await expect(dialog.locator('.helpdesk-upload')).toContainText('printer-evidence.pdf');
    await dialog.getByRole('button', { name: 'Submit ticket', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const support = state.tickets.at(-1);
    dialog = page.getByRole('dialog', { name: support.number, exact: true });
    await expect(dialog).toBeVisible();
    const download = dialog.getByRole('link', { name: 'Download printer-evidence.pdf', exact: true });
    await expect(download).toHaveAttribute('href', '/api/' + system + '/helpdesk/tickets/' + support.id + '/attachments/1');
    assert.equal(support.attachments[0].data, pdfBytes.toString('base64'));
    assert.equal(state.mutations.length, 2);
    assert.ok(state.mutations.every(call => call.method === 'POST' && call.system === system && call.pathname === '/api/helpdesk/tickets'));
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('.helpdesk-table-scroll')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open ticket ' + support.number, exact: true })).toBeVisible();
    await assertPageFits(app, 'helpdesk-' + system + '-mobile.png');
    dialog = await openTicket(app, support, true);
    await expect(dialog.locator('.helpdesk-next-step')).toHaveCount(0);
    await expect(dialog.locator('.helpdesk-event-meta time').first()).toHaveAttribute('datetime', support.createdAt);
    await expect(dialog).toContainText('PHT');
    await app.screenshot('helpdesk-' + system + '-mobile.png');
    app.assertSafe();
  });
}

test('IT Request Proceed is confirmed before writing, ongoing note is optional and Complete requires return note plus verbal confirmation visible to its requester', { timeout: 90000 }, async t => {
  const app = await fixture(t);
  const record = app.seed('request');
  const { page, state } = app;
  await openManager(app);
  let detail = await openTicket(app, record);
  await detail.getByRole('button', { name: 'Proceed', exact: true }).click();
  let action = page.getByRole('dialog', { name: 'Proceed with this request?', exact: true });
  await expect(action).toBeVisible();
  assert.equal(state.mutations.length, 0, 'Opening Proceed must not change ticket status.');
  await expect(action.getByLabel('Status note', { exact: true })).not.toHaveAttribute('required');
  await action.getByRole('button', { name: 'Confirm Proceed', exact: true }).click();
  await expect(action).toHaveCount(0);
  assert.equal(record.status, 'ongoing');
  assert.equal(record.history.at(-1).note, '');
  await expect(detail.locator('.helpdesk-detail-top .helpdesk-status')).toHaveText('On going');
  await detail.getByRole('button', { name: 'Complete', exact: true }).click();
  action = page.getByRole('dialog', { name: 'Confirm returned item', exact: true });
  await action.getByRole('button', { name: 'Confirm complete', exact: true }).click();
  await expect(action.getByRole('alert')).toHaveText('Enter a note for this status change.');
  await action.getByLabel('Status note', { exact: true }).fill('Monitor returned; verbally confirmed with requester.');
  await action.getByRole('button', { name: 'Confirm complete', exact: true }).click();
  await expect(action.getByRole('alert')).toHaveText('Confirm the verbal item return before completing this request.');
  assert.equal(state.mutations.length, 1);
  await action.getByRole('checkbox', { name: 'The item return was verbally confirmed.', exact: true }).check();
  await action.getByRole('button', { name: 'Confirm complete', exact: true }).click();
  await expect(action).toHaveCount(0);
  assert.equal(record.status, 'complete');
  assert.deepEqual(record.history.map(entry => entry.status), ['pending', 'ongoing', 'complete']);
  await detail.getByRole('button', { name: 'Close', exact: true }).click();
  await openWorkspace(app, 'SalesSystem');
  detail = await openTicket(app, record);
  await expect(detail.locator('.helpdesk-detail-top .helpdesk-status')).toHaveText('Complete');
  await expect(detail).toContainText('Monitor returned; verbally confirmed with requester.');
  await expect(detail.locator('.helpdesk-next-step')).toHaveCount(0);
  assert.equal(state.mutations.length, 2);
  app.assertSafe();
});

test('IT Support uses required progress/complete notes, optional ongoing notes, and append-only timestamped corrections visible to its owner', { timeout: 90000 }, async t => {
  const app = await fixture(t);
  const record = app.seed('support', 'warehouse');
  const { page, state } = app;
  await openManager(app);
  let detail = await openTicket(app, record);
  await detail.getByRole('button', { name: 'Mark in progress', exact: true }).click();
  let action = page.getByRole('dialog', { name: 'Mark ticket in progress', exact: true });
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action.getByRole('alert')).toHaveText('Enter a note for this status change.');
  assert.equal(state.mutations.length, 0);
  await action.getByLabel('Status note', { exact: true }).fill('Investigating the warehouse printer.');
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action).toHaveCount(0);
  await detail.getByRole('button', { name: 'Mark on going', exact: true }).click();
  action = page.getByRole('dialog', { name: 'Mark ticket on going', exact: true });
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action).toHaveCount(0);
  const original = record.history.at(-1);
  const originalAt = original.createdAt;
  const originalId = original.id;
  assert.equal(original.note, '');
  await detail.getByRole('button', { name: 'Edit status note for activity ' + originalId, exact: true }).click();
  action = page.getByRole('dialog', { name: 'Edit status note', exact: true });
  await action.getByLabel('Corrected status note', { exact: true }).fill('Waiting for the replacement printer head.');
  await action.getByRole('button', { name: 'Save note correction', exact: true }).click();
  await expect(action).toHaveCount(0);
  assert.equal(original.note, '', 'Correcting a note must retain its original saved contents.');
  assert.equal(original.createdAt, originalAt, 'Correcting a note must not change the original activity time.');
  assert.equal(record.history.at(-1).kind, 'note-edit');
  assert.equal(record.history.at(-1).targetHistoryId, originalId);
  assert.notEqual(record.history.at(-1).createdAt, originalAt);
  const originalRow = detail.locator('.helpdesk-timeline > li').filter({ has: page.locator('time[datetime="' + originalAt + '"]') });
  await expect(originalRow).toContainText('Waiting for the replacement printer head.');
  await expect(originalRow.locator('time')).toHaveAttribute('datetime', originalAt);
  await expect(detail.locator('.helpdesk-note-correction')).toHaveCount(1);
  await originalRow.getByText('View original note', { exact: true }).click();
  await expect(originalRow.locator('.helpdesk-original-note')).toContainText('No note added.');
  await detail.getByRole('button', { name: 'Complete', exact: true }).click();
  action = page.getByRole('dialog', { name: 'Mark ticket complete', exact: true });
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action.getByRole('alert')).toHaveText('Enter a note for this status change.');
  await action.getByLabel('Status note', { exact: true }).fill('Replaced printer head and verified printing.');
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action).toHaveCount(0);
  await detail.getByRole('button', { name: 'Close', exact: true }).click();
  await openWorkspace(app, 'WarehouseSystem');
  detail = await openTicket(app, record);
  await expect(detail).toContainText('Waiting for the replacement printer head.');
  await expect(detail).toContainText('Replaced printer head and verified printing.');
  await expect(detail.getByRole('button', { name: /Edit status note/ })).toHaveCount(0);
  await expect(detail.locator('.helpdesk-next-step')).toHaveCount(0);
  assert.equal(state.mutations.length, 4);
  app.assertSafe();
});

test('IT Decline requires a note, and stale version conflicts retain the manager draft without applying a status change', { timeout: 90000 }, async t => {
  const app = await fixture(t);
  const declined = app.seed('support', 'purchasing');
  const stale = app.seed('support', 'configuration');
  const { page, state } = app;
  await openManager(app);
  let detail = await openTicket(app, declined);
  await detail.getByRole('button', { name: 'Decline', exact: true }).click();
  let action = page.getByRole('dialog', { name: 'Mark ticket declined', exact: true });
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action.getByRole('alert')).toHaveText('Enter a note for this status change.');
  await action.getByLabel('Status note', { exact: true }).fill('This duplicate concern is covered by the existing ticket.');
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action).toHaveCount(0);
  assert.equal(declined.status, 'declined');
  await expect(detail.locator('.helpdesk-status-actions')).toHaveCount(0);
  await detail.getByRole('button', { name: 'Close', exact: true }).click();
  detail = await openTicket(app, stale);
  await detail.getByRole('button', { name: 'Mark in progress', exact: true }).click();
  action = page.getByRole('dialog', { name: 'Mark ticket in progress', exact: true });
  await action.getByLabel('Status note', { exact: true }).fill('Keep this unsaved investigation note.');
  stale.version++;
  await action.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(action.getByRole('alert')).toContainText('This ticket changed. Refresh it before saving.');
  await expect(action.getByRole('alert')).toContainText('Your note is kept.');
  await expect(action.getByLabel('Status note', { exact: true })).toHaveValue('Keep this unsaved investigation note.');
  assert.equal(stale.status, 'pending');
  assert.equal(stale.history.length, 1);
  assert.equal(state.mutations.length, 2);
  await action.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await assertPageFits(app, 'it-ticket-manager-mobile.png');
  await expect(detail.getByRole('button', { name: 'Mark in progress', exact: true })).toBeVisible();
  await app.screenshot('it-ticket-manager-mobile.png');
  app.assertSafe();
});
