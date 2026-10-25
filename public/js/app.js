import { api } from "./api.js";
import { icon } from "./icons.js";
import { applyTheme, loadCatalog, state } from "./store.js";
import {
  confirmDialog,
  escapeHtml,
  fmtDate,
  initials,
  toast,
} from "./ui.js";
import { renderLogin } from "./views/login.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderMenu } from "./views/menu.js";
import { renderHistory } from "./views/history.js";
import { renderSettings } from "./views/settings.js";
import { renderExport } from "./views/export.js";
import { renderWhatsapp } from "./views/whatsapp.js";
import { renderCustomers } from "./views/customers.js";
import { renderExpenses } from "./views/expenses.js";
import { renderInventory } from "./views/inventory.js";
import { getCloudStatus, triggerCloudSync } from "./firebase.js";

const appRoot = document.getElementById("app");

const ROUTES = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Ringkasan performa kios hari ini",
    render: renderDashboard,
  },
  menu: {
    title: "Menu Pembayaran",
    subtitle: "Proses pembayaran layanan kios",
    render: (view, param) => renderMenu(view, param || "pln"),
  },
  riwayat: {
    title: "Riwayat Transaksi",
    subtitle: "Arsip seluruh transaksi kios",
    render: renderHistory,
  },
  pelanggan: {
    title: "Data Pelanggan",
    subtitle: "Direktori kontak & no. pelanggan kios",
    render: renderCustomers,
  },
  belanja: {
    title: "Belanja Kantor",
    subtitle: "Pencatatan transaksi belanja operasional kantor",
    render: renderExpenses,
  },
  gudang: {
    title: "Gudang & Barang",
    subtitle: "Input barang kantor, harga acuan, dan stok",
    render: renderInventory,
  },
  pengaturan: {
    title: "Pengaturan",
    subtitle: "Identitas, tampilan, dan keamanan akun",
    render: renderSettings,
  },
  export: {
    title: "Export Laporan",
    subtitle: "Unduh data transaksi dalam Excel atau PDF",
    render: renderExport,
  },
  whatsapp: {
    title: "WhatsApp",
    subtitle: "Koneksi pengiriman bukti transaksi",
    render: renderWhatsapp,
  },
};

let mode = "boot";
let currentCleanup = null;
let routeToken = 0;
let waTimer = null;
let sidebarEl = null;
let overlayEl = null;
let currentTitle = "Dashboard";

function bootScreen(text = "Menyiapkan kios pembayaran…") {
  return `
    <div class="boot-screen">
      <div class="boot-logo">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill="currentColor" />
        </svg>
      </div>
      <div class="boot-text">
        <strong>PAYMENT GATEWAY</strong>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="boot-bar"><i></i></div>
    </div>`;
}

function closeSidebar() {
  sidebarEl?.classList.remove("open");
  overlayEl?.classList.remove("show");
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [name, param] = raw.split("/");
  const entry = ROUTES[name] || ROUTES.dashboard;
  return {
    entry,
    key: ROUTES[name] ? name : "dashboard",
    param: param ? decodeURIComponent(param) : "",
  };
}

function applyBranding() {
  const name = state.settings?.kioskName || "Payment Gateway";
  const tagline = state.settings?.kioskTagline || "Kios Pembayaran";
  const nameEl = document.getElementById("brandName");
  const subEl = document.getElementById("brandSub");
  if (nameEl) nameEl.textContent = name;
  if (subEl) subEl.textContent = tagline;
  if (mode === "app") document.title = `${currentTitle} — ${name}`;
}

function updateChrome(route) {
  const titleEl = document.getElementById("pageTitle");
  const subEl = document.getElementById("pageSubtitle");
  if (titleEl) titleEl.textContent = route.entry.title;
  if (subEl) subEl.textContent = route.entry.subtitle;
  currentTitle = route.entry.title;
  document.title = `${currentTitle} — ${state.settings?.kioskName || "Payment Gateway"}`;
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.route === route.key);
  });
}

