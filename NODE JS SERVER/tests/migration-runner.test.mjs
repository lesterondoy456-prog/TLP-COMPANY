import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { MIGRATION_FILES, runMigrations } from '../migration/run.js';

function fakePools({ failBatch = 0, databaseExists = true, existingAdmins = true, failInsert = 0 } = {}) {
  const events = [];
  const batches = [];
  const inserts = [];
  const createPool = database => ({
    async connect() { events.push(['connect', database]); return this; },
    async close() { events.push(['close', database]); },
    on() { return this; },
    request() {
      const inputs = {};
      return {
        input(name, _type, value) { inputs[name] = value; return this; },
        async query(statement) {
          events.push(['query', database, statement]);
          if (database === 'master') return { recordset: databaseExists ? [{ database_id: 1 }] : [] };
          if (/^SELECT TOP\(1\) id FROM dbo\.\w+UserLogin WHERE role='admin' AND isActive=1$/.test(statement)) return { recordset: existingAdmins ? [{ id: 19, username: 'renamed_admin', role: 'admin', isActive: true }] : [] };
          if (statement.startsWith('INSERT INTO dbo.')) {
            inserts.push({ statement, inputs });
            if (inserts.length === failInsert) throw new Error('Mock administrator bootstrap failure');
            return { recordset: [] };
          }
          throw new Error('Unexpected query in fake migration pool.');
        },
        async batch(statement) {
          batches.push(statement);
          if (batches.length === failBatch) throw new Error('Mock migration failure');
          return {};
        },
      };
    },
  });
  return { createPool, events, batches, inserts, sql: { NVarChar: length => ({ length }), VarChar: length => ({ length }) } };
}

test('migration runner reads the relocated SQL files in dependency order using only injected fake pools', async () => {
  const fake = fakePools();
  await runMigrations({ database: 'MockMigrationDatabase', ...fake });
  assert.deepEqual([...MIGRATION_FILES], ['schema.sql', 'system-accounts.sql', 'configuration-schema.sql', 'erp-schema.sql', 'text-max.sql']);
  const expected = await Promise.all(MIGRATION_FILES.map(filename => readFile(new URL('../migration/' + filename, import.meta.url), 'utf8')));
  assert.deepEqual(fake.batches, expected);
  assert.ok(fake.events.some(event => event[0] === 'close' && event[1] === 'master'));
  assert.equal(fake.events.some(event => event[0] === 'close' && event[1] === 'MockMigrationDatabase'), false);
  assert.deepEqual(fake.inserts, [], 'An existing active administrator, including a renamed account, must prevent bootstrap.');
});

test('migration failure closes its injected pool and invalid database names never reach a pool', async () => {
  const fake = fakePools({ failBatch: 2 });
  await assert.rejects(runMigrations({ database: 'MockMigrationDatabase', ...fake }), /Mock migration failure/);
  assert.equal(fake.batches.length, 2);
  assert.ok(fake.events.some(event => event[0] === 'close' && event[1] === 'MockMigrationDatabase'));
  const invalid = fakePools();
  await assert.rejects(runMigrations({ database: 'Mock;DROP', ...invalid }), /Invalid DB_NAME/);
  assert.deepEqual(invalid.events, []);
});

test('missing administrators bootstrap only four own-login accounts with separately salted hashes in fake pools', async () => {
  const fake = fakePools({ existingAdmins: false });
  await runMigrations({ database: 'MockMigrationDatabase', ...fake, env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin123', ADMIN_NAME: 'Mock Administrator' } });
  assert.equal(fake.inserts.length, 4);
  assert.deepEqual(fake.inserts.map(row => row.statement.match(/INSERT INTO dbo\.(\w+)/)[1]).sort(), ['SalesUserLogin', 'PurchasingUserLogin', 'WarehouseUserLogin', 'ConfigurationUserLogin'].sort());
  const salts = new Set();
  const scrypt = promisify(scryptCallback);
  for (const { statement, inputs } of fake.inserts) {
    assert.match(statement, /'admin'/);
    assert.equal(inputs.username, 'admin');
    assert.equal(inputs.name, 'Mock Administrator');
    assert.match(inputs.passwordHash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    const [, salt, hash] = inputs.passwordHash.split('$');
    salts.add(salt);
    assert.equal((await scrypt('admin123', salt, 64)).toString('hex'), hash);
  }
  assert.equal(salts.size, 4);
});

test('administrator bootstrap failure closes the fake target pool', async () => {
  const fake = fakePools({ existingAdmins: false, failInsert: 1 });
  await assert.rejects(runMigrations({ database: 'MockMigrationDatabase', ...fake, env: { ADMIN_PASSWORD: 'admin123' } }), /Mock administrator bootstrap failure/);
  assert.equal(fake.inserts.length, 1);
  assert.ok(fake.events.some(event => event[0] === 'close' && event[1] === 'MockMigrationDatabase'));
});
