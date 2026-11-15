import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { loadApi } from './helpers/load-api.mjs';

const systems = [
  { project: 'SalesSystem', system: 'sales', first: 'Customer', next: 'Product', count: 8 },
  { project: 'PurchasingSystem', system: 'purchasing', first: 'PR Monitoring', next: 'PO Monitoring', count: 6 },
  { project: 'WarehouseSystem', system: 'warehouse', first: 'Supplies Stock', next: 'WarehouseUserLogin', count: 2 },
  { project: 'ConfigurationSystem', system: 'configuration', first: 'ATC', next: 'Bank', count: 14 },
];

async function frames(page) {
  await page.evaluate(async () => { for (let frame = 0; frame < 4; frame++) await new Promise(resolve => requestAnimationFrame(resolve)); });
}

async function assertIndicatorAligned(sidebar) {
  const result = await sidebar.evaluate(element => {
    const active = element.querySelector('.nav-item.active').getBoundingClientRect();
    const pill = element.querySelector('.sidebar-active-indicator').getBoundingClientRect();
    return { offset: Math.abs(active.top - pill.top), height: Math.abs(active.height - pill.height) };
  });
  assert.ok(result.offset <= 1 && result.height <= 1, 'Reopened navigation keeps the pill aligned with the selected row.');
}

