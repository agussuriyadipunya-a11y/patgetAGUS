import admin from "firebase-admin";
import fs from "node:fs";
import { db } from "./db.js";

let adminApp = null;
let rtdb = null;
let initAttempted = false;
let initError = null;

/**
 * Inisialisasi Firebase Admin SDK di Sisi Server (Backend)
 * Kredensial rahasia dibaca HANYA dari environment server (process.env)
 * TIDAK MENGGUNAKAN prefix NEXT_PUBLIC_ untuk mencegah kebocoran kredensial ke client side.
 */
export function initFirebaseAdmin() {
  if (initAttempted) return { app: adminApp, rtdb, error: initError };
  initAttempted = true;

  try {
    if (admin.apps.length > 0) {
      adminApp = admin.apps[0];
      rtdb = adminApp.database();
      return { app: adminApp, rtdb, error: null };
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || "paygateagus";
    const databaseURL =
      process.env.FIREBASE_DATABASE_URL ||
      `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;

    let credential = null;

    // 1. Cek file Service Account via GOOGLE_APPLICATION_CREDENTIALS atau FIREBASE_SERVICE_ACCOUNT_PATH
    const serviceAccountPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      credential = admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")));
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      // 2. Cek variabel individual di process.env
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
      credential = admin.credential.cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      // 3. Cek JSON string di process.env
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else {
      // Kredensial service account belum diisi di .env
      initError = "Kredensial Service Account belum dikonfigurasi di server (process.env).";
      return { app: null, rtdb: null, error: initError };
    }

    adminApp = admin.initializeApp({
      credential,
      databaseURL,
      projectId,
    });

    rtdb = adminApp.database();
    console.log(`[Firebase Admin] Terhubung aman ke project "${projectId}" (Database: ${databaseURL})`);
    return { app: adminApp, rtdb, error: null };
  } catch (err) {
    initError = err.message;
    console.warn("[Firebase Admin] Gagal inisialisasi:", err.message);
    return { app: null, rtdb: null, error: initError };
  }
}

/**
 * Status koneksi server-side Firebase
 */
export async function checkFirebaseStatus() {
  const { app, rtdb: dbInstance, error } = initFirebaseAdmin();
  const projectId = process.env.FIREBASE_PROJECT_ID || "paygateagus";
  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;

  if (error || !dbInstance) {
    return {
      ok: false,
      mode: "server-side-admin",
      configured: false,
      projectId,
      databaseURL,
      message: error || "Kredensial Firebase Admin SDK belum diset pada environment server.",
    };
  }

  try {
    // Tes baca ping ke database
    await dbInstance.ref(".info/connected").once("value");
    return {
      ok: true,
      mode: "server-side-admin",
      configured: true,
      projectId,
      databaseURL,
      message: "Firebase Admin SDK terhubung secara aman di server.",
    };
  } catch (err) {
    return {
      ok: false,
      mode: "server-side-admin",
      configured: true,
      projectId,
      databaseURL,
      message: `Error saat menghubungi database: ${err.message}`,
    };
  }
}

/**
 * Broadcast event multi-kiosk ke Realtime Database melalui Server Admin SDK
 * Aman karena dieksekusi server-side dengan session auth.
 */
export async function broadcastCloudEvent(type, payload = {}, kioskId = "server") {
  const { rtdb: dbInstance } = initFirebaseAdmin();
  if (!dbInstance) {
    return { ok: false, message: "Firebase Admin SDK belum aktif di server." };
  }

  const validTypes = ["transactions", "customers", "expenses"];
  const targetType = validTypes.includes(type) ? type : "transactions";

  const eventRef = dbInstance.ref(`multi_kiosk/${targetType}`).push();
  await eventRef.set({
    ...payload,
    sourceKiosk: kioskId,
    createdAtTs: Date.now(),
    serverVerified: true,
  });

  return { ok: true, id: eventRef.key };
}

/**
 * Sinkronisasi data lokal ke Firebase Cloud via Server Admin SDK
 */
export async function syncToFirebase() {
  const { rtdb: dbInstance } = initFirebaseAdmin();
  if (!dbInstance) {
    throw new Error("Firebase Admin SDK belum terkonfigurasi pada server (Set environment variables di server).");
  }

  const transactions = db.prepare("SELECT * FROM transactions ORDER BY id DESC LIMIT 500").all();
  const customers = db.prepare("SELECT * FROM customers ORDER BY id DESC").all();
  const expenses = db.prepare("SELECT * FROM office_expenses ORDER BY id DESC").all();
  const items = db.prepare("SELECT * FROM office_items ORDER BY id DESC").all();

  const backupData = {
    syncedAt: new Date().toISOString(),
    kiosk: "Nusantara Payment",
    data: {
      transactions,
      customers,
      expenses,
      items,
    },
  };

  await dbInstance.ref("kiosk_backup").set(backupData);

  return {
    ok: true,
    message: "Data transaksi, pelanggan, belanja kantor, dan gudang berhasil disinkronkan ke Firebase Cloud (Server-side Admin).",
    counts: {
      transactions: transactions.length,
      customers: customers.length,
      expenses: expenses.length,
      items: items.length,
    },
  };
}
