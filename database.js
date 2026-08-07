const { createClient } = require('@libsql/client');

// Sanitize URL and convert libsql:// or http:// to https://
let rawUrl = (process.env.TURSO_DATABASE_URL || '').trim();
if (rawUrl.startsWith('libsql://')) {
  rawUrl = rawUrl.replace('libsql://', 'https://');
}

const rawToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

const db = createClient({
  url: rawUrl || 'file:repairs.db',
  authToken: rawToken || undefined,
});

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
