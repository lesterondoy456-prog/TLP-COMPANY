import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MIGRATION_FILES, runMigrations } from '../migration/run.js';

function fakePools({ failBatch = 0, databaseExists = true } = {}) {
  const events = [];
  const batches = [];
  const createPool = database => ({
    async connect() { events.push(['connect', database]); return this; },
    async close() { events.push(['close', database]); },
    on() { return this; },
    request() {
      return {
        input() { return this; },
        async query(statement) { events.push(['query', database, statement]); return { recordset: databaseExists ? [{ database_id: 1 }] : [] }; },
        async batch(statement) {
          batches.push(statement);
          if (batches.length === failBatch) throw new Error('Mock migration failure');
          return {};
        },
      };
    },
  });
  return { createPool, events, batches, sql: { NVarChar: length => ({ length }) } };
}

test('migration runner reads the relocated SQL files in dependency order using only injected fake pools', async () => {
  const fake = fakePools();
  await runMigrations({ database: 'MockMigrationDatabase', ...fake });
  assert.deepEqual([...MIGRATION_FILES], ['schema.sql', 'system-accounts.sql', 'configuration-schema.sql', 'erp-schema.sql']);
  const expected = await Promise.all(MIGRATION_FILES.map(filename => readFile(new URL('../migration/' + filename, import.meta.url), 'utf8')));
  assert.deepEqual(fake.batches, expected);
  assert.ok(fake.events.some(event => event[0] === 'close' && event[1] === 'master'));
  assert.equal(fake.events.some(event => event[0] === 'close' && event[1] === 'MockMigrationDatabase'), false);
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
