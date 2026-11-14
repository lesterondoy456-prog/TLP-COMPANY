import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { loadApi } from './helpers/load-api.mjs';

const projects = [
  { project: 'SalesSystem', system: 'sales', first: 'Customer', next: 'Product', count: 7 },
  { project: 'PurchasingSystem', system: 'purchasing', first: 'PR Monitoring', next: 'PO Monitoring', count: 6 },
  { project: 'WarehouseSystem', system: 'warehouse', first: 'Supplies Stock', next: 'WarehouseUserLogin', count: 2 },
  { project: 'ConfigurationSystem', system: 'configuration', first: 'ATC', next: 'Bank', count: 14 },
];

for (const { project, system, first, next, count } of projects) {
  test(`${project} has a floating sidebar card, animated active rail and accessible persistent mobile navigation`, { timeout: 90000 }, async t => {
    const user = { id: 1, name: 'Alex Santos', username: 'admin', role: 'admin', system, isActive: true };
    const modules = system === 'configuration' ? loadApi('configuration').configurationMetadata() : [];
    let logoutCalls = 0;
    const app = await mockBrowser(t, async ({ method, pathname }) => {
      if (method === 'POST' && pathname === '/api/auth/logout') { logoutCalls++; return { json: { success: true } }; }
      assert.equal(method, 'GET', 'Sidebar checks must never save a business record or profile.');
      if (pathname === '/api/auth/session') return { json: { user } };
      if (pathname === '/api/configuration') return { json: { modules } };
      if (pathname === '/api/users') return { json: { records: [user] } };
      if (pathname.endsWith('options')) return { json: { salesInCharges: [], countriesOfOrigin: [], countries: [], paymentTerms: [], categories: [], taxCodes: [], vatCodes: [], users: [user], suppliers: [], supplies: [], products: [], headers: [], units: [], currencies: [], warehouses: [], locations: [], shipments: [], customers: [] } };
      return { json: { records: [] } };
    }, { project, viewport: { width: 1440, height: 1000 } });
    const { page, origin } = app;
    const sidebar = page.locator('.sidebar');
    const main = page.locator('.main-shell');
    const navigation = sidebar.locator('.sidebar-navigation');
    const indicator = sidebar.locator('.sidebar-active-indicator');
    const heading = name => page.getByRole('heading', { level: 1, name, exact: true });
    const toggle = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
    const key = `tti-${system}-sidebar-collapsed`;
    await page.goto(origin);
    await expect(heading(first)).toBeVisible();
    await expect(sidebar).toHaveCSS('width', '246px');
    await expect(sidebar).toHaveCSS('left', '14px');
    await expect(sidebar).toHaveCSS('top', '14px');
    await expect(sidebar).toHaveCSS('bottom', '14px');
    await expect(sidebar).toHaveCSS('border-radius', '18px');
    await expect(main).toHaveCSS('margin-left', '274px');
    await expect(sidebar.locator('.brand')).toContainText('TTI Laguna Philippines Inc.');
    await expect(sidebar.locator('.brand-mark')).toBeVisible();
    await expect(sidebar.getByRole('searchbox')).toHaveCount(0);
    await expect(indicator).toBeVisible();
    const expandedWidth = (await main.boundingBox()).width;
    const collapse = toggle('Collapse sidebar');
    await expect(collapse).toHaveCount(1);
    await expect(collapse).toHaveAttribute('aria-controls', `${system}-sidebar`);
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    const sidebarBox = await sidebar.boundingBox();
    const collapseBox = await collapse.boundingBox();
    assert.equal(collapseBox.width, 26);
    assert.equal(collapseBox.height, 26);
    assert.ok(Math.abs(collapseBox.x + collapseBox.width / 2 - sidebarBox.x - sidebarBox.width) <= 2, 'The single collapse control overlaps the card edge.');
    const signout = sidebar.getByRole('button', { name: 'Sign out', exact: true });
    await expect(signout).toBeVisible();
    await expect(signout.locator('svg')).toBeVisible();
    await expect(page.locator('.topbar').getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
    await app.screenshot(`${system}-sidebar-card-dark.png`);
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await app.screenshot(`${system}-sidebar-card-light.png`);
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await collapse.click();
    await expect(sidebar).toHaveCSS('width', '76px');
    await expect(main).toHaveCSS('margin-left', '104px');
    assert.ok((await main.boundingBox()).width >= expandedWidth + 169, 'Collapsing must give the page the freed sidebar width.');
    await expect(toggle('Expand sidebar')).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.locator('.nav-item')).toHaveCount(count);
    for (const button of await sidebar.locator('.nav-item').all()) {
      assert.ok(await button.getAttribute('aria-label'));
      assert.equal(await button.getAttribute('title'), await button.getAttribute('aria-label'));
      await expect(button.locator('svg')).toBeVisible();
      await expect(button.locator('span').first()).toBeHidden();
    }
    await expect(sidebar.getByRole('button', { name: first, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.getByRole('button', { name: first, exact: true })).toHaveClass(/active/);
    await expect(sidebar.locator('.brand-mark')).toBeVisible();
    await expect(signout).toBeVisible();
    await sidebar.getByRole('button', { name: 'Open profile: Alex Santos', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const nextButton = sidebar.getByRole('button', { name: next, exact: true });
    const initialTransform = await indicator.evaluate(element => getComputedStyle(element).transform);
    await indicator.evaluate(element => {
      window.sidebarIndicatorTransitions = [];
      element.addEventListener('transitionrun', event => { window.sidebarIndicatorTransitions.push(event.propertyName); });
    });
    await nextButton.focus();
    await nextButton.press('Enter');
    await expect(heading(next)).toBeVisible();
    await expect(nextButton).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => indicator.evaluate(element => getComputedStyle(element).transform)).not.toBe(initialTransform);
    await expect.poll(() => page.evaluate(() => window.sidebarIndicatorTransitions)).toContain('transform');
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBe('true');
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    });
    await app.screenshot(`${system}-sidebar-icons-desktop.png`);
    await page.reload();
    await expect(heading(first)).toBeVisible();
    await expect(sidebar).toHaveCSS('width', '76px');
    await toggle('Expand sidebar').click();
    await expect(sidebar).toHaveCSS('width', '246px');
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBe('false');
    await page.reload();
    await expect(heading(first)).toBeVisible();
    await expect(sidebar).toHaveCSS('width', '246px');
    if (system === 'configuration') {
      await page.setViewportSize({ width: 1440, height: 768 });
      await expect(sidebar).toHaveCSS('height', '740px');
      assert.ok(await navigation.evaluate(element => element.scrollHeight > element.clientHeight), 'Long Configuration menus scroll inside the card.');
      const footerBefore = await sidebar.locator('.sidebar-bottom').boundingBox();
      const headerBefore = await sidebar.locator('.sidebar-header').boundingBox();
      await navigation.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const footerAfter = await sidebar.locator('.sidebar-bottom').boundingBox();
      const headerAfter = await sidebar.locator('.sidebar-header').boundingBox();
      assert.equal(footerAfter.y, footerBefore.y, 'Scrolling modules must not move the profile and sign-out footer.');
      assert.equal(headerAfter.y, headerBefore.y, 'Scrolling modules must not move the brand.');
      await expect(signout).toBeInViewport();
      await app.screenshot('configuration-sidebar-card-scroll.png');
      await navigation.evaluate(element => { element.scrollTop = 0; });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await toggle('Collapse sidebar').click();
    await expect(sidebar).toHaveCSS('width', '76px');

    // A narrow browser still uses the drawer/scrim, with its own visible toggle inside.
    await page.setViewportSize({ width: 514, height: 900 });
    await expect(main).toHaveCSS('margin-left', '0px');
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(sidebar).toHaveClass(/open/);
    await expect(toggle('Expand sidebar')).toBeVisible();
    await toggle('Expand sidebar').click();
    await expect(sidebar).toHaveCSS('width', '246px');
    await expect(sidebar.getByRole('button', { name: next, exact: true }).locator('span').first()).toBeVisible();
    await sidebar.getByRole('button', { name: next, exact: true }).click();
    await expect(heading(next)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toHaveCount(0);
    await expect(sidebar).not.toHaveClass(/open/);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await sidebar.getByRole('button', { name: 'Open profile: Alex Santos', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(sidebar).not.toHaveClass(/open/);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await toggle('Collapse sidebar').click();
    await expect(sidebar).toHaveCSS('width', '76px');
    await expect(sidebar).toHaveCSS('transition-duration', '0s');
    await expect(main).toHaveCSS('transition-duration', '0s');
    assert.ok(await indicator.evaluate(element => getComputedStyle(element).transitionDuration.split(',').every(value => parseFloat(value) === 0)), 'Reduced motion disables the active indicator transition.');
    await expect(main).toHaveCSS('margin-left', '0px');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The mobile page must not gain horizontal overflow.');
    await page.screenshot({ path: fileURLToPath(new URL(`../.qa/screenshots/${system}-sidebar-icons-mobile.png`, import.meta.url)), fullPage: false });
    await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: 300, y: 100 } });
    await expect(sidebar).not.toHaveClass(/open/);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await sidebar.getByRole('button', { name: first, exact: true }).click();
    await expect(heading(first)).toBeVisible();
    await expect(sidebar).not.toHaveClass(/open/);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(main).toHaveCSS('margin-left', '104px');
    await toggle('Expand sidebar').click();
    await expect(sidebar).toHaveCSS('width', '246px');
    await expect(main).toHaveCSS('margin-left', '274px');
    await toggle('Collapse sidebar').click();
    await expect(sidebar).toHaveCSS('width', '76px');
    await signout.click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    assert.equal(logoutCalls, 1, 'The rail sign-out button uses only the mocked authentication endpoint.');
    app.assertSafe();
  });
}