for (const settings of systems) {
  test(`${settings.project} opens a full mobile drawer independently of the saved desktop icon rail`, { timeout: 90000 }, async t => {
    const actor = { id: 1, system: settings.system, name: 'Mobile Sidebar Admin', username: 'mock_mobile_sidebar', role: 'admin', isActive: true, photo: null };
    const modules = settings.system === 'configuration' ? loadApi('configuration').configurationMetadata() : [];
    const app = await mockBrowser(t, async ({ method, pathname }) => {
      assert.equal(method, 'GET', 'Mobile drawer QA must never save business or profile records.');
      if (pathname === '/api/auth/session') return { json: { user: actor } };
      if (pathname === '/api/configuration') return { json: { modules } };
      if (pathname === '/api/users') return { json: { records: [actor] } };
      return { json: { records: [] } };
    }, { project: settings.project, viewport: { width: 320, height: 480 } });
    const { page, origin } = app;
    const storageKey = `tti-${settings.system}-sidebar-collapsed`;
    await page.addInitScript(key => { if (localStorage.getItem(key) === null) localStorage.setItem(key, 'true'); }, storageKey);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(origin);
    await expect(page.getByRole('heading', { level: 1, name: settings.first, exact: true })).toBeVisible();
    // Ensure every app has real background scrolling to test the drawer lock.
    await page.evaluate(() => { const spacer = document.createElement('div'); spacer.id = 'mobile-lock-probe'; spacer.style.height = '1600px'; document.querySelector('.workspace-content').append(spacer); });
    const sidebar = page.locator('.sidebar');
    const navigation = sidebar.locator('.sidebar-navigation');
    const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
    const close = sidebar.getByRole('button', { name: 'Close sidebar', exact: true });
    const profile = sidebar.getByRole('button', { name: 'Open profile: ' + actor.name, exact: true });
    const originalOverflow = await page.evaluate(() => document.body.style.overflow);
    for (const [index, viewport] of [{ width: 320, height: 480 }, { width: 375, height: 620 }, { width: 390, height: 520 }, { width: 600, height: 500 }, { width: 900, height: 600 }].entries()) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => scrollTo(0, 0));
      await expect(opener).toBeVisible();
      await expect(opener).toHaveAttribute('aria-expanded', 'false');
      await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
      assert.equal(await sidebar.evaluate(element => element.inert), true, 'Closed drawer controls cannot receive focus.');
      await opener.click();
      await expect(sidebar).toHaveClass(/open/);
      await expect(sidebar).toHaveCSS('width', '246px');
      await expect(opener).toHaveAttribute('aria-expanded', 'true');
      assert.equal(await sidebar.evaluate(element => element.inert), false);
      await expect(close).toBeInViewport();
      await expect(sidebar.getByRole('button', { name: /^(Expand|Collapse) sidebar$/ })).toHaveCount(0);
      await expect(sidebar.locator('.nav-item')).toHaveCount(settings.count);
      for (const item of await sidebar.locator('.nav-item').all()) {
        const label = item.locator('span').first();
        await expect(label).toBeVisible();
        assert.ok(await label.evaluate(element => { const rect = element.getBoundingClientRect(), parent = element.closest('.sidebar').getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(element); return rect.width > 0 && [...range.getClientRects()].every(line => line.left >= parent.left && line.right <= parent.right); }), 'Full navigation names fit inside the drawer.');
      }
      await expect(sidebar.locator('.sidebar-time')).toBeVisible();
      await expect(sidebar.locator('.sidebar-time-compact')).toBeHidden();
      await expect(profile).toBeInViewport();
      await expect(sidebar.getByRole('button', { name: 'Sign out', exact: true })).toBeInViewport();
      await expect(sidebar.locator('.theme-toggle')).toBeInViewport();
      const footerBefore = await sidebar.locator('.sidebar-bottom').boundingBox();
      const headerBefore = await sidebar.locator('.sidebar-header').boundingBox();
      const overflow = await navigation.evaluate(element => element.scrollHeight > element.clientHeight);
      if (overflow) {
        await navigation.evaluate(element => { element.scrollTop = element.scrollHeight; });
        assert.equal((await sidebar.locator('.sidebar-bottom').boundingBox()).y, footerBefore.y);
        assert.equal((await sidebar.locator('.sidebar-header').boundingBox()).y, headerBefore.y);
        await expect(sidebar.locator('.nav-item').last()).toBeInViewport();
        await navigation.evaluate(element => { element.scrollTop = 0; });
      }
      await assertIndicatorAligned(sidebar);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.mouse.move(viewport.width - 5, viewport.height - 5);
      await page.mouse.wheel(0, 350); await frames(page);
      assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'The background stays still while the mobile drawer is open.');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (index === 0) await page.screenshot({ path: fileURLToPath(new URL(`../.qa/screenshots/${settings.system}-full-drawer-320.png`, import.meta.url)), fullPage: false });

      if (index === 1) {
        await page.keyboard.press('Escape');
        await expect(opener).toBeFocused();
      } else if (index === 2) await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: viewport.width - 5, y: viewport.height - 5 } });
      else if (index === 3) {
        await sidebar.getByRole('button', { name: settings.next, exact: true }).click();
        await expect(page.getByRole('heading', { level: 1, name: settings.next, exact: true })).toBeVisible();
      } else await close.click();
      await expect(sidebar).not.toHaveClass(/open/);
      await expect(page.locator('.sidebar-scrim')).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), originalOverflow);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'true');
    }

    // Profile closes the drawer, then resizing an open drawer restores desktop mode.
    await page.setViewportSize({ width: 375, height: 620 });
    await page.evaluate(() => scrollTo(0, 0));
    await opener.click(); await profile.click();
    await expect(page.getByRole('dialog', { name: 'My profile', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar-scrim')).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), originalOverflow);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await opener.click();
    await page.setViewportSize({ width: 901, height: 700 });
    await expect(page.locator('.sidebar-scrim')).toHaveCount(0);
    await expect(sidebar).toHaveCSS('width', '76px');
    await expect(page.locator('.main-shell')).toHaveCSS('margin-left', '104px');
    assert.equal(await page.evaluate(() => document.body.style.overflow), originalOverflow);
    assert.equal(await sidebar.evaluate(element => element.inert), false);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await expect(sidebar).toHaveCSS('width', '76px');
    await sidebar.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    await expect(sidebar).toHaveCSS('width', '246px');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'false');
    await page.setViewportSize({ width: 320, height: 480 });
    await page.evaluate(() => scrollTo(0, 0));
    await opener.click();
    await expect(sidebar).toHaveCSS('width', '246px');
    await close.click();
    await page.setViewportSize({ width: 1920, height: 1000 });
    await expect(sidebar).toHaveCSS('width', '246px');
    await expect(page.locator('.main-shell')).toHaveCSS('margin-left', '274px');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'false');
    assert.ok(app.apiRequests.every(request => request.method === 'GET'));
    app.assertSafe();
  });
}
