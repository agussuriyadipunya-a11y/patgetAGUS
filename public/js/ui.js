import { icon } from "./icons.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function rp(value) {
  const n = Number(value) || 0;
  return `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
}

export function num(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

export function compactRupiah(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${n}`;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00+07:00`);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TZ = "Asia/Jakarta";

export function fmtDate(value, { weekday = false, long = false } = {}) {
  const d = toDate(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    ...(weekday ? { weekday: "long" } : {}),
    day: "2-digit",
    month: long ? "long" : "short",
    year: "numeric",
  }).format(d);
}

export function fmtTime(value) {
  const d = toDate(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(".", ":");
}

export function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return "-";
  return `${fmtDate(d)} • ${fmtTime(d)} WIB`;
}

export function fmtWeekday(value) {
  const d = toDate(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "short" }).format(d);
}

export function todayWib(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

export function initials(name) {
  const parts = String(name || "A").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "A";
}

export function statusBadge(status) {
  const success = status === "sukses";
  return `<span class="badge ${success ? "badge-success" : "badge-danger"}"><i class="dot"></i>${success ? "Sukses" : "Gagal"}</span>`;
}

export function methodLabel(method) {
  if (method === "qris") return "QRIS";
  if (method === "transfer") return "Transfer Bank";
  return "Tunai";
}

export function methodIcon(method) {
  if (method === "qris") return "qris";
  if (method === "transfer") return "bank";
  return "cash";
}

export function emptyState(iconName, title, text, action = "") {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName, 26)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${action ? `<div class="empty-action">${action}</div>` : ""}
    </div>`;
}

export function spinnerBlock(text = "Memuat data…") {
  return `
    <div class="loading-block">
      <span class="spinner"></span>
      <span>${escapeHtml(text)}</span>
    </div>`;
}

export function setLoading(button, loading, label = "Memproses…") {
  if (!button) return;
  if (loading) {
    if (!button.dataset.original) button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner spinner-light"></span><span>${escapeHtml(label)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.original) {
      button.innerHTML = button.dataset.original;
      delete button.dataset.original;
    }
  }
}

let toastId = 0;
export function toast(message, type = "success", title = "") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  toastId += 1;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const iconName = type === "success" ? "checkCircle" : type === "error" ? "xCircle" : type === "warning" ? "alert" : "info";
  el.innerHTML = `
    <span class="toast-icon">${icon(iconName, 20)}</span>
    <div class="toast-body">
      ${title ? `<strong>${escapeHtml(title)}</strong>` : ""}
      <span>${escapeHtml(message)}</span>
    </div>
    <button class="toast-close" aria-label="Tutup">${icon("x", 14)}</button>`;
  root.appendChild(el);
  el.querySelector(".toast-close").addEventListener("click", () => dismiss());
  const timer = setTimeout(dismiss, 4200);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove("show");
    setTimeout(() => el.remove(), 220);
  }
  requestAnimationFrame(() => el.classList.add("show"));
}

const modalStack = [];

export function openModal({
  title = "",
  subtitle = "",
  body = "",
  footer = "",
  size = "md",
  bare = false,
  className = "",
  dismissible = true,
  onMount,
  onClose,
} = {}) {
  const root = document.getElementById("modal-root");
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.style.zIndex = String(1000 + modalStack.length);

  const card = document.createElement("div");
  card.className = `modal-card modal-${size} ${className}`.trim();
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  card.innerHTML = bare
    ? body
    : `
      <div class="modal-head">
        <div class="modal-title-wrap">
          ${title ? `<h3>${escapeHtml(title)}</h3>` : ""}
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </div>
        ${dismissible ? `<button class="icon-btn modal-x" data-close aria-label="Tutup">${icon("x", 18)}</button>` : ""}
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}`;

  backdrop.appendChild(card);
  root.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const entry = { backdrop, card, dismissible, onClose, closed: false };
  entry.close = (reason = "api") => {
    if (entry.closed) return;
    entry.closed = true;
    backdrop.classList.remove("show");
    setTimeout(() => backdrop.remove(), 200);
    const index = modalStack.indexOf(entry);
    if (index >= 0) modalStack.splice(index, 1);
    if (!modalStack.length) document.body.classList.remove("modal-open");
    onClose?.(reason);
  };

  modalStack.push(entry);

  card.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => entry.close("button"));
  });

  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop && dismissible) entry.close("backdrop");
  });

  onMount?.(card, entry.close);
  requestAnimationFrame(() => backdrop.classList.add("show"));
  return entry;
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !modalStack.length) return;
  const top = modalStack[modalStack.length - 1];
  if (top.dismissible) top.close("escape");
});

export function confirmDialog({
  title = "Konfirmasi",
  message = "Apakah Anda yakin?",
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  tone = "danger",
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      modal.close("confirm");
      resolve(value);
    };
    const modal = openModal({
      title,
      size: "sm",
      body: `<p class="confirm-text">${escapeHtml(message)}</p>`,
      footer: `
        <button class="btn btn-soft" data-cancel>${escapeHtml(cancelLabel)}</button>
        <button class="btn ${tone === "danger" ? "btn-danger" : "btn-primary"}" data-ok>${escapeHtml(confirmLabel)}</button>`,
      onMount(card) {
        card.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
        card.querySelector("[data-ok]").addEventListener("click", () => finish(true));
      },
      onClose() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    toast("Disalin ke clipboard.", "success");
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = String(text);
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("Disalin ke clipboard.", "success");
      return true;
    } catch {
      toast("Gagal menyalin. Salin manual ya.", "error");
      return false;
    } finally {
      area.remove();
    }
  }
}

export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function percent(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? "+" : ""}${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

export function relativeTime(value) {
  const d = toDate(value);
  if (!d) return "-";
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return fmtDate(d);
}
