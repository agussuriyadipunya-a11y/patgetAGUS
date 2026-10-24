import { api } from "../api.js";
import { icon } from "../icons.js";
import { applyTheme, state } from "../store.js";
import { escapeHtml, setLoading } from "../ui.js";

const FALLBACK = {
  kioskName: "Nusantara Payment",
  kioskTagline: "Kios Pembayaran Tagihan & Pulsa",
  kioskAddress: "Jl. Merdeka No. 88, Bandung, Jawa Barat",
  kioskPhone: "0812-3456-7890",
  theme: "light",
  accent: "indigo",
  fontScale: 100,
  firstRun: true,
};

export async function renderLogin(container, { message = "", onSuccess } = {}) {
  let branding = state.settings || null;
  if (!branding) {
    try {
      branding = await api.get("/public/branding");
    } catch {
      branding = FALLBACK;
    }
  }
  applyTheme(branding);
  state.settings = { ...(state.settings || {}), ...branding };

  const firstRun = branding.firstRun ?? false;

  container.innerHTML = `
    <div class="login-page">
      <section class="login-brand">
        <div class="login-brand-inner">
          <div class="brand">
            <div class="brand-mark">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill="currentColor"/></svg>
            </div>
            <div>
              <div class="brand-name">${escapeHtml(branding.kioskName || FALLBACK.kioskName)}</div>
              <div class="brand-sub">${escapeHtml(branding.kioskTagline || FALLBACK.kioskTagline)}</div>
            </div>
          </div>

          <h1>Terima pembayaran <span>lebih cepat,</span> rapi, dan terpercaya.</h1>
          <p>Satu aplikasi untuk token PLN, tagihan listrik, pulsa Telkomsel &amp; XL, internet rumah, hingga iuran BPJS. Cetak resi, kirim WhatsApp, dan pantau omzet kios dari satu dashboard.</p>

          <ul class="login-points">
            <li><span class="point-icon">${icon("bolt", 15)}</span> 5 kategori layanan dalam satu menu</li>
            <li><span class="point-icon">${icon("receipt", 15)}</span> Resi PDF, gambar, dan kirim WhatsApp</li>
            <li><span class="point-icon">${icon("barChart", 15)}</span> Laporan transaksi &amp; export Excel</li>
            <li><span class="point-icon">${icon("shieldCheck", 15)}</span> Data tersimpan lokal di perangkat kios</li>
          </ul>
        </div>
        <div class="login-foot">© ${new Date().getFullYear()} ${escapeHtml(branding.kioskName || "Payment Gateway")} · Sistem Pembayaran Kios</div>
      </section>

      <section class="login-form-wrap">
        <form class="login-card" id="loginForm" autocomplete="on" novalidate>
          <div class="login-card-head">
            <span class="eyebrow">Area Administrator</span>
            <h2>Masuk ke dashboard</h2>
            <p>Kelola transaksi dan pengaturan kios Anda.</p>
          </div>

          <div class="login-error" id="loginError" role="alert">
            ${icon("alert", 17)}
            <span id="loginErrorText"></span>
          </div>

          <label class="field">
            <span>Username</span>
            <div class="input-icon">
              ${icon("user", 17)}
              <input class="input" id="username" name="username" placeholder="Masukkan username" value="admin" autocomplete="username" required />
            </div>
          </label>

          <label class="field">
            <span>Kata Sandi</span>
            <div class="input-icon">
              ${icon("lock", 17)}
              <input class="input has-eye" id="password" name="password" type="password" placeholder="Masukkan kata sandi" autocomplete="current-password" required />
              <button class="btn-eye" type="button" id="togglePassword" aria-label="Tampilkan kata sandi">${icon("eye", 17)}</button>
            </div>
          </label>

          <button class="btn btn-primary btn-lg btn-block" id="loginBtn" type="submit">
            ${icon("logIn", 18)} Masuk
          </button>

          ${firstRun ? `<div class="login-hint">Login pertama kali: <code>admin</code> / <code>admin123</code><br />Segera ubah kata sandi di menu Pengaturan.</div>` : `<div class="login-hint">Akses terbatas untuk administrator kios.</div>`}
        </form>
      </section>
    </div>`;

  const form = container.querySelector("#loginForm");
  const errorBox = container.querySelector("#loginError");
  const errorText = container.querySelector("#loginErrorText");
  const button = container.querySelector("#loginBtn");
  const password = container.querySelector("#password");

  function showError(text) {
    errorText.textContent = text;
    errorBox.classList.add("show");
  }

  if (message) {
    showError(message);
  }

  container.querySelector("#togglePassword").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const visible = password.type === "text";
    password.type = visible ? "password" : "text";
    button.innerHTML = icon(visible ? "eye" : "eyeOff", 17);
    button.setAttribute("aria-label", visible ? "Tampilkan kata sandi" : "Sembunyikan kata sandi");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.remove("show");
    const username = form.username.value.trim();
    const pass = form.password.value;
    if (!username || !pass) {
      showError("Username dan kata sandi wajib diisi.");
      return;
    }
    setLoading(button, true, "Memeriksa…");
    try {
      const data = await api.post("/auth/login", { username, password: pass });
      setLoading(button, false);
      state.user = data.user;
      state.settings = { ...(state.settings || {}), ...data.settings };
      applyTheme(state.settings);
      onSuccess?.(data);
    } catch (error) {
      setLoading(button, false);
      showError(error.message || "Gagal masuk. Coba lagi.");
      password.focus();
      password.select();
    }
  });

  password.focus();
}
