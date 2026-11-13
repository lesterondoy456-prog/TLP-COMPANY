import { initializeDatabase, closeDatabase } from '../database.js';

try {
  await initializeDatabase();
  console.log(`Database migrations completed: ${process.env.DB_NAME || 'TLP Company'}`);
} catch (error) {
  console.error(`Database migrations failed (${error.code || 'configuration'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