function updateWaPill(wa) {
  const pill = document.getElementById("waPill");
  const text = document.getElementById("waPillText");
  const badge = document.getElementById("waNavBadge");
  if (!pill || !text) return;

  const status = wa?.status || "disconnected";
  const labels = {
    connected: "WA Terhubung",
    qr: "Scan QR",
    connecting: "Menghubungkan",
    error: "WA Error",
    disconnected: "WA Off",
  };

  pill.className = `wa-pill ${status}`;
  text.textContent = labels[status] || "WhatsApp";
  pill.title = status === "connected"
    ? `WhatsApp terhubung${wa?.me?.number ? ` · ${wa.me.number}` : ""}`
    : "Buka pengaturan WhatsApp";

  if (badge) {
    badge.textContent = status === "connected" ? "Aktif" : "";
    badge.classList.toggle("hidden", status !== "connected");
  }
}

function stopWaPolling() {
  if (waTimer) {
    clearInterval(waTimer);
    waTimer = null;
  }
}

function startWaPolling() {
  stopWaPolling();
  waTimer = setInterval(async () => {
    if (mode !== "app" || document.hidden) return;
    try {
      const wa = await api.get("/wa/status");
      state.wa = wa;
      updateWaPill(wa);
      window.dispatchEvent(new CustomEvent("wa:external", { detail: wa }));
    } catch {
      // polling status boleh gagal tanpa mengganggu halaman
    }
  }, 15000);
}

function buildShell() {
  const username = state.user?.username || "admin";
  const avatarText = escapeHtml(initials(username));

  appRoot.innerHTML = `
    <div class="app-shell">
      <div class="sidebar-overlay" id="sidebarOverlay"></div>

      <aside class="sidebar" id="sidebar" aria-label="Navigasi utama">
        <div class="sidebar-brand">
          <div class="brand">
            <div class="brand-mark">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div class="brand-name" id="brandName">Payment Gateway</div>
              <div class="brand-sub" id="brandSub">Kios Pembayaran</div>
            </div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-group">
            <div class="nav-label">LAYANAN KIOS</div>
            <a class="nav-item" data-route="dashboard" href="#/dashboard">${icon("dashboard", 18)}<span>Dashboard</span></a>
            <a class="nav-item" data-route="menu" href="#/menu/pln">${icon("menu", 18)}<span>Menu Pembayaran</span></a>
            <a class="nav-item" data-route="riwayat" href="#/riwayat">${icon("history", 18)}<span>Riwayat</span></a>
            <a class="nav-item" data-route="pelanggan" href="#/pelanggan">${icon("users", 18)}<span>Pelanggan</span></a>
          </div>

          <div class="nav-group">
            <div class="nav-label">OPERASIONAL KANTOR</div>
            <a class="nav-item" data-route="belanja" href="#/belanja">${icon("shoppingCart", 18)}<span>Belanja Kantor</span></a>
            <a class="nav-item" data-route="gudang" href="#/gudang">${icon("box", 18)}<span>Gudang / Barang</span></a>
          </div>

          <div class="nav-group">
            <div class="nav-label">PENGATURAN</div>
            <a class="nav-item" data-route="whatsapp" href="#/whatsapp">${icon("whatsapp", 18)}<span>WhatsApp</span><span class="nav-badge hidden" id="waNavBadge"></span></a>
            <a class="nav-item" data-route="export" href="#/export">${icon("download", 18)}<span>Export</span></a>
            <a class="nav-item" data-route="pengaturan" href="#/pengaturan">${icon("settings", 18)}<span>Pengaturan</span></a>
          </div>
        </nav>

        <div class="sidebar-foot">
          ${state.simulation ? `<div class="sim-badge"><i></i> MODE SIMULASI</div>` : `<div class="sim-badge live"><i></i> MODE REALTIME</div>`}
          <div class="user-card">
            <span class="avatar">${avatarText}</span>
            <span class="user-meta">
              <strong>${escapeHtml(username)}</strong>
              <span>Administrator</span>
            </span>
            <button class="icon-btn" id="logoutBtn" type="button" title="Keluar" aria-label="Keluar">${icon("logout", 16)}</button>
          </div>
        </div>
      </aside>

      <div class="main-shell">
        <header class="topbar">
          <div class="topbar-left">
            <button class="icon-btn mobile-only" id="menuToggle" type="button" aria-label="Buka menu">${icon("menuBars", 20)}</button>
            <div>
              <h1 id="pageTitle">Dashboard</h1>
              <p id="pageSubtitle">Ringkasan performa kios hari ini</p>
            </div>
          </div>

          <div class="topbar-right">
            <span class="firebase-pill" id="fbSyncPill" title="Firebase Multi-Kiosk Sync">
              ${icon("sparkles", 13)} <span>Cloud Sync</span>
            </span>
            <button class="wa-pill disconnected" id="waPill" type="button" title="Status WhatsApp">
              <i class="dot"></i><span id="waPillText">WhatsApp</span>
            </button>
            <span class="date-chip">${icon("calendar", 14)} ${escapeHtml(fmtDate(new Date(), { weekday: true }))}</span>
            <span class="topbar-avatar">${avatarText}</span>
          </div>
        </header>

        <main class="view" id="view"></main>
      </div>
    </div>`;

  sidebarEl = appRoot.querySelector("#sidebar");
  overlayEl = appRoot.querySelector("#sidebarOverlay");

  appRoot.querySelector("#menuToggle").addEventListener("click", () => {
    sidebarEl?.classList.add("open");
    overlayEl?.classList.add("show");
  });
  overlayEl?.addEventListener("click", closeSidebar);
  sidebarEl?.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      closeSidebar();
      const targetHash = item.getAttribute("href");
      if (location.hash === targetHash) {
        renderRoute();
      }
    });
  });
  appRoot.querySelector("#logoutBtn").addEventListener("click", handleLogout);
  appRoot.querySelector("#waPill").addEventListener("click", () => {
    if (location.hash === "#/whatsapp") renderRoute();
    else location.hash = "#/whatsapp";
  });
  appRoot.querySelector("#fbSyncPill")?.addEventListener("click", async () => {
    const pill = document.getElementById("fbSyncPill");
    toast("Menyinkronkan data dengan Firebase Cloud...", "info");
    try {
      const res = await triggerCloudSync();
      toast(res.message || "Data berhasil disinkronkan ke Cloud Firebase.", "success");
      if (pill) {
        pill.className = "firebase-pill active";
        pill.title = "Data Online Aktif & Tersinkronisasi";
      }
    } catch (err) {
      toast(err.message || "Gagal sinkronisasi ke cloud.", "error");
    }
  });
}

