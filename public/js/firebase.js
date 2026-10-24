/**
 * Modul Client Firebase Kios (Aman / Client-Safe)
 * Sesuai prinsip keamanan data, operasi Realtime Database dan data sensitif
 * diproses secara penuh pada sisi server (Server-Side) menggunakan Firebase Admin SDK.
 * Tidak ada kredensial, API key, atau akses database langsung yang terekspos di client side.
 */
import { api } from "./api.js";

export async function getCloudStatus() {
  try {
    return await api.get("/firebase/status");
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export async function triggerCloudSync() {
  return await api.post("/firebase/sync");
}
