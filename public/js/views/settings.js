import { api } from "../api.js";
import { icon } from "../icons.js";
import { ACCENT_LIST, applyTheme, state, updateSettings } from "../store.js";
import { confirmDialog, escapeHtml, setLoading, toast } from "../ui.js";

const ACCENT_COLORS = {
  indigo: "#4f46e5",
  emerald: "#059669",
  blue: "#2563eb",
  violet: "#7c3aed",
  amber: "#d97706",
  rose: "#e11d48",
};

export async function renderSettings(container) {
  container.innerHTML = `<div class="loading-block"><span class="spinner"></span><span>Memuat pengaturan…</span></div>`;

  let data;
  try {
    data = await api.get("/settings");
  } catch (error) {
    container.innerHTML = `<div class="card card-pad"><div class="empty-state"><h3>Gagal memuat pengaturan</h3><p>${escapeHtml(error.message)}</p></div></div>`;
    return;
  }

  let settings = data.settings;
  state.settings = settings;
  const username = data.username || state.user?.username || "admin";
  const draft = {
    theme: settings.theme,
    accent: settings.accent,
    fontScale: Number(settings.fontScale) || 100,
  };
  let activeTab = "identity";

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h2>Pengaturan</h2>
          <p>Atur identitas kios, tampilan aplikasi, dan keamanan akun administrator.</p>
        </div>
      </div>

      <div class="settings-layout">
        <nav class="settings-tabs" id="settingsTabs">
          <button class="settings-tab active" data-tab="identity">${icon("store", 17)} Identitas Kios</button>
          <button class="settings-tab" data-tab="appearance">${icon("palette", 17)} Tampilan</button>
          <button class="settings-tab" data-tab="security">${icon("key", 17)} Keamanan</button>
          <button class="settings-tab" data-tab="database">${icon("database", 17)} Pemeliharaan Database</button>
        </nav>
        <div class="settings-content" id="settingsContent"></div>
      </div>
    </div>`;

  const content = container.querySelector("#settingsContent");

  function identityHtml() {
    return `
      <section class="settings-card">
        <h3 class="form-section-title">Identitas kios</h3>
        <p class="form-section-desc">Informasi ini tampil pada dashboard, halaman login, dan resi transaksi.</p>
        <form id="identityForm">
          <div class="form-grid">
            <label class="field span-2">
              <span>Nama kios</span>
              <input class="input" name="kioskName" maxlength="60" value="${escapeHtml(settings.kioskName)}" required />
            </label>
            <label class="field span-2">
              <span>Tagline</span>
              <input class="input" name="kioskTagline" maxlength="80" value="${escapeHtml(settings.kioskTagline)}" />
            </label>
            <label class="field span-2">
              <span>Alamat</span>
              <textarea class="textarea" name="kioskAddress" rows="2" maxlength="160">${escapeHtml(settings.kioskAddress)}</textarea>
            </label>
            <label class="field">
              <span>Nomor telepon</span>
              <input class="input" name="kioskPhone" maxlength="30" value="${escapeHtml(settings.kioskPhone)}" />
            </label>
            <label class="field">
              <span>Email</span>
              <input class="input" name="kioskEmail" maxlength="80" value="${escapeHtml(settings.kioskEmail)}" />
            </label>
            <label class="field span-2">
              <span>Catatan kaki resi</span>
              <textarea class="textarea" name="receiptFooter" rows="2" maxlength="200">${escapeHtml(settings.receiptFooter)}</textarea>
              <span class="field-hint">Tampil di bagian bawah setiap resi PDF, gambar, dan struk.</span>
            </label>
          </div>

          <div class="preview-kiosk">
            <div class="brand">
              <div class="brand-mark">
                <svg viewBox="0 0 24 24" fill="none"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill="currentColor"/></svg>
              </div>
              <div>
                <div class="brand-name" id="previewName">${escapeHtml(settings.kioskName)}</div>
                <div class="brand-sub" id="previewTagline">${escapeHtml(settings.kioskTagline)}</div>
              </div>
            </div>
            <div class="preview-meta">
              <span id="previewAddress">${escapeHtml(settings.kioskAddress)}</span>
              <span id="previewContact">${escapeHtml(settings.kioskPhone)} · ${escapeHtml(settings.kioskEmail)}</span>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="saveIdentity">${icon("save", 17)} Simpan identitas</button>
          </div>
        </form>
      </section>

      <section class="settings-card">
        <h3 class="form-section-title">Informasi sistem</h3>
        <p class="form-section-desc">Ringkasan status aplikasi saat ini.</p>
        <div class="summary-strip">
          <div class="summary-item"><span>Mode data</span><strong>${state.simulation ? "Simulasi" : "Produksi"}</strong></div>
          <div class="summary-item"><span>Zona waktu</span><strong>WIB</strong></div>
          <div class="summary-item"><span>Total transaksi</span><strong>${Number(state.meta?.totalTransactions || 0).toLocaleString("id-ID")}</strong></div>
          <div class="summary-item"><span>Versi</span><strong>${escapeHtml(state.meta?.version || "1.0.0")}</strong></div>
        </div>
      </section>`;
  }

  function appearanceHtml() {
    return `
      <section class="settings-card">
        <h3 class="form-section-title">Tema aplikasi</h3>
        <p class="form-section-desc">Pilih tampilan terang atau gelap. Perubahan langsung diterapkan sebagai pratinjau.</p>
        <div class="theme-options">
          <button type="button" class="theme-card ${draft.theme === "light" ? "active" : ""}" data-theme-option="light">
            <div class="theme-preview"><div class="tp-side"></div><div class="tp-main"><i></i><i></i><i></i><i></i></div></div>
            <span class="theme-label">${icon("sun", 15)} Terang</span>
          </button>
          <button type="button" class="theme-card ${draft.theme === "dark" ? "active" : ""}" data-theme-option="dark">
            <div class="theme-preview dark"><div class="tp-side"></div><div class="tp-main"><i></i><i></i><i></i><i></i></div></div>
            <span class="theme-label">${icon("moon", 15)} Gelap</span>
          </button>
        </div>
      </section>

      <section class="settings-card">
        <h3 class="form-section-title">Warna aksen</h3>
        <p class="form-section-desc">Warna utama untuk tombol, menu aktif, dan elemen penting lainnya.</p>
        <div class="accent-row">
          ${ACCENT_LIST.map((accent) => `
            <button type="button" class="accent-swatch ${draft.accent === accent ? "active" : ""}" style="background:${ACCENT_COLORS[accent]}" data-accent-option="${accent}" title="${accent}" aria-label="Aksen ${accent}">
              ${draft.accent === accent ? icon("check", 15) : ""}
            </button>`).join("")}
        </div>
      </section>

      <section class="settings-card">
        <h3 class="form-section-title">Ukuran teks</h3>
        <p class="form-section-desc">Sesuaikan ukuran teks agar nyaman dibaca di layar kios.</p>
        <div class="range-row">
          <input type="range" id="fontScale" min="85" max="120" step="5" value="${draft.fontScale}" />
          <span class="range-value" id="fontScaleValue">${draft.fontScale}%</span>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="resetAppearance">${icon("refresh", 16)} Kembalikan</button>
          <button type="button" class="btn btn-primary" id="saveAppearance">${icon("save", 17)} Simpan tampilan</button>
        </div>
      </section>`;
  }

  function securityHtml() {
    return `
      <section class="settings-card">
        <h3 class="form-section-title">Akun administrator</h3>
        <p class="form-section-desc">Username digunakan untuk masuk ke aplikasi. Kata sandi disimpan terenkripsi di perangkat ini.</p>
        <div class="alert alert-info" style="margin-bottom:16px">
          ${icon("user", 16)}
          <span>Username aktif: <strong>${escapeHtml(username)}</strong> · Sesi login berlaku 12 jam.</span>
        </div>
        <form id="passwordForm" autocomplete="off">
          <div class="form-grid">
            <label class="field span-2">
              <span>Kata sandi saat ini</span>
              <div class="input-icon">
                ${icon("lock", 17)}
                <input class="input has-eye" type="password" name="currentPassword" id="currentPassword" placeholder="Masukkan kata sandi lama" autocomplete="current-password" required />
                <button type="button" class="btn-eye" data-toggle="currentPassword" aria-label="Tampilkan">${icon("eye", 17)}</button>
              </div>
            </label>
            <label class="field">
              <span>Kata sandi baru</span>
              <div class="input-icon">
                ${icon("key", 17)}
                <input class="input has-eye" type="password" name="newPassword" id="newPassword" placeholder="Minimal 6 karakter" autocomplete="new-password" minlength="6" required />
                <button type="button" class="btn-eye" data-toggle="newPassword" aria-label="Tampilkan">${icon("eye", 17)}</button>
              </div>
            </label>
            <label class="field">
              <span>Ulangi kata sandi baru</span>
              <div class="input-icon">
                ${icon("key", 17)}
                <input class="input has-eye" type="password" name="confirmPassword" id="confirmPassword" placeholder="Ulangi kata sandi baru" autocomplete="new-password" required />
                <button type="button" class="btn-eye" data-toggle="confirmPassword" aria-label="Tampilkan">${icon("eye", 17)}</button>
              </div>
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="savePassword">${icon("shieldCheck", 17)} Perbarui kata sandi</button>
          </div>
        </form>
      </section>

      <section class="settings-card">
        <h3 class="form-section-title">Keamanan &amp; data</h3>
        <p class="form-section-desc">Semua data transaksi disimpan di database lokal perangkat kios.</p>
        <div class="stack-12">
          <div class="alert alert-warning">
            ${icon("alert", 16)}
            <span>Gunakan kata sandi yang kuat dan ganti kata sandi bawaan sebelum kios digunakan untuk transaksi nyata.</span>
          </div>
          <div class="row-between">
            <span class="hint">Butuh salinan data? Unduh seluruh transaksi dalam format Excel atau PDF.</span>
            <a class="btn btn-soft btn-sm" href="#/export">${icon("download", 15)} Buka Export</a>
          </div>
        </div>
      </section>`;
  }

  function databaseHtml() {
    return `
      <section class="settings-card">
        <h3 class="form-section-title">Pemeliharaan &amp; Reset Database</h3>
        <p class="form-section-desc">Pilihan untuk mereset riwayat transaksi, menghapus seluruh data operasional, atau mengembalikan ke pengaturan awal pabrik.</p>

        <div class="maintenance-grid" style="display:grid;gap:16px;margin-top:16px">
          <!-- 1. Reset Database (7 Hari) -->
          <div class="card" style="padding:18px;border:1px solid var(--border);border-left:4px solid var(--warning);background:var(--surface)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
              <div style="flex:1;min-width:260px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <strong style="font-size:0.95rem">Reset Database</strong>
                  <span class="badge badge-warning">Transaksi &gt; 7 Hari</span>
                </div>
                <p style="font-size:0.82rem;color:var(--muted);margin-bottom:6px;line-height:1.4">
                  Menghapus semua data <strong>Pelanggan</strong> dan mereset riwayat transaksi yang berusia lebih dari <strong>7 hari</strong>. Transaksi 7 hari terakhir tetap tersimpan aman.
                </p>
                <small style="color:var(--muted-2);font-size:0.74rem">Berguna untuk pembersihan data berkala tanpa menghilangkan transaksi minggu berjalan.</small>
              </div>
              <button type="button" class="btn btn-soft" id="btnResetDatabase" style="color:var(--warning);background:var(--warning-soft);border:1px solid color-mix(in srgb, var(--warning) 30%, transparent);white-space:nowrap">
                ${icon("refresh", 16)} Reset Database (7 Hari)
              </button>
            </div>
          </div>

          <!-- 2. Hapus Data (All Data) -->
          <div class="card" style="padding:18px;border:1px solid var(--border);border-left:4px solid var(--danger);background:var(--surface)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
              <div style="flex:1;min-width:260px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <strong style="font-size:0.95rem">Hapus Data (All Data)</strong>
                  <span class="badge badge-danger">Semua Data</span>
                </div>
                <p style="font-size:0.82rem;color:var(--muted);margin-bottom:6px;line-height:1.4">
                  Menghapus <strong>SEMUA</strong> data operasional: seluruh riwayat transaksi, seluruh data pelanggan, seluruh belanja kantor, dan stok barang gudang menjadi 0 (bersih).
                </p>
                <small style="color:var(--danger);font-size:0.74rem">Perhatian: Tindakan ini permanen. Akun login admin &amp; identitas kios tetap aman.</small>
              </div>
              <button type="button" class="btn btn-danger" id="btnDeleteAllData" style="white-space:nowrap">
                ${icon("trash", 16)} Hapus Semua Data
              </button>
            </div>
          </div>

          <!-- 3. Restore (Kembalikan ke Pengaturan Awal) -->
          <div class="card" style="padding:18px;border:1px solid var(--border);border-left:4px solid var(--primary);background:var(--surface)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
              <div style="flex:1;min-width:260px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <strong style="font-size:0.95rem">Restore Pengaturan Awal</strong>
                  <span class="badge badge-soft">Pengaturan Pabrik</span>
                </div>
                <p style="font-size:0.82rem;color:var(--muted);margin-bottom:6px;line-height:1.4">
                  Mengembalikan sistem ke pengaturan awal pabrik (Nusantara Payment), tema dan identitas default, mengembalikan kata sandi admin ke <code>admin123</code>, serta memuat ulang data demo awal.
                </p>
                <small style="color:var(--muted-2);font-size:0.74rem">Gunakan ini jika ingin mengembalikan aplikasi ke kondisi awal siap pakai.</small>
              </div>
              <button type="button" class="btn btn-primary" id="btnRestoreDefaults" style="white-space:nowrap">
                ${icon("power", 16)} Restore Pengaturan Awal
              </button>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderTab() {
    container.querySelectorAll(".settings-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === activeTab);
    });
    if (activeTab === "identity") {
      content.innerHTML = identityHtml();
      bindIdentity();
    } else if (activeTab === "appearance") {
      content.innerHTML = appearanceHtml();
      bindAppearance();
    } else if (activeTab === "security") {
      content.innerHTML = securityHtml();
      bindSecurity();
    } else {
      content.innerHTML = databaseHtml();
      bindDatabase();
    }
  }

  function bindIdentity() {
    const form = content.querySelector("#identityForm");
    const fields = ["kioskName", "kioskTagline", "kioskAddress", "kioskPhone", "kioskEmail", "receiptFooter"];

    const preview = () => {
      content.querySelector("#previewName").textContent = form.kioskName.value.trim() || "Nama Kios";
      content.querySelector("#previewTagline").textContent = form.kioskTagline.value.trim();
      content.querySelector("#previewAddress").textContent = form.kioskAddress.value.trim();
      content.querySelector("#previewContact").textContent = `${form.kioskPhone.value.trim()} · ${form.kioskEmail.value.trim()}`;
    };

    fields.forEach((name) => form[name]?.addEventListener("input", preview));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = content.querySelector("#saveIdentity");
      const payload = {};
      for (const name of fields) payload[name] = form[name].value;
      if (!payload.kioskName.trim()) {
        toast("Nama kios wajib diisi.", "warning");
        form.kioskName.focus();
        return;
      }
      setLoading(button, true, "Menyimpan…");
      try {
        const result = await api.put("/settings", payload);
        settings = result.settings;
        updateSettings(result.settings);
        toast(result.message || "Identitas kios disimpan.", "success");
        content.querySelector("#previewName").textContent = settings.kioskName;
        content.querySelector("#previewTagline").textContent = settings.kioskTagline;
        content.querySelector("#previewAddress").textContent = settings.kioskAddress;
        content.querySelector("#previewContact").textContent = `${settings.kioskPhone} · ${settings.kioskEmail}`;
      } catch (error) {
        toast(error.message, "error");
      } finally {
        setLoading(button, false);
      }
    });
  }

  function applyDraft() {
    applyTheme({ ...state.settings, ...draft });
  }

  function bindAppearance() {
    content.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => {
        draft.theme = button.dataset.themeOption;
        content.querySelectorAll("[data-theme-option]").forEach((el) => el.classList.toggle("active", el === button));
        applyDraft();
      });
    });

    content.querySelectorAll("[data-accent-option]").forEach((button) => {
      button.addEventListener("click", () => {
        draft.accent = button.dataset.accentOption;
        content.querySelectorAll("[data-accent-option]").forEach((el) => {
          const active = el === button;
          el.classList.toggle("active", active);
          el.innerHTML = active ? icon("check", 15) : "";
        });
        applyDraft();
      });
    });

    const range = content.querySelector("#fontScale");
    const value = content.querySelector("#fontScaleValue");
    range.addEventListener("input", () => {
      draft.fontScale = Number(range.value);
      value.textContent = `${draft.fontScale}%`;
      applyDraft();
    });

    content.querySelector("#resetAppearance").addEventListener("click", () => {
      draft.theme = "light";
      draft.accent = "indigo";
      draft.fontScale = 100;
      applyDraft();
      renderTab();
    });

    content.querySelector("#saveAppearance").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      setLoading(button, true, "Menyimpan…");
      try {
        const result = await api.put("/settings", draft);
        settings = result.settings;
        updateSettings(result.settings);
        toast("Tampilan berhasil disimpan.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        setLoading(button, false);
      }
    });
  }

  function bindSecurity() {
    const form = content.querySelector("#passwordForm");
    content.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = content.querySelector(`#${button.dataset.toggle}`);
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        button.innerHTML = icon(visible ? "eye" : "eyeOff", 17);
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = content.querySelector("#savePassword");
      const currentPassword = form.currentPassword.value;
      const newPassword = form.newPassword.value;
      const confirmPassword = form.confirmPassword.value;

      if (newPassword.length < 6) {
        toast("Kata sandi baru minimal 6 karakter.", "warning");
        form.newPassword.focus();
        return;
      }
      if (newPassword !== confirmPassword) {
        toast("Konfirmasi kata sandi tidak sama.", "warning");
        form.confirmPassword.focus();
        return;
      }
      if (newPassword === currentPassword) {
        toast("Kata sandi baru harus berbeda dari yang lama.", "warning");
        form.newPassword.focus();
        return;
      }

      setLoading(button, true, "Memperbarui…");
      try {
        const result = await api.post("/auth/password", { currentPassword, newPassword });
        toast(result.message || "Kata sandi diperbarui.", "success");
        form.reset();
      } catch (error) {
        toast(error.message, "error");
      } finally {
        setLoading(button, false);
      }
    });
  }

  function bindDatabase() {
    const btnReset = content.querySelector("#btnResetDatabase");
    const btnDelete = content.querySelector("#btnDeleteAllData");
    const btnRestore = content.querySelector("#btnRestoreDefaults");

    btnReset?.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Reset Database (Batas 7 Hari)?",
        message: "Semua data Pelanggan akan dihapus, dan transaksi yang berusia LEBIH dari 7 hari akan dibersihkan. Transaksi 7 hari terakhir tetap tersimpan aman. Apakah Anda yakin?",
        confirmLabel: "Ya, Reset Database",
        tone: "warning",
      });
      if (!ok) return;

      setLoading(btnReset, true, "Mereset…");
      try {
        const res = await api.post("/settings/reset-database", { days: 7 });
        toast(res.message || "Database berhasil direset.", "success");
      } catch (err) {
        toast(err.message || "Gagal mereset database.", "error");
      } finally {
        setLoading(btnReset, false);
      }
    });

    btnDelete?.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "HAPUS SEMUA DATA (ALL DATA)?",
        message: "PERINGATAN: Seluruh riwayat transaksi, seluruh data pelanggan, seluruh belanja kantor, dan stok barang gudang akan DIHAPUS PERMANEN! Tindakan ini tidak dapat dibatalkan. Apakah Anda yakin?",
        confirmLabel: "Ya, Hapus Semua Data",
        tone: "danger",
      });
      if (!ok) return;

      setLoading(btnDelete, true, "Menghapus data…");
      try {
        const res = await api.post("/settings/delete-all-data");
        toast(res.message || "Semua data berhasil dihapus.", "success");
      } catch (err) {
        toast(err.message || "Gagal menghapus data.", "error");
      } finally {
        setLoading(btnDelete, false);
      }
    });

    btnRestore?.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Kembalikan ke Pengaturan Awal (Restore)?",
        message: "Sistem akan dikembalikan ke kondisi awal pabrik: identitas kios default (Nusantara Payment), tema default, kata sandi admin direset ke 'admin123', dan data demo awal dimuat ulang. Lanjutkan?",
        confirmLabel: "Ya, Restore Sekarang",
        tone: "primary",
      });
      if (!ok) return;

      setLoading(btnRestore, true, "Merestore sistem…");
      try {
        const res = await api.post("/settings/restore-defaults");
        if (res.settings) updateSettings(res.settings);
        toast(res.message || "Sistem berhasil direstore ke pengaturan awal.", "success");
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        toast(err.message || "Gagal merestore sistem.", "error");
      } finally {
        setLoading(btnRestore, false);
      }
    });
  }

  container.querySelector("#settingsTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button || button.dataset.tab === activeTab) return;
    activeTab = button.dataset.tab;
    renderTab();
  });

  renderTab();
}
