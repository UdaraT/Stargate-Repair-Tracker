const { createClient } = require('@libsql/client');

// Sanitize inputs to remove hidden spaces or quotes
const rawUrl = (process.env.TURSO_DATABASE_URL || '').trim();
const rawToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

// Use Turso if URL is present, otherwise fallback to local SQLite file
const db = createClient({
  url: rawUrl || 'file:repairs.db',
  authToken: rawToken || undefined,
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
