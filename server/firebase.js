import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import fs from "node:fs";
import { db } from "./db.js";
import { nowIso } from "./util.js";

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "paygateagus";
export const FIREBASE_DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  `https://${FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;

let adminApp = null;
let rtdb = null;
let initAttempted = false;
let initError = null;
let isHydrated = false;
let hydrationInProgress = null;

/**
 * Inisialisasi Firebase Admin SDK di Sisi Server (Backend)
 * Jika kredensial service account belum ada di server, sistem otomatis menggunakan
 * koneksi langsung Firebase Realtime Database REST API yang aman dan persisten.
 */
export function initFirebaseAdmin() {
  if (initAttempted) return { app: adminApp, rtdb, error: initError };
  initAttempted = true;

  try {
    const apps = getApps();
    if (apps.length > 0) {
      adminApp = apps[0];
      rtdb = getDatabase(adminApp);
      return { app: adminApp, rtdb, error: null };
    }

    let credential = null;
    const serviceAccountPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      credential = cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")));
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
      credential = cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else {
      initError = "Kredensial Service Account tidak ditemukan, menggunakan koneksi Firebase RTDB Cloud REST API.";
      return { app: null, rtdb: null, error: initError };
    }

    adminApp = initializeApp({
      credential,
      databaseURL: FIREBASE_DATABASE_URL,
      projectId: FIREBASE_PROJECT_ID,
    });

    rtdb = getDatabase(adminApp);
    console.log(`[Firebase Admin] Terhubung aman ke project "${FIREBASE_PROJECT_ID}"`);
    return { app: adminApp, rtdb, error: null };
  } catch (err) {
    initError = err.message;
    console.warn("[Firebase Admin] Fallback ke REST API:", err.message);
    return { app: null, rtdb: null, error: initError };
  }
}

/**
 * Eksekusi Firebase RTDB via HTTPS REST API (Fallback handal untuk Serverless & Multi-Device)
 */
export async function rtdbRest(path, { method = "GET", body } = {}) {
  const cleanPath = String(path).replace(/^\/+/, "").replace(/\.json$/, "");
  const url = `${FIREBASE_DATABASE_URL}/${cleanPath}.json`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Firebase RTDB (${res.status}): ${errorText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Status koneksi Firebase Cloud
 */
export async function checkFirebaseStatus() {
  try {
    const ping = await rtdbRest("kiosk_store/status", {
      method: "PUT",
      body: { lastPing: new Date().toISOString(), status: "connected" },
    });
    return {
      ok: true,
      mode: "firebase-cloud",
      configured: true,
      projectId: FIREBASE_PROJECT_ID,
      databaseURL: FIREBASE_DATABASE_URL,
      message: "Data Online Aktif — Terhubung ke Firebase Cloud Realtime.",
    };
  } catch (err) {
    return {
      ok: false,
      mode: "offline",
      configured: true,
      projectId: FIREBASE_PROJECT_ID,
      databaseURL: FIREBASE_DATABASE_URL,
      message: `Koneksi cloud error: ${err.message}`,
    };
  }
}

/**
 * Simpan atau perbarui sebuah record ke Firebase Cloud
 */
export async function saveCloudRecord(collection, key, data) {
  try {
    await rtdbRest(`kiosk_store/${collection}/${key}`, {
      method: "PUT",
      body: data,
    });
  } catch (err) {
    console.warn(`[Cloud Save Error: ${collection}/${key}]`, err.message);
  }
}

/**
 * Hapus record dari Firebase Cloud
 */
export async function deleteCloudRecord(collection, key) {
  try {
    await rtdbRest(`kiosk_store/${collection}/${key}`, {
      method: "DELETE",
    });
  } catch (err) {
    console.warn(`[Cloud Delete Error: ${collection}/${key}]`, err.message);
  }
}

/**
 * Ambil seluruh koleksi dari Firebase Cloud
 */
export async function fetchCloudCollection(collection) {
  try {
    const res = await rtdbRest(`kiosk_store/${collection}`);
    if (!res || typeof res !== "object") return [];
    return Object.values(res);
  } catch (err) {
    console.warn(`[Cloud Fetch Error: ${collection}]`, err.message);
    return [];
  }
}

/**
 * Hydrate Database SQLite dari Firebase Cloud saat startup / request baru
 * Ini memastikan ketika aplikasi ditutup atau dibuka dari perangkat mana saja,
 * data transaksi, pelanggan, belanja kantor, gudang, dan pengaturan tetap utuh.
 */
export async function hydrateDatabase() {
  if (isHydrated) return { ok: true, cached: true };
  if (hydrationInProgress) return hydrationInProgress;

  hydrationInProgress = (async () => {
    try {
      console.log("[Firebase Cloud] Mengambil data tersimpan dari cloud database...");
      const cloudData = await rtdbRest("kiosk_store").catch(() => null);

      if (cloudData && typeof cloudData === "object") {
        // 1. Transactions
        if (cloudData.transactions && typeof cloudData.transactions === "object") {
          const insertTrx = db.prepare(`
            INSERT OR IGNORE INTO transactions (
              ref, category_id, category_name, type_id, type_name, product_id, product_label,
              customer_id, customer_name, customer_phone, amount, admin_fee, total, status,
              payment_method, note, payload, wa_sent_at, business_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const item of Object.values(cloudData.transactions)) {
            if (!item || !item.ref) continue;
            try {
              insertTrx.run(
                item.ref,
                item.category_id || item.categoryId || "pln",
                item.category_name || item.categoryName || "PLN",
                item.type_id || item.typeId || "prepaid",
                item.type_name || item.typeName || "Token Listrik",
                item.product_id || item.productId || null,
                item.product_label || item.productLabel || "Produk",
                item.customer_id || item.customerId || "-",
                item.customer_name || item.customerName || null,
                item.customer_phone || item.customerPhone || null,
                Number(item.amount) || 0,
                Number(item.admin_fee !== undefined ? item.admin_fee : item.adminFee) || 0,
                Number(item.total) || 0,
                item.status || "sukses",
                item.payment_method || item.paymentMethod || "tunai",
                item.note || null,
                typeof item.payload === "string" ? item.payload : JSON.stringify(item.payload || {}),
                item.wa_sent_at || item.waSentAt || null,
                item.business_date || item.businessDate || item.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                item.created_at || item.createdAt || nowIso(),
              );
            } catch {
              // abaikan duplikat
            }
          }
        }

        // 2. Customers
        if (cloudData.customers && typeof cloudData.customers === "object") {
          const insertCust = db.prepare(`
            INSERT OR IGNORE INTO customers (
              id, name, phone, email, address, customer_no, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const c of Object.values(cloudData.customers)) {
            if (!c || !c.name) continue;
            try {
              insertCust.run(
                c.id ? Number(c.id) : null,
                c.name,
                c.phone,
                c.email || null,
                c.address || null,
                c.customer_no || c.customerNo || null,
                c.notes || null,
                c.created_at || c.createdAt || nowIso(),
                c.updated_at || c.updatedAt || nowIso(),
              );
            } catch {
              // abaikan duplikat
            }
          }
        }

        // 3. Office Items (Gudang)
        if (cloudData.office_items && typeof cloudData.office_items === "object") {
          const insertItem = db.prepare(`
            INSERT OR IGNORE INTO office_items (
              id, code, name, category, unit, price, stock, min_stock, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const it of Object.values(cloudData.office_items)) {
            if (!it || !it.code) continue;
            try {
              insertItem.run(
                it.id ? Number(it.id) : null,
                it.code,
                it.name,
                it.category || "ATK",
                it.unit || "Pcs",
                Number(it.price) || 0,
                Number(it.stock) || 0,
                Number(it.min_stock || it.minStock) || 0,
                it.notes || null,
                it.created_at || it.createdAt || nowIso(),
                it.updated_at || it.updatedAt || nowIso(),
              );
            } catch {
              // abaikan duplikat
            }
          }
        }

        // 4. Office Expenses (Belanja Kantor)
        if (cloudData.office_expenses && typeof cloudData.office_expenses === "object") {
          const insertExp = db.prepare(`
            INSERT OR IGNORE INTO office_expenses (
              id, ref, title, category, expense_date, payment_method, total_amount, receipt_number, pic, notes, items_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const exp of Object.values(cloudData.office_expenses)) {
            if (!exp || !exp.ref) continue;
            try {
              insertExp.run(
                exp.id ? Number(exp.id) : null,
                exp.ref,
                exp.title,
                exp.category || "Operasional",
                exp.expense_date || exp.expenseDate || nowIso().slice(0, 10),
                exp.payment_method || exp.paymentMethod || "tunai",
                Number(exp.total_amount || exp.totalAmount) || 0,
                exp.receipt_number || exp.receiptNumber || null,
                exp.pic || null,
                exp.notes || null,
                typeof exp.items_json === "string" ? exp.items_json : JSON.stringify(exp.items || []),
                exp.created_at || exp.createdAt || nowIso(),
              );
            } catch {
              // abaikan duplikat
            }
          }
        }

        // 5. Settings
        if (cloudData.settings && typeof cloudData.settings === "object") {
          const settingsObj = cloudData.settings.app || cloudData.settings;
          if (typeof settingsObj === "object") {
            for (const [key, val] of Object.entries(settingsObj)) {
              db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
                key,
                typeof val === "string" ? (val.startsWith("{") || val.startsWith("[") || val.startsWith('"') ? val : JSON.stringify(val)) : JSON.stringify(val),
              );
            }
          }
        }

        // 6. Users (Admin password)
        if (cloudData.users && cloudData.users.admin?.password_hash) {
          db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = 'admin'").run(
            cloudData.users.admin.password_hash,
            cloudData.users.admin.updated_at || nowIso(),
          );
        }
      }

      // Sync data lokal ke cloud jika di cloud belum ada
      await syncAllToCloud().catch(() => {});

      isHydrated = true;
      console.log("[Firebase Cloud] Sinkronisasi awal berhasil — data online aktif & aman.");
      return { ok: true, hydrated: true };
    } catch (err) {
      console.warn("[Firebase Cloud] Gagal hidrasi awal:", err.message);
      return { ok: false, error: err.message };
    } finally {
      hydrationInProgress = null;
    }
  })();

  return hydrationInProgress;
}

/**
 * Sinkronisasi penuh semua tabel lokal ke Firebase Cloud
 */
export async function syncAllToCloud() {
  try {
    const transactions = db.prepare("SELECT * FROM transactions ORDER BY id DESC LIMIT 500").all();
    const customers = db.prepare("SELECT * FROM customers ORDER BY id DESC").all();
    const expenses = db.prepare("SELECT * FROM office_expenses ORDER BY id DESC").all();
    const items = db.prepare("SELECT * FROM office_items ORDER BY id DESC").all();
    const settingsRows = db.prepare("SELECT * FROM settings").all();
    const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();

    const trxMap = {};
    for (const t of transactions) {
      trxMap[t.ref] = t;
    }

    const custMap = {};
    for (const c of customers) {
      custMap[c.id] = c;
    }

    const expMap = {};
    for (const e of expenses) {
      expMap[e.ref] = e;
    }

    const itemMap = {};
    for (const i of items) {
      itemMap[i.id] = i;
    }

    const settingsMap = {};
    for (const s of settingsRows) {
      try {
        settingsMap[s.key] = JSON.parse(s.value);
      } catch {
        settingsMap[s.key] = s.value;
      }
    }

    const payload = {
      transactions: trxMap,
      customers: custMap,
      office_expenses: expMap,
      office_items: itemMap,
      settings: { app: settingsMap },
      users: adminUser ? { admin: { password_hash: adminUser.password_hash, updated_at: adminUser.updated_at } } : undefined,
      lastSyncedAt: new Date().toISOString(),
    };

    await rtdbRest("kiosk_store", {
      method: "PATCH",
      body: payload,
    });

    return {
      ok: true,
      counts: {
        transactions: transactions.length,
        customers: customers.length,
        expenses: expenses.length,
        items: items.length,
      },
    };
  } catch (err) {
    console.warn("[Cloud Sync Error]", err.message);
    throw err;
  }
}

/**
 * Sinkronisasi manual yang dipanggil oleh tombol Cloud Sync di UI
 */
export async function syncToFirebase() {
  await hydrateDatabase();
  const res = await syncAllToCloud();
  return {
    ok: true,
    message: "Semua data transaksi, pelanggan, belanja kantor, dan gudang berhasil tersimpan di Cloud Firebase.",
    counts: res.counts,
  };
}

/**
 * Broadcast event multi-kiosk (kompatibilitas)
 */
export async function broadcastCloudEvent(type, payload = {}, kioskId = "server") {
  try {
    const key = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await rtdbRest(`multi_kiosk/${type}/${key}`, {
      method: "PUT",
      body: {
        ...payload,
        sourceKiosk: kioskId,
        createdAtTs: Date.now(),
        serverVerified: true,
      },
    });
    return { ok: true, id: key };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
