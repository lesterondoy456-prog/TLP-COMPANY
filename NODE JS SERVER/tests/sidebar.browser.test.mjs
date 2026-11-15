import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { loadApi } from './helpers/load-api.mjs';

const projects = [
  { project: 'SalesSystem', system: 'sales', first: 'Customer', next: 'Product', count: 8 },
  { project: 'PurchasingSystem', system: 'purchasing', first: 'PR Monitoring', next: 'PO Monitoring', count: 6 },
  { project: 'WarehouseSystem', system: 'warehouse', first: 'Supplies Stock', next: 'WarehouseUserLogin', count: 2 },
  { project: 'ConfigurationSystem', system: 'configuration', first: 'ATC', next: 'Bank', count: 14 },
];

async function settled(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
}

async function assertFooterClock(page, collapsed, ticking = false) {
  const preferences = page.locator('.sidebar-preferences');
  const clock = preferences.locator('time.sidebar-clock');
  await expect(clock).toBeInViewport();
  const snapshot = await clock.evaluate(element => {
    const timestamp = new Date(element.dateTime);
    const date = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp);
    const time = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(timestamp);
    const compact = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timestamp);
    return { date, time, compact, actualDate: element.querySelector('.sidebar-date').textContent, actualTime: element.querySelector('.sidebar-time').textContent, actualCompact: element.querySelector('.sidebar-time-compact').textContent, label: element.getAttribute('aria-label'), age: Date.now() - timestamp.getTime() };
  });
  assert.equal(snapshot.actualDate, snapshot.date);
  assert.equal(snapshot.actualTime, snapshot.time);
  assert.equal(snapshot.actualCompact, snapshot.compact);
  assert.equal(snapshot.label, 'Philippine time: ' + snapshot.date + ', ' + snapshot.time);
  assert.ok(snapshot.age >= 0 && snapshot.age < 2500, 'The sidebar clock shows current Philippine time.');
  await expect(clock.locator('.sidebar-time')).toBeVisible({ visible: !collapsed });
  await expect(clock.locator('.sidebar-time-compact')).toBeVisible({ visible: collapsed });
  await expect(clock.locator('.sidebar-date')).toBeVisible({ visible: !collapsed });
  const footer = await page.locator('.sidebar-bottom').boundingBox();
  const settings = await preferences.boundingBox();
  const theme = await preferences.locator('.theme-toggle').boundingBox();
  assert.ok(settings.y + settings.height <= footer.y + 1, 'Clock and theme controls sit above the profile footer.');
  assert.ok(theme.y + theme.height <= footer.y + 1);
  if (ticking) {
    const before = await clock.getAttribute('datetime');
    await expect.poll(() => clock.getAttribute('datetime'), { timeout: 3000 }).not.toBe(before);
  }
}

async function sampleIndicatorMovement(target) {
  return target.evaluate(button => new Promise(resolve => {
    const navigation = button.closest('.sidebar-navigation');
    const indicator = navigation.querySelector('.sidebar-active-indicator');
    const position = () => indicator.getBoundingClientRect().top - navigation.getBoundingClientRect().top + navigation.scrollTop;
    const start = position();
    const end = button.offsetTop;
    const began = performance.now();
    const samples = [];
    button.click();
    const frame = timestamp => {
      const rect = indicator.getBoundingClientRect();
      const bounds = navigation.getBoundingClientRect();
      samples.push({ ms: timestamp - began, y: position(), visible: rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1, opacity: getComputedStyle(indicator).opacity });
      if (timestamp - began < 650) requestAnimationFrame(frame);
      else resolve({ start, end, samples, sameNode: indicator === navigation.querySelector('.sidebar-active-indicator'), background: getComputedStyle(indicator).backgroundColor });
    };
    requestAnimationFrame(frame);
  }));
}

