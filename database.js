
const { createClient } = require('@libsql/client');

// Connects to local fallback if ENV vars aren't present during development
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:repairs.db',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

// Create tables automatically on startup
async function initDb() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS repairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer TEXT,
        device TEXT,
        issue TEXT,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[Turso] Database initialized successfully.');
  } catch (err) {
    console.error('[Turso] Error initializing tables:', err.message);
  }
}

initDb();

module.exports = db;
