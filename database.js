const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const rawUrl = (process.env.TURSO_DATABASE_URL || '').trim();
const rawToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

const db = createClient({
  url: rawUrl || 'file:repairs.db',
  authToken: rawToken || undefined,
});

async function initDb() {
  try {
    // 1. Create Users Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        full_name TEXT,
        role TEXT
      );
    `);

    // 2. Create Repairs Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS repairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        customer TEXT,
        phone TEXT,
        model TEXT,
        imei TEXT,
        fault TEXT,
        cost TEXT,
        status TEXT DEFAULT 'Pending',
        notes TEXT,
        created_by TEXT
      );
    `);

    // 3. Create default admin if no users exist
    const userCheck = await db.execute('SELECT COUNT(*) as count FROM users');
    if (userCheck.rows[0].count === 0) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('stargate123', salt);
      await db.execute({
        sql: 'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
        args: ['admin', hash, 'Admin', 'admin']
      });
      console.log('[Turso] Default admin user created.');
    }

    console.log('[Turso] Database initialized successfully.');
  } catch (err) {
    console.error('[Turso] Error initializing tables:', err.message);
  }
}

initDb();

// Export all the helper functions your server needs
module.exports = {
  getUserByUsername: async (username) => {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username]
    });
    return result.rows[0]; 
  },
  
  getAllRepairs: async () => {
    const result = await db.execute('SELECT * FROM repairs ORDER BY id DESC');
    return result.rows;
  },

  createRepair: async (data) => {
    const result = await db.execute({
      sql: 'INSERT INTO repairs (date, customer, phone, model, imei, fault, cost, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
      args: [data.date, data.customer, data.phone, data.model, data.imei, data.fault, data.cost, data.status, data.notes, data.created_by]
    });
    return result.rows[0];
  },

  updateRepair: async (id, data) => {
    const result = await db.execute({
      sql: 'UPDATE repairs SET customer=?, phone=?, model=?, imei=?, fault=?, cost=?, notes=? WHERE id=? RETURNING *',
      args: [data.customer, data.phone, data.model, data.imei, data.fault, data.cost, data.notes, id]
    });
    return result.rows[0];
  },

  updateRepairStatus: async (id, status) => {
    const result = await db.execute({
      sql: 'UPDATE repairs SET status=? WHERE id=? RETURNING *',
      args: [status, id]
    });
    return result.rows[0];
  },

  deleteRepair: async (id) => {
    await db.execute({ sql: 'DELETE FROM repairs WHERE id=?', args: [id] });
  },

  getAllUsers: async () => {
    const result = await db.execute('SELECT id, username, full_name, role FROM users');
    return result.rows;
  },

  createUser: async (username, password, full_name, role) => {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    await db.execute({
      sql: 'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
      args: [username, hash, full_name, role]
    });
  }
};
