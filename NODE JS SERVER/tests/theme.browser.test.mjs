import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { loadApi } from './helpers/load-api.mjs';

const projects = [
  { project: 'SalesSystem', system: 'sales', heading: 'Customer', initial: '/api/customers', next: 'Product', count: 7, form: 'New customer' },
  { project: 'PurchasingSystem', system: 'purchasing', heading: 'PR Monitoring', initial: '/api/purchase-requests', next: 'PO Monitoring', count: 6, form: 'New purchase request' },
  { project: 'WarehouseSystem', system: 'warehouse', heading: 'Supplies Stock', initial: '/api/inventory', next: 'WarehouseUserLogin', count: 2, form: 'New user' },
  { project: 'ConfigurationSystem', system: 'configuration', heading: 'ATC', initial: '/api/configuration/atc', next: 'Bank', count: 14, form: 'New record' },
];

async function settled(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
}

function fixtures(system) {
  if (system === 'sales') return {
    '/api/customers': [{ id: 1, code: 'C-00000001', name: 'Northline Packaging Corporation', contactPerson: 'R. Santos', email: 'orders@northline.test', cpnumber: '09171234567', address: 'Quezon City', category: 'Industrial', isActive: true }],
  };
  if (system === 'warehouse') return {
    '/api/inventory': [{ id: 1, suppliesId: 30, code: 'S-PAPER-01', name: 'Kraft Paper Roll', description: 'Natural kraft packaging material', unit: 'kg', category: 'Raw Materials', quantity: '1420.000000', warehouseId: 1, warehouseCode: 'MAIN', locationId: 1, locationCode: 'A-01', imLot: 'LOT-001', qcStatus: 'Passed' }],
  };
  if (system === 'purchasing') return {
    '/api/purchase-requests': [{ id: 1, number: 'PR-00000001', prDate: '2026-11-13', neededDate: '2026-11-20', requestedBy: 'J. Reyes', requestedDept: 'Purchasing', remarks: 'Packaging replenishment', status: 'draft', items: [{ id: 1, suppliesId: 30, suppliesName: 'Kraft Paper Roll', description: 'Natural kraft material', unit: 'kg', quantity: '250.000000', balanceQuantity: '250.000000', neededDate: '2026-11-20' }] }],
  };
  return { '/api/configuration/atc': [{ id: 1, code: 'WI010', description: 'Professional services', rate: 5, isActive: true }] };
}

for (const specification of projects) {
  test(`${specification.project} supports persistent matte themes, flat navigation, loading motion and a 375px form`, { timeout: 90000 }, async t => {
    const { project, system } = specification;
    const admin = { id: 1, system, name: 'Alex Santos', username: 'admin', role: 'admin', email: 'admin@tlp.test', cpnumber: '', photo: '', isActive: true };
    const records = fixtures(system);
    const modules = system === 'configuration' ? loadApi('configuration').configurationMetadata() : [];
    let release;
    const loading = new Promise(resolve => { release = resolve; });
    let held = false;
    let signedIn = true;
    const app = await mockBrowser(t, async ({ method, pathname }) => {
      if (method === 'GET' && pathname === '/api/auth/session') return signedIn ? { json: { user: admin } } : { status: 401, json: { message: 'Mock session ended.' } };
      if (method !== 'GET') throw new Error('Theme QA must not write records.');
      if (pathname === specification.initial && !held) { held = true; await loading; }
      if (pathname === '/api/configuration') return { json: { modules } };
      if (pathname === '/api/users') return { json: { records: [admin] } };
      if (pathname === '/api/customer-options') return { json: { salesInCharges: [], countriesOfOrigin: [], countries: [], paymentTerms: [], categories: [], taxCodes: [] } };
      if (pathname.endsWith('options')) return { json: { users: [admin], suppliers: [], supplies: [], products: [], headers: [], units: [], currencies: [], categories: [], warehouses: [], locations: [], offices: [], shipments: [], customers: [] } };
      return { json: { records: records[pathname] || [] } };
    }, { project, viewport: { width: 1440, height: 1000 } });
    const { page, origin } = app;
    await page.addInitScript(() => {
      window.pageMotionCount = 0;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...arguments_) {
        if (this.classList.contains('page-transition')) window.pageMotionCount++;
        return animate.apply(this, arguments_);
      };
    });
    await page.goto(origin);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const skeleton = page.locator('.loading-skeleton').first();
    await expect(skeleton).toBeVisible();
    assert.ok(await skeleton.locator('.skeleton-bar').count());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(skeleton.locator('.skeleton-bar').first()).toHaveCSS('animation-name', 'none');
    release();
    await expect(page.locator('.loading-skeleton')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: specification.heading, exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await settled(page);
    await expect(page.locator('.sidebar .nav-item')).toHaveCount(specification.count);
    await expect(page.locator('.sidebar .nav-item:visible')).toHaveCount(specification.count);
    await expect(page.locator('.sales-group')).toHaveCount(0);
    const darkSurface = await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor);
    assert.equal(await page.locator('.sidebar').evaluate(element => getComputedStyle(element).backgroundImage), 'none');
    await app.screenshot(`${system}-theme-dark-desktop.png`);
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tlp-theme'))).toBe('light');
    await settled(page);
    const lightSurface = await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor);
    assert.notEqual(lightSurface, darkSurface, 'Changing theme must change the rendered page surface.');
    await app.screenshot(`${system}-theme-light-desktop.png`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('heading', { level: 1, name: specification.heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to dark mode', exact: true })).toBeVisible();
    await settled(page);
    const beforeMotion = await page.evaluate(() => window.pageMotionCount);
    await page.locator('.sidebar').getByRole('button', { name: specification.next, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: specification.next, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.pageMotionCount)).toBeGreaterThan(beforeMotion);
    await settled(page);
    await expect(page.locator('.page-transition')).toHaveCSS('opacity', '1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedCount = await page.evaluate(() => window.pageMotionCount);
    await page.locator('.sidebar').getByRole('button', { name: specification.heading, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: specification.heading, exact: true })).toBeVisible();
    await settled(page);
    assert.equal(await page.evaluate(() => window.pageMotionCount), reducedCount, 'Reduced motion must skip page animations.');
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await settled(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The mobile document must not scroll sideways.');
    await app.screenshot(`${system}-theme-dark-mobile.png`);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/open/);
    await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeVisible();
    await page.locator('.sidebar').getByRole('button', { name: specification.next, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: specification.next, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toHaveCount(0);
    if (system !== 'warehouse') {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.locator('.sidebar').getByRole('button', { name: specification.heading, exact: true }).click();
    }
    await page.getByRole('button', { name: specification.form, exact: false }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settled(page);
    const bounds = await page.getByRole('dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 376, 'A mobile form must fit within the viewport.');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await app.screenshot(`${system}-theme-dark-mobile-form.png`);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await settled(page);
    await app.screenshot(`${system}-theme-light-mobile.png`);
    signedIn = false;
    await page.reload();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    app.assertSafe();
  });
}
