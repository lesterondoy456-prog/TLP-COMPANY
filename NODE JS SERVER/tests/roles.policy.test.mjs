import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SALES_ROLES, canCreateSalesUser, canEditSalesUser, canManageSalesUsers,
  canReadSalesUser, isActiveSalesAccount, isSalesRole, ownProfilePrivileges,
} from '../components/roles.js';

// This module imports only the pure policy functions: no app, environment, or SQL.
test('administrators can manage accounts in each of the three supported roles', () => {
  const admin = { role: 'admin', isActive: true };
  assert.deepEqual([...SALES_ROLES].sort(), ['admin', 'sales', 'saleshead']);
  assert.equal(canManageSalesUsers(admin), true);
  assert.equal(canEditSalesUser(admin), true);
  for (const role of ['admin', 'saleshead', 'sales']) {
    assert.equal(isSalesRole(role), true);
    assert.equal(canCreateSalesUser(admin, role), true);
    assert.equal(canReadSalesUser(admin, { role }), true);
  }
  for (const role of ['owner', 'Admin', 'sales_head', '', null, undefined]) {
    assert.equal(isSalesRole(role), false);
    assert.equal(canCreateSalesUser(admin, role), false);
  }
});

test('sales heads can read and create Sales accounts without editing any account', () => {
  const head = { role: 'saleshead', isActive: true };
  assert.equal(canManageSalesUsers(head), true);
  assert.equal(canReadSalesUser(head, { role: 'sales', isActive: true }), true);
  assert.equal(canReadSalesUser(head, { role: 'sales', isActive: false }), true);
  assert.equal(canCreateSalesUser(head, 'sales'), true);
  assert.equal(canEditSalesUser(head), false);
  for (const role of ['admin', 'saleshead', 'owner', 'Sales', '', null, undefined]) {
    assert.equal(canCreateSalesUser(head, role), false, `A Sales Head must not create ${String(role)} accounts.`);
    assert.equal(canReadSalesUser(head, { role }), false);
  }
});

test('Sales and unrecognized actors cannot enter account management', () => {
  for (const actor of [{ role: 'sales' }, { role: 'owner' }, {}, null, undefined]) {
    assert.equal(canManageSalesUsers(actor), false);
    assert.equal(canEditSalesUser(actor), false);
    for (const role of ['admin', 'saleshead', 'sales']) {
      assert.equal(canCreateSalesUser(actor, role), false);
      assert.equal(canReadSalesUser(actor, { role }), false);
    }
  }
});

test('profile edits preserve current role and active state despite submitted privileges', () => {
  for (const role of ['admin', 'saleshead', 'sales']) {
    for (const isActive of [true, false]) {
      const current = { id: 1, role, isActive };
      assert.deepEqual(ownProfilePrivileges(current, { role: 'admin', isActive: true }), { role, isActive });
      assert.deepEqual(current, { id: 1, role, isActive }, 'Policy must not mutate the current account.');
    }
  }
});

test('customer assignments accept only explicitly active Sales accounts', () => {
  assert.equal(isActiveSalesAccount({ role: 'sales', isActive: true }), true);
  for (const account of [
    { role: 'admin', isActive: true }, { role: 'saleshead', isActive: true },
    { role: 'sales', isActive: false }, { role: 'sales', isActive: 1 },
    { role: 'sales' }, { role: 'Sales', isActive: true }, {}, null, undefined,
  ]) assert.equal(isActiveSalesAccount(account), false);
});