function assertVisibleMovement(result, label) {
  const distance = result.end - result.start;
  const sign = Math.sign(distance);
  assert.ok(Math.abs(distance) > 20, label + ' travels between distinct navigation rows.');
  const intermediate = result.samples.filter(sample => sign * (sample.y - result.start) > 1 && sign * (result.end - sample.y) > 1 && sample.visible && Number(sample.opacity) > 0.95);
  assert.ok(intermediate.length >= 4, label + ' must paint several visible intermediate positions, not jump straight to the destination.');
  for (let index = 1; index < result.samples.length; index++) assert.ok(sign * (result.samples[index].y - result.samples[index - 1].y) >= -0.5, label + ' moves monotonically toward the selected row.');
  assert.ok(Math.abs(result.samples.at(-1).y - result.end) <= 1, label + ' settles aligned with its selected row.');
  assert.ok(result.sameNode, 'Navigation preserves the same painted indicator element.');
  assert.notEqual(result.background, 'rgba(0, 0, 0, 0)', 'The moving pill has a visible background.');
}

async function screenshotMovingIndicator(app, target, name) {
  const paused = await target.evaluate(button => new Promise((resolve, reject) => {
    const navigation = button.closest('.sidebar-navigation');
    const indicator = navigation.querySelector('.sidebar-active-indicator');
    const position = () => indicator.getBoundingClientRect().top - navigation.getBoundingClientRect().top + navigation.scrollTop;
    const start = position();
    const end = button.offsetTop;
    const began = performance.now();
    button.click();
    const frame = () => {
      const progress = (position() - start) / (end - start);
      if (progress >= 0.35 && progress <= 0.7) {
        const animations = indicator.getAnimations().filter(animation => animation.transitionProperty === 'transform');
        for (const animation of animations) animation.pause();
        resolve({ start, end, y: position(), progress, pausedAnimations: animations.length });
      } else if (performance.now() - began > 700) reject(new Error('The real indicator transition did not paint a middle position for its screenshot.'));
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
  assert.ok(paused.pausedAnimations > 0);
  await app.screenshot(name);
  await app.page.locator('.sidebar-active-indicator').evaluate(element => { for (const animation of element.getAnimations()) if (animation.playState === 'paused') animation.play(); });
  await settled(app.page);
  return paused;
}

async function assertRapidRetargeting(page, names) {
  const result = await page.locator('.sidebar-navigation').evaluate(async (navigation, names) => {
    const indicator = navigation.querySelector('.sidebar-active-indicator');
    const buttons = names.map(name => [...navigation.querySelectorAll('.nav-item')].find(button => button.getAttribute('aria-label') === name));
    for (const button of buttons) {
      button.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    await Promise.all(indicator.getAnimations().map(animation => animation.finished.catch(() => {})));
    const active = navigation.querySelector('.nav-item.active');
    return { active: active.getAttribute('aria-label'), y: indicator.getBoundingClientRect().top, targetY: active.getBoundingClientRect().top, height: indicator.getBoundingClientRect().height, targetHeight: active.getBoundingClientRect().height, sameNode: indicator === navigation.querySelector('.sidebar-active-indicator') };
  }, names);
  assert.equal(result.active, names.at(-1));
  assert.ok(Math.abs(result.y - result.targetY) <= 1, 'Rapid navigation ends at the most recent selected row, including a scrolled menu.');
  assert.ok(Math.abs(result.height - result.targetHeight) <= 1);
  assert.ok(result.sameNode);
}

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
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(origin);
    await expect(heading(first)).toBeVisible();
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.locator('.main-shell > header')).toHaveCount(0);
    assert.ok((await page.locator('.workspace-content').boundingBox()).y <= 1, 'Desktop content starts without a header above it.');
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
    await assertFooterClock(page, false, true);
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

    // Record rendered frames rather than merely observing a transition event.
    // A taller desktop keeps every Configuration row visible during full travel.
    await page.setViewportSize({ width: 1440, height: 1200 });
    await settled(page);
    const lastButton = sidebar.locator('.nav-item').last();
    const lastName = await lastButton.getAttribute('aria-label');
    await expect(lastButton).toBeInViewport();
    const forward = await sampleIndicatorMovement(lastButton);
    assertVisibleMovement(forward, 'First-to-last pill movement');
    const backward = await sampleIndicatorMovement(sidebar.getByRole('button', { name: first, exact: true }));
    assertVisibleMovement(backward, 'Last-to-first pill movement');
    const midflight = await screenshotMovingIndicator(app, lastButton, `${system}-sidebar-pill-midflight.png`);
    await assertRapidRetargeting(page, [first, lastName, next]);
    await sidebar.getByRole('button', { name: first, exact: true }).click();
    await settled(page);
    await writeFile(fileURLToPath(new URL(`../.qa/screenshots/${system}-sidebar-pill-motion.json`, import.meta.url)), JSON.stringify({ project, forward, backward, midflight }, null, 2));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await settled(page);
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
    await assertFooterClock(page, true);
    await sidebar.getByRole('button', { name: 'Open profile: Alex Santos', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const nextButton = sidebar.getByRole('button', { name: next, exact: true });
    await nextButton.focus();
    await nextButton.press('Enter');
    await expect(heading(next)).toBeVisible();
    await expect(nextButton).toHaveAttribute('aria-current', 'page');
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
      const preferencesBefore = await sidebar.locator('.sidebar-preferences').boundingBox();
      await navigation.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const footerAfter = await sidebar.locator('.sidebar-bottom').boundingBox();
      const headerAfter = await sidebar.locator('.sidebar-header').boundingBox();
      const preferencesAfter = await sidebar.locator('.sidebar-preferences').boundingBox();
      assert.equal(footerAfter.y, footerBefore.y, 'Scrolling modules must not move the profile and sign-out footer.');
      assert.equal(headerAfter.y, headerBefore.y, 'Scrolling modules must not move the brand.');
      assert.equal(preferencesAfter.y, preferencesBefore.y, 'Scrolling modules must not move the clock or theme controls.');
      const lastNames = await sidebar.locator('.nav-item').evaluateAll(buttons => buttons.slice(-3).map(button => button.getAttribute('aria-label')));
      await assertRapidRetargeting(page, [lastNames[2], lastNames[0], lastNames[1]]);
      await expect(signout).toBeInViewport();
      await assertFooterClock(page, false);
      await app.screenshot('configuration-sidebar-card-scroll.png');
      await navigation.evaluate(element => { element.scrollTop = 0; });
      await sidebar.getByRole('button', { name: first, exact: true }).click();
      await settled(page);
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
    await assertFooterClock(page, false);
    await sidebar.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(sidebar).toHaveClass(/open/);
    await sidebar.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
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
    await assertFooterClock(page, true);
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

for (const { project, system, first } of projects) {
  test(`${project} retains wide content padding and uses the full width freed by the sidebar`, { timeout: 60000 }, async t => {
    const user = { id: 1, name: 'Geometry Administrator', username: 'mock_geometry', role: 'admin', system, isActive: true };
    const modules = system === 'configuration' ? loadApi('configuration').configurationMetadata() : [];
    const records = {
      '/api/customers': [{ id: 1, name: 'Geometry Customer', address: 'Mock address, Laguna', isActive: true }],
      '/api/purchase-requests': [{ id: 1, number: 'PR-GEOMETRY', prDate: '2026-11-15', neededDate: '2026-11-20', requestedBy: 'Mock Requester', status: 'draft', items: [{ id: 1, suppliesId: 30, suppliesName: 'Geometry Supplies', description: 'Mock supplies', unit: 'kg', quantity: '10.000000', balanceQuantity: '10.000000', neededDate: '2026-11-20' }] }],
      '/api/inventory': [{ id: 1, suppliesId: 30, code: 'S-GEOMETRY', name: 'Geometry Supplies', description: 'Mock inventory', unit: 'kg', quantity: '10.000000', warehouseId: 1, warehouseCode: 'MAIN', locationId: 1, locationCode: 'A-01', imLot: 'LOT-MOCK', qcStatus: 'Passed' }],
      '/api/configuration/atc': [{ id: 1, code: 'GEOMETRY', description: 'Mock configuration row', rate: 5, isActive: true }],
    };
    const app = await mockBrowser(t, async ({ method, pathname }) => {
      assert.equal(method, 'GET', 'Wide-screen geometry checks must never write records.');
      if (pathname === '/api/auth/session') return { json: { user } };
      if (pathname === '/api/configuration') return { json: { modules } };
      if (pathname === '/api/users') return { json: { records: [user] } };
      return { json: { records: records[pathname] || [] } };
    }, { project, viewport: { width: 1920, height: 1080 } });
    const { page, origin } = app;
    await page.goto(origin);
    await expect(page.getByRole('heading', { level: 1, name: first, exact: true })).toBeVisible();
    await expect(page.locator('.records-card .records-table tbody tr').first()).toBeVisible();
    const measurements = [];
    for (const width of [1920, 2560]) {
      await page.setViewportSize({ width, height: 1080 });
      const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
      if (await expand.count()) await expand.click();
      await settled(page);
      const states = [];
      for (const state of ['expanded', 'collapsed']) {
        if (state === 'collapsed') {
          await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
          await settled(page);
        }
        const geometry = await page.evaluate(() => {
          const rect = selector => {
            const bounds = document.querySelector(selector).getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, width: bounds.width };
          };
          return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, sidebar: rect('.sidebar'), main: rect('.main-shell'), content: rect('.workspace-content'), heading: rect('.page-heading'), card: rect('.records-card'), tableViewport: rect('.records-card .table-scroll') };
        });
        for (const [label, edge] of [['heading', geometry.heading], ['table card', geometry.card]]) {
          assert.ok(Math.abs(edge.left - geometry.main.left - 32) <= 1, `${project} ${width}px ${state}: ${label} retains its 32px left padding.`);
          assert.ok(Math.abs(geometry.main.right - edge.right - 32) <= 1, `${project} ${width}px ${state}: ${label} retains its 32px right padding.`);
        }
        assert.ok(Math.abs(geometry.content.left - geometry.main.left) <= 1 && Math.abs(geometry.content.right - geometry.main.right) <= 1, 'The content container fills its main area instead of adding centered outer margins.');
        assert.ok(Math.abs(geometry.main.right - width) <= 1);
        assert.ok(Math.abs(geometry.main.left - geometry.sidebar.right - 14) <= 1, 'The sidebar-to-main gap stays constant.');
        assert.ok(Math.abs(geometry.heading.left - geometry.card.left) <= 1 && Math.abs(geometry.heading.right - geometry.card.right) <= 1, 'The heading and table card share their visible edges.');
        assert.ok(geometry.tableViewport.left >= geometry.card.left && geometry.tableViewport.left - geometry.card.left <= 2);
        assert.ok(geometry.tableViewport.right <= geometry.card.right && geometry.card.right - geometry.tableViewport.right <= 2, 'Only the table contents scroll; its viewport still fills the card.');
        assert.ok(geometry.documentWidth <= width, 'Wide tables must not create page-level horizontal overflow.');
        states.push(geometry); measurements.push({ state, ...geometry });
      }
      for (const key of ['main', 'content', 'heading', 'card', 'tableViewport']) assert.ok(Math.abs(states[1][key].width - states[0][key].width - 170) <= 1, `${key} must gain the complete 170px released by collapsing the sidebar at ${width}px.`);
      await app.screenshot(`${system}-sidebar-spacing-${width}-collapsed.png`);
    }
    await writeFile(fileURLToPath(new URL(`../.qa/screenshots/${system}-sidebar-spacing-geometry.json`, import.meta.url)), JSON.stringify({ project, measurements }, null, 2));
    app.assertSafe();
  });
}
