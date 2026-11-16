const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const MIGRATION_FILES = ['table-values.sql', 'schema.sql', 'system-accounts.sql', 'configuration-schema.sql', 'erp-schema.sql', 'sales-order-details.sql', 'text-max.sql', 'inventory-movements.sql', 'sales-document-items.sql'];

async function runMigrations({ database, createPool, sql, onPoolError }) {
  if (typeof database !== 'string' || !database || database.length > 128 || /[;\x00-\x1f]/.test(database)) {
    throw new Error('Invalid DB_NAME.');
  }

  const master = createPool('master');
  try {
    await master.connect();
    const result = await master.request().input('name', sql.NVarChar(sql.MAX), database)
      .query('SELECT database_id FROM sys.databases WHERE name = @name');
    if (!result.recordset.length) {
      await master.request().query(`CREATE DATABASE [${database.replaceAll(']', ']]')}]`);
    }
  } finally { await master.close(); }

  const pool = createPool(database);
  if (onPoolError) pool.on('error', onPoolError);
  let migration;
  try {
    await pool.connect();
    migration = new sql.Transaction(pool);
    await migration.begin();
    for (const filename of MIGRATION_FILES) {
      const schema = await readFile(join(__dirname, filename), 'utf8');
      await migration.request().batch(schema);
    }
    await migration.commit();
    return pool;
  } catch (error) {
    if (migration) try { await migration.rollback(); } catch { /* A failed SQL batch may already have rolled back. */ }
    await pool.close();
    throw error;
  }
}

exports.MIGRATION_FILES = MIGRATION_FILES;
exports.runMigrations = runMigrations;
