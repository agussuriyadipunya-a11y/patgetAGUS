import { db, hashPassword } from "./db.js";
import { DEFAULT_SETTINGS, saveSettings } from "./settings.js";
import { seedDemoTransactions } from "./seed.js";
import { seedDefaultCustomers } from "./customers.js";
import { seedOfficeData } from "./office.js";
import { businessDate } from "./util.js";

/**
 * 1. Reset Database:
 * Menghapus data pelanggan, dan mereset riwayat transaksi dengan batas 7 hari
 * (menghapus transaksi yang lebih lama dari 7 hari yang lalu, mempertahankan 7 hari terakhir).
 */
export function resetDatabase({ days = 7 } = {}) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days));
  const cutoffDate = businessDate(d);

  // Hapus semua pelanggan
  const custCountBefore = db.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
  db.prepare("DELETE FROM customers").run();
  try {
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'customers'").run();
  } catch {}

  // Hapus transaksi yang lebih dari 7 hari
  const deletedTrx = db
    .prepare("DELETE FROM transactions WHERE business_date < ? OR created_at < ?")
    .run(cutoffDate, `${cutoffDate}T00:00:00`);

  const remainingTrx = db.prepare("SELECT COUNT(*) AS n FROM transactions").get().n;

  return {
    ok: true,
    message: `Database berhasil direset. ${custCountBefore} data pelanggan dan ${deletedTrx.changes} transaksi (> 7 hari) dihapus. ${remainingTrx} transaksi 7 hari terakhir tetap tersimpan.`,
    deletedCustomers: custCountBefore,
    deletedTransactions: deletedTrx.changes,
    remainingTransactions: remainingTrx,
    cutoffDate,
  };
}

/**
 * 2. Hapus Data:
 * Menghapus SEMUA data operasional (transaksi, pelanggan, belanja kantor, gudang).
 */
export function deleteAllData() {
  const trxCount = db.prepare("SELECT COUNT(*) AS n FROM transactions").get().n;
  const custCount = db.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
  const expCount = db.prepare("SELECT COUNT(*) AS n FROM office_expenses").get().n;
  const itemCount = db.prepare("SELECT COUNT(*) AS n FROM office_items").get().n;

  db.prepare("DELETE FROM transactions").run();
  db.prepare("DELETE FROM customers").run();
  db.prepare("DELETE FROM office_expenses").run();
  db.prepare("DELETE FROM office_items").run();

  try {
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'customers', 'office_expenses', 'office_items')").run();
  } catch {}

  return {
    ok: true,
    message: `Semua data berhasil dibersihkan (${trxCount} transaksi, ${custCount} pelanggan, ${expCount} belanja kantor, ${itemCount} barang gudang).`,
    deleted: {
      transactions: trxCount,
      customers: custCount,
      expenses: expCount,
      items: itemCount,
    },
  };
}

/**
 * 3. Restore:
 * Kembalikan ke pengaturan awal (Factory Reset)
 * - Reset pengaturan nama kios, tema, biaya admin, footer struk ke default
 * - Hapus data operasional dan isi ulang dengan data demo bawaan (seeder)
 * - Reset kata sandi admin ke admin123
 */
export function restoreFactoryDefaults() {
  // 1. Reset pengaturan ke default
  db.prepare("DELETE FROM settings").run();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(k, JSON.stringify(v));
  }

  // 2. Kosongkan data lama
  db.prepare("DELETE FROM transactions").run();
  db.prepare("DELETE FROM customers").run();
  db.prepare("DELETE FROM office_expenses").run();
  db.prepare("DELETE FROM office_items").run();

  try {
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'customers', 'office_expenses', 'office_items')").run();
  } catch {}

  // 3. Seed ulang data demo
  const insertedTrx = seedDemoTransactions();
  const insertedCust = seedDefaultCustomers();
  seedOfficeData();

  // 4. Reset admin password ke 'admin123'
  const admin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (admin) {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      hashPassword("admin123"),
      new Date().toISOString(),
      admin.id,
    );
  }

  return {
    ok: true,
    message: "Sistem berhasil dikembalikan ke pengaturan dan data awal pabrik (admin / admin123).",
    settings: DEFAULT_SETTINGS,
    seeded: {
      transactions: insertedTrx,
      customers: insertedCust,
    },
  };
}
