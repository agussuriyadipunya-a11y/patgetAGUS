import { db } from "./db.js";
import { clamp } from "./util.js";
import { saveCloudRecord } from "./firebase.js";

export const DEFAULT_SETTINGS = {
  kioskName: "Payget Indonesia",
  kioskTagline: "Kios Pembayaran Tagihan & Pulsa",
  kioskAddress: "Jl. Merdeka No. 88, Bandung, Jawa Barat",
  kioskPhone: "0812-3456-7890",
  kioskEmail: "cs@payget.id",
  receiptFooter: "Simpan struk ini sebagai bukti pembayaran yang sah.",
  theme: "light",
  accent: "indigo",
  fontScale: 100,
  autoSendReceipt: false,
  waDefaultMessage: "Terima kasih telah bertransaksi di kios kami.",
};

export const ACCENTS = ["indigo", "emerald", "blue", "violet", "amber", "rose"];

const TEXT_LIMITS = {
  kioskName: 60,
  kioskTagline: 80,
  kioskAddress: 160,
  kioskPhone: 30,
  kioskEmail: 80,
  receiptFooter: 200,
  waDefaultMessage: 300,
};

export function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const stored = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      stored[row.key] = row.value;
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function getSetting(key) {
  return getSettings()[key];
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, JSON.stringify(value));
}

export function saveSettings(patch) {
  const current = getSettings();
  const next = { ...current };

  for (const key of Object.keys(TEXT_LIMITS)) {
    if (patch[key] !== undefined) {
      const raw = String(patch[key]).trim();
      next[key] = raw.slice(0, TEXT_LIMITS[key]);
    }
  }

  if (patch.theme !== undefined) {
    next.theme = patch.theme === "dark" ? "dark" : "light";
  }
  if (patch.accent !== undefined && ACCENTS.includes(patch.accent)) {
    next.accent = patch.accent;
  }
  if (patch.fontScale !== undefined) {
    next.fontScale = clamp(Math.round(Number(patch.fontScale) || 100), 85, 120);
  }
  if (patch.autoSendReceipt !== undefined) {
    next.autoSendReceipt = Boolean(patch.autoSendReceipt);
  }

  for (const [key, value] of Object.entries(next)) {
    if (key in DEFAULT_SETTINGS) setSetting(key, value);
  }
  saveCloudRecord("settings", "app", next);
  return next;
}

export function getPublicSettings() {
  const s = getSettings();
  return {
    kioskName: s.kioskName,
    kioskTagline: s.kioskTagline,
    kioskAddress: s.kioskAddress,
    kioskPhone: s.kioskPhone,
    kioskEmail: s.kioskEmail,
    receiptFooter: s.receiptFooter,
    theme: s.theme,
    accent: s.accent,
    fontScale: s.fontScale,
    autoSendReceipt: s.autoSendReceipt,
    waDefaultMessage: s.waDefaultMessage,
  };
}

export function ensureDefaultSettings() {
  const existing = new Set(db.prepare("SELECT key FROM settings").all().map((r) => r.key));
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!existing.has(key)) setSetting(key, value);
  }
}
