import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DB_FILE, ensureDataDir } from "./paths.js";
import { nowIso } from "./util.js";

ensureDataDir();

export const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT NOT NULL UNIQUE,
    category_id TEXT NOT NULL,
    category_name TEXT NOT NULL,
    type_id TEXT NOT NULL,
    type_name TEXT NOT NULL,
    product_id TEXT,
    product_label TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    customer_name TEXT,
    amount INTEGER NOT NULL DEFAULT 0,
    admin_fee INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'sukses',
    payment_method TEXT NOT NULL DEFAULT 'tunai',
    note TEXT,
    payload TEXT,
    wa_sent_at TEXT,
    business_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_trx_created ON transactions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_trx_business_date ON transactions(business_date);
  CREATE INDEX IF NOT EXISTS idx_trx_category ON transactions(category_id);

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    customer_no TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

  CREATE TABLE IF NOT EXISTS office_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'ATK',
    unit TEXT NOT NULL DEFAULT 'Pcs',
    price INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_code ON office_items(code);
  CREATE INDEX IF NOT EXISTS idx_items_category ON office_items(category);

  CREATE TABLE IF NOT EXISTS office_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Operasional',
    expense_date TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'tunai',
    total_amount INTEGER NOT NULL DEFAULT 0,
    receipt_number TEXT,
    pic TEXT,
    notes TEXT,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON office_expenses(expense_date);
  CREATE INDEX IF NOT EXISTS idx_expenses_ref ON office_expenses(ref);
`);

try {
  db.exec("ALTER TABLE transactions ADD COLUMN customer_phone TEXT;");
} catch {
  // kolom sudah ada
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  try {
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function ensureAdminUser() {
  const row = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (!row) {
    db.prepare("INSERT INTO users (username, password_hash, updated_at) VALUES (?, ?, ?)").run(
      "admin",
      hashPassword("admin123"),
      nowIso(),
    );
  }
}

export function getSession(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return row;
}

export function createSession(username, ttlMs = 1000 * 60 * 60 * 12) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  db.prepare("INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    username,
    now.toISOString(),
    new Date(now.getTime() + ttlMs).toISOString(),
  );
  return token;
}

export function destroySession(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function destroyUserSessions(username, exceptToken = null) {
  if (exceptToken) {
    db.prepare("DELETE FROM sessions WHERE username = ? AND token <> ?").run(username, exceptToken);
  } else {
    db.prepare("DELETE FROM sessions WHERE username = ?").run(username);
  }
}

export function cleanExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso());
}

ensureAdminUser();
cleanExpiredSessions();
setInterval(cleanExpiredSessions, 1000 * 60 * 60).unref();

export function countTransactions() {
  return db.prepare("SELECT COUNT(*) AS n FROM transactions").get().n;
}

export function backupDb() {
  try {
    const dest = DB_FILE.replace(/\.db$/, `-backup-${new Date().toISOString().slice(0, 10)}.db`);
    fs.copyFileSync(DB_FILE, dest);
    return dest;
  } catch {
    return null;
  }
}