async function renderRoute() {
  if (mode !== "app") return;

  const token = ++routeToken;
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch {
      // abaikan error pembersihan view lama
    }
    currentCleanup = null;
  }

  closeSidebar();

  const route = parseRoute();
  updateChrome(route);

  const view = document.getElementById("view");
  if (!view) return;
  view.innerHTML = `<div class="loading-block"><span class="spinner"></span><span>Memuat halaman…</span></div>`;

  try {
    const result = await route.entry.render(view, route.param);
    if (token !== routeToken) {
      if (typeof result === "function") result();
      return;
    }
    if (typeof result === "function") currentCleanup = result;
  } catch (error) {
    console.error("[Route Error]", error);
    if (token !== routeToken) return;
    view.innerHTML = `
      <div class="page">
        <div class="card card-pad">
          <div class="empty-state">
            <div class="empty-icon">${icon("alert", 26)}</div>
            <h3>Halaman gagal dimuat</h3>
            <p>${escapeHtml(error.message || "Terjadi kesalahan pada aplikasi.")}</p>
            <div class="empty-action"><button class="btn btn-primary" id="viewRetry" type="button">Coba lagi</button></div>
          </div>
        </div>
      </div>`;
    view.querySelector("#viewRetry")?.addEventListener("click", renderRoute);
  }
}

