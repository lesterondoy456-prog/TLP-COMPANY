const { initializeDatabase, closeDatabase } = require('../db');

async function migrate() {
  try {
    await initializeDatabase();
    console.log(`Database migrations completed: ${process.env.DB_NAME || 'TTICompany'}`);
  } catch (error) {
    console.error(`Database migrations failed (${error.code || 'configuration'}): ${error.message}`);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

migrate();
