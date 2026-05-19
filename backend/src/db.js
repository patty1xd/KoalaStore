'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'koalastore.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS players (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE COLLATE NOCASE,
  uuid     TEXT
);

CREATE TABLE IF NOT EXISTS packages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  price           REAL NOT NULL,
  image           TEXT DEFAULT '',
  duration_days   INTEGER DEFAULT 0,      -- 0 = permanent
  require_online  INTEGER DEFAULT 1,      -- purchase commands need player online?
  commands        TEXT DEFAULT '[]',      -- JSON array of command strings (on purchase)
  expiry_commands TEXT DEFAULT '[]',      -- JSON array (when the plan ends)
  enabled         INTEGER DEFAULT 1,
  sort            INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id      INTEGER,
  username        TEXT,
  uuid            TEXT,
  amount          REAL,
  currency        TEXT,
  status          TEXT DEFAULT 'pending', -- pending|completed|refunded
  paypal_order_id TEXT,
  created_at      INTEGER,
  completed_at    INTEGER
);

CREATE TABLE IF NOT EXISTS command_queue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id     INTEGER,
  package_id     INTEGER,
  username       TEXT,
  uuid           TEXT,
  command        TEXT,
  require_online INTEGER DEFAULT 1,
  delay          INTEGER DEFAULT 0,
  slots          INTEGER DEFAULT 0,
  kind           TEXT DEFAULT 'purchase', -- purchase|expiry
  state          TEXT DEFAULT 'pending',  -- pending|executed
  created_at     INTEGER,
  executed_at    INTEGER
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id  INTEGER,
  package_id  INTEGER,
  username    TEXT,
  uuid        TEXT,
  started_at  INTEGER,
  expires_at  INTEGER,
  state       TEXT DEFAULT 'active'       -- active|expired|cancelled
);

CREATE INDEX IF NOT EXISTS idx_queue_state ON command_queue(state, require_online);
CREATE INDEX IF NOT EXISTS idx_sub_state   ON subscriptions(state, expires_at);
`);

function getSetting(key, def = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : def;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings(key, value) VALUES(?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// First-run defaults
if (!getSetting('store_name')) setSetting('store_name', 'KoalaStore');
if (!getSetting('server_name')) setSetting('server_name', 'My Minecraft Server');
if (!getSetting('server_secret')) {
  setSetting('server_secret', crypto.randomBytes(24).toString('hex'));
}

function upsertPlayer(username, uuid) {
  db.prepare(
    'INSERT INTO players(username, uuid) VALUES(?, ?) ' +
    'ON CONFLICT(username) DO UPDATE SET uuid = COALESCE(excluded.uuid, players.uuid)'
  ).run(username, uuid || null);
  return db.prepare('SELECT * FROM players WHERE username = ? COLLATE NOCASE').get(username);
}

module.exports = { db, getSetting, setSetting, upsertPlayer };
