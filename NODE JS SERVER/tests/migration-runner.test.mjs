import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MIGRATION_FILES, runMigrations } from '../migration/run.js';

function fakePools({ failBatch = 0, databaseExists = true, failCreate = false } = {}) {
  const events = [];
  const batches = [];
  const createPool = database => {
    events.push(['pool', database]);
    return {
      async connect() { events.push(['connect', database]); return this; },
      async close() { events.push(['close', database]); },
      on() { return this; },
      request() {
        const inputs = {};
        return {
          input(name, _type, value) { inputs[name] = value; return this; },
          async query(statement) {
            events.push(['query', database, statement, inputs]);
            assert.equal(database, 'master', 'Schema migrations must not inspect, create or reset user accounts.');
            if (statement === 'SELECT database_id FROM sys.databases WHERE name = @name') return { recordset: databaseExists ? [{ database_id: 1 }] : [] };
            assert.match(statement, /^CREATE DATABASE \[/);
            if (failCreate) throw new Error('Mock database creation failure');
            return { recordset: [] };
          },
          async batch(statement) {
            batches.push(statement);
            if (batches.length === failBatch) throw new Error('Mock migration failure');
            return {};
          },
        };
      },
    };
  };
  return { createPool, events, batches, sql: {
    MAX: -1, NVarChar: length => ({ length }),
    Transaction: class {
      constructor(pool) { this.pool = pool; }
      async begin() { events.push(['begin']); }
      request() { return this.pool.request(); }
      async commit() { events.push(['commit']); }
      async rollback() { events.push(['rollback']); }
    },
  } };
}

test('migration runner applies SQL files atomically without querying or changing account records', async () => {
  const fake = fakePools();
  await runMigrations({ database: 'MockMigrationDatabase', ...fake });
  assert.deepEqual([...MIGRATION_FILES], ['table-values.sql', 'schema.sql', 'system-accounts.sql', 'configuration-schema.sql', 'erp-schema.sql', 'sales-order-details.sql', 'text-max.sql', 'inventory-movements.sql', 'sales-document-items.sql', 'sales-invoice-print.sql', 'invoice-stock-delivery.sql']);
  const expected = await Promise.all(MIGRATION_FILES.map(filename => readFile(new URL('../migration/' + filename, import.meta.url), 'utf8')));
  assert.deepEqual(fake.batches, expected);
  assert.deepEqual(fake.events.filter(event => event[0] === 'query').map(event => event[1]), ['master']);
  assert.ok(fake.events.some(event => event[0] === 'close' && event[1] === 'master'));
  assert.equal(fake.events.some(event => event[0] === 'close' && event[1] === 'MockMigrationDatabase'), false);
  assert.deepEqual(fake.events.filter(event => ['begin', 'commit', 'rollback'].includes(event[0])), [['begin'], ['commit']]);
});

test('an absent database is created with an escaped identifier but no administrator is provisioned', async () => {
  const fake = fakePools({ databaseExists: false });
  await runMigrations({ database: 'Mock]MigrationDatabase', ...fake });
  const queries = fake.events.filter(event => event[0] === 'query');
  assert.equal(queries[0][3].name, 'Mock]MigrationDatabase');
  assert.equal(queries[1][2], 'CREATE DATABASE [Mock]]MigrationDatabase]');
  assert.equal(fake.batches.length, MIGRATION_FILES.length);
  assert.ok(queries.every(event => event[1] === 'master'));
});

test('creation and migration failures close their fake pools and invalid names reach no pool', async () => {
  const creation = fakePools({ databaseExists: false, failCreate: true });
  await assert.rejects(runMigrations({ database: 'MockMigrationDatabase', ...creation }), /Mock database creation failure/);
  assert.ok(creation.events.some(event => event[0] === 'close' && event[1] === 'master'));
  assert.equal(creation.events.some(event => event[0] === 'pool' && event[1] === 'MockMigrationDatabase'), false);
  assert.equal(creation.batches.length, 0);
  const migration = fakePools({ failBatch: 2 });
  await assert.rejects(runMigrations({ database: 'MockMigrationDatabase', ...migration }), /Mock migration failure/);
  assert.equal(migration.batches.length, 2);
  assert.deepEqual(migration.events.filter(event => ['begin', 'commit', 'rollback'].includes(event[0])), [['begin'], ['rollback']]);
  assert.ok(migration.events.some(event => event[0] === 'close' && event[1] === 'MockMigrationDatabase'));
  const invalid = fakePools();
  await assert.rejects(runMigrations({ database: 'Mock;DROP', ...invalid }), /Invalid DB_NAME/);
  assert.deepEqual(invalid.events, []);
});

test('retired bootstrap configuration is never read and schema scripts contain no account-record mutations', async () => {
  const fake = fakePools();
  const retiredEnvironment = new Proxy({}, { get() { throw new Error('Migration must not read administrator configuration.'); } });
  await runMigrations({ database: 'MockMigrationDatabase', ...fake, env: retiredEnvironment });
  for (const schema of fake.batches) assert.doesNotMatch(schema, /\b(?:INSERT\s+(?:INTO\s+)?|UPDATE\s+|DELETE\s+(?:FROM\s+)?|MERGE\s+(?:INTO\s+)?)dbo\.(?:Sales|Purchasing|Warehouse|Configuration)UserLogin\b/i);
});

test('schema migrations never create database defaults, check rules or computed formulas', async () => {
  for (const filename of MIGRATION_FILES) {
    const source = await readFile(new URL('../migration/' + filename, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bDEFAULT\s+(?:N?'|[0-9(]|SYSUTCDATETIME)/i, filename);
    assert.doesNotMatch(source, /\bCHECK\s*\(/i, filename);
    assert.doesNotMatch(source, /\bPERSISTED\b/i, filename);
    assert.doesNotMatch(source, /\bCREATE\s+TABLE\s+dbo\.(?:ProductOffices|SupplyOffices)\b/i, filename);
  }
});

test('invoice print snapshots add only nullable MAX columns without backfilling historical invoices', async () => {
  const source = await readFile(new URL('../migration/sales-invoice-print.sql', import.meta.url), 'utf8');
  for (const field of ['buyerTin', 'shipToName', 'vatClass', 'preparedByName']) {
    assert.ok(source.includes("IF COL_LENGTH(N'dbo.SalesInvoices',N'" + field + "') IS NULL"), field);
    assert.ok(source.includes('ALTER TABLE dbo.SalesInvoices ADD ' + field + ' NVARCHAR(MAX) NULL;'), field);
  }
  assert.doesNotMatch(source, /\b(?:UPDATE|INSERT|MERGE|DELETE|DEFAULT|CHECK|TRIGGER|FUNCTION)\b/i);
});

test('invoice stock migration links only existing documents once and never rewrites stock or fabricates ledger rows', async () => {
  const source = await readFile(new URL('../migration/invoice-stock-delivery.sql', import.meta.url), 'utf8');
  assert.match(source, /IF @LegacyStockFlagNeeded=1\s+EXEC\(N'UPDATE dbo\.DeliveryReceipts SET stockDeducted=1;/);
  assert.match(source, /IF @DeliveryLinkNeeded=1\s+EXEC\(N'UPDATE d SET invoiceId=i\.id FROM dbo\.DeliveryReceipts d JOIN dbo\.SalesInvoices i ON i\.orderId=d\.orderId/);
  assert.match(source, /UNIQUE INDEX UQ_ProductStockMovements_InvoiceItem[\s\S]*WHERE invoiceItemId IS NOT NULL/);
  assert.match(source, /UNIQUE INDEX UQ_DeliveryReceipts_Invoice[\s\S]*WHERE invoiceId IS NOT NULL/);
  assert.match(source, /ALTER COLUMN receivedBy NVARCHAR\(MAX\) NULL/);
  assert.doesNotMatch(source, /UPDATE\s+dbo\.(?:Products|SalesInvoices)|INSERT\s+INTO\s+dbo\.ProductStockMovements|UPDATE\s+dbo\.SalesInvoiceItems/i);
});