async function startApp() {
  mode = "app";
  stopWaPolling();
  closeSidebar();
  appRoot.innerHTML = bootScreen("Menyiapkan kios pembayaran…");

  try {
    const [meta, wa] = await Promise.all([
      api.get("/meta"),
      api.get("/wa/status").catch(() => null),
      loadCatalog(true).catch((error) => {
        console.warn("[Katalog] gagal dimuat:", error.message);
        return [];
      }),
    ]);
    state.meta = meta;
    state.wa = wa;
  } catch (error) {
    if (error.status === 401) return;
    appRoot.innerHTML = `
      <div class="boot-screen">
        <div class="card card-pad" style="max-width:440px;width:calc(100% - 32px)">
          <div class="empty-state">
            <div class="empty-icon">${icon("alert", 26)}</div>
            <h3>Gagal memuat aplikasi</h3>
            <p>${escapeHtml(error.message || "Tidak dapat terhubung ke server.")}</p>
            <div class="empty-action"><button class="btn btn-primary" id="bootRetry" type="button">Coba lagi</button></div>
          </div>
        </div>
      </div>`;
    appRoot.querySelector("#bootRetry")?.addEventListener("click", startApp);
    return;
  }

  buildShell();
  applyBranding();
  updateWaPill(state.wa);
  startWaPolling();

  getCloudStatus().then((s) => {
    const pill = document.getElementById("fbSyncPill");
    if (pill) {
      if (s.ok) {
        pill.className = "firebase-pill active";
        pill.title = s.message || "Firebase Admin Cloud Terhubung";
      } else {
        pill.className = "firebase-pill";
        pill.title = s.message || "Firebase Server Cloud";
      }
    }
  });

  if (!location.hash.startsWith("#/")) {
    history.replaceState(null, "", "#/dashboard");
  }

  await renderRoute();
}

function showLogin(message = "") {
  if (mode === "login") return;
  mode = "login";
  stopWaPolling();

  if (currentCleanup) {
    try {
      currentCleanup();
    } catch {
      // abaikan
    }
    currentCleanup = null;
  }
  routeToken += 1;

  closeSidebar();
  sidebarEl = null;
  overlayEl = null;

  const modalRoot = document.getElementById("modal-root");
  if (modalRoot) modalRoot.innerHTML = "";
  document.body.classList.remove("modal-open");
  document.title = "Masuk — Payment Gateway";

  appRoot.innerHTML = "";
  renderLogin(appRoot, {
    message,
    onSuccess: async (data) => {
      state.user = data.user;
      state.settings = { ...(state.settings || {}), ...data.settings };
      applyTheme(state.settings);
      await startApp();
    },
  });
}

async function handleLogout() {
  const confirmed = await confirmDialog({
    title: "Keluar dari aplikasi",
    message: "Anda yakin ingin keluar dari dashboard kios? Sesi login akan diakhiri.",
    confirmLabel: "Ya, keluar",
    tone: "danger",
  });
  if (!confirmed) return;

  try {
    await api.post("/auth/logout");
  } catch {
    // sesi mungkin sudah berakhir
  }

  state.user = null;
  state.categories = [];
  state.meta = null;
  state.wa = null;
  showLogin("Anda telah keluar dari aplikasi.");
}

async function init() {
  try {
    const me = await api.get("/auth/me");
    state.user = me.user;
    state.settings = { ...(state.settings || {}), ...me.settings };
    applyTheme(state.settings);
    await startApp();
  } catch (error) {
    if (error.status === 401) showLogin();
    else showLogin(error.message || "Gagal terhubung ke server.");
  }
}

window.addEventListener("hashchange", () => {
  if (mode === "app") renderRoute();
});

window.addEventListener("auth:expired", () => {
  if (mode === "login") return;
  showLogin(mode === "boot" ? "" : "Sesi berakhir. Silakan login kembali.");
});

window.addEventListener("settings:updated", () => {
  applyBranding();
  if (mode === "app") {
    document.title = `${currentTitle} — ${state.settings?.kioskName || "Payment Gateway"}`;
  }
});

window.addEventListener("wa:updated", (event) => {
  updateWaPill(event.detail);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});

init();
