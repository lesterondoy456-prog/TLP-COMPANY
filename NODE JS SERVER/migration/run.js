const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { randomBytes, scrypt: scryptCallback } = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCallback);
const LOGIN_TABLES = Object.freeze(['SalesUserLogin', 'PurchasingUserLogin', 'WarehouseUserLogin', 'ConfigurationUserLogin']);

const MIGRATION_FILES = Object.freeze(['schema.sql', 'system-accounts.sql', 'configuration-schema.sql', 'erp-schema.sql', 'text-max.sql']);

async function seedAdministrators(pool, sql, env) {
  for (const table of LOGIN_TABLES) {
    const existing = await pool.request().query(`SELECT TOP(1) id FROM dbo.${table} WHERE role='admin' AND isActive=1`);
    if (existing.recordset.length) continue;
    const username = (env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const password = env.ADMIN_PASSWORD;
    if (!password || password.length < 7 || password.length > 128) throw new Error('Set ADMIN_PASSWORD in .env to 7-128 characters before first startup.');
    if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error('ADMIN_USERNAME must contain 3-80 letters, numbers, dots, underscores or hyphens.');
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    await pool.request()
      .input('name', sql.NVarChar(sql.MAX), env.ADMIN_NAME || 'Administrator')
      .input('username', sql.NVarChar(sql.MAX), username).input('email', sql.NVarChar(sql.MAX), env.ADMIN_EMAIL || '')
      .input('passwordHash', sql.VarChar(sql.MAX), `scrypt$${salt}$${hash.toString('hex')}`)
      .query(`INSERT INTO dbo.${table}(name,username,email,role,passwordHash) VALUES(@name,@username,@email,'admin',@passwordHash)`);
  }
}

async function runMigrations({ database, createPool, sql, onPoolError, env = process.env }) {
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
  try {
    await pool.connect();
    for (const filename of MIGRATION_FILES) {
      const schema = await readFile(join(__dirname, filename), 'utf8');
      await pool.request().batch(schema);
    }
    await seedAdministrators(pool, sql, env);
    return pool;
  } catch (error) {
    await pool.close();
    throw error;
  }
}

exports.MIGRATION_FILES = MIGRATION_FILES;
exports.runMigrations = runMigrations;
