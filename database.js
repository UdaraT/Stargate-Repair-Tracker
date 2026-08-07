const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'repairs.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────
// Schema Creation
// ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT NOT NULL UNIQUE,
    password  TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role      TEXT NOT NULL DEFAULT 'technician',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS repairs (
    id          TEXT PRIMARY KEY,
    date        TEXT NOT NULL,
    customer    TEXT NOT NULL,
    phone       TEXT NOT NULL,
    model       TEXT NOT NULL,
    imei        TEXT NOT NULL,
    fault       TEXT NOT NULL,
    cost        TEXT NOT NULL DEFAULT 'TBD',
    status      TEXT NOT NULL DEFAULT 'Pending',
    notes       TEXT DEFAULT '',
    created_by  TEXT DEFAULT 'admin',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_counter (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    counter INTEGER NOT NULL DEFAULT 1001
  );
`);

// ─────────────────────────────────────────────
// Seed default admin user if not exists
// ─────────────────────────────────────────────
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const hashed = bcrypt.hashSync('stargate123', 10);
  db.prepare(`
    INSERT INTO users (username, password, full_name, role)
    VALUES ('admin', ?, 'Administrator', 'admin')
  `).run(hashed);
  console.log('[DB] Default admin created: admin / stargate123');
}

// ─────────────────────────────────────────────
// Seed job counter if not exists
// ─────────────────────────────────────────────
const counterExists = db.prepare("SELECT id FROM job_counter WHERE id = 1").get();
if (!counterExists) {
  db.prepare("INSERT INTO job_counter (id, counter) VALUES (1, 1001)").run();
}

// ─────────────────────────────────────────────
// Exported DB functions
// ─────────────────────────────────────────────

// Users
function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

function getAllUsers() {
  return db.prepare("SELECT id, username, full_name, role, created_at FROM users ORDER BY id").all();
}

function createUser(username, password, fullName, role = 'technician') {
  const hashed = bcrypt.hashSync(password, 10);
  return db.prepare(`
    INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)
  `).run(username, hashed, fullName, role);
}

// Repairs
function getAllRepairs() {
  return db.prepare("SELECT * FROM repairs ORDER BY created_at DESC").all();
}

function getRepairById(id) {
  return db.prepare("SELECT * FROM repairs WHERE id = ?").get(id);
}

function getNextJobId() {
  const row = db.prepare("SELECT counter FROM job_counter WHERE id = 1").get();
  const newCounter = row.counter + 1;
  db.prepare("UPDATE job_counter SET counter = ? WHERE id = 1").run(newCounter);
  return 'SGT-' + row.counter;
}

function createRepair(data) {
  const id = getNextJobId();
  db.prepare(`
    INSERT INTO repairs (id, date, customer, phone, model, imei, fault, cost, status, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.date, data.customer, data.phone, data.model, data.imei,
         data.fault, data.cost || 'TBD', data.status || 'Pending',
         data.notes || '', data.created_by || 'admin');
  return getRepairById(id);
}

function updateRepair(id, data) {
  db.prepare(`
    UPDATE repairs SET
      customer   = ?,
      phone      = ?,
      model      = ?,
      imei       = ?,
      fault      = ?,
      cost       = ?,
      status     = ?,
      notes      = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(data.customer, data.phone, data.model, data.imei,
         data.fault, data.cost || 'TBD', data.status,
         data.notes || '', id);
  return getRepairById(id);
}

function updateRepairStatus(id, status) {
  db.prepare("UPDATE repairs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  return getRepairById(id);
}

function deleteRepair(id) {
  return db.prepare("DELETE FROM repairs WHERE id = ?").run(id);
}

module.exports = {
  getUserByUsername,
  getAllUsers,
  createUser,
  getAllRepairs,
  getRepairById,
  createRepair,
  updateRepair,
  updateRepairStatus,
  deleteRepair
};
