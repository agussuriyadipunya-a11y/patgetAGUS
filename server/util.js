export const TZ = "Asia/Jakarta";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const longDateFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const shortDateFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Tanggal bisnis (zona Asia/Jakarta) dalam format YYYY-MM-DD */
export function businessDate(date = new Date()) {
  return dateFmt.format(date);
}

export function businessDateOffset(days, from = new Date()) {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return businessDate(d);
}

export function formatTime(date = new Date()) {
  return `${timeFmt.format(date)} WIB`;
}

export function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return `${shortDateFmt.format(d)} ${timeFmt.format(d)} WIB`;
}

export function formatLongDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return longDateFmt.format(d);
}

export function formatShortDate(date) {
  if (!date) return "-";
  const d = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00+07:00`)
    : new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return shortDateFmt.format(d);
}

export function rupiah(value) {
  const n = Number(value) || 0;
  return `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
}

export function nominal(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomRef(date = new Date()) {
  const d = businessDate(date).replaceAll("-", "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PG-${d}-${rand}`;
}

export function hashString(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul ? Math.imul(h, 16777619) : (h * 16777619) | 0;
  }
  return Math.abs(h >>> 0);
}

export function pick(list, seed) {
  return list[seed % list.length];
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isValidDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function monthName(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, month: "long", year: "numeric" }).format(date);
}
