import { api } from "../api.js";
import { icon } from "../icons.js";
import { state, updateSettings } from "../store.js";
import {
  confirmDialog,
  escapeHtml,
  relativeTime,
  setLoading,
  toast,
} from "../ui.js";

function formatWaNumber(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "-";
  if (digits.startsWith("62") && digits.length > 4) {
    return `+62 ${digits.slice(2).replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3")}`;
  }
  return `+${digits}`;
}

function statusInfo(wa) {
  const status = wa?.status || "disconnected";
  if (status === "connected") {
    const name = wa.me?.name || wa.me?.number;
    return {
      status,
      label: "Terhubung",
      title: "WhatsApp terhubung",
      text: name
        ? `Akun ${name} siap mengirim bukti transaksi ke pelanggan.`
        : "Perangkat WhatsApp siap mengirim bukti transaksi.",
    };
  }
  if (status === "qr") {
    return {
      status,
      label: "Menunggu scan QR",
      title: "Scan QR untuk menghubungkan",
      text: "Buka WhatsApp di ponsel, lalu pindai QR di bawah ini melalui menu Perangkat tertaut.",
    };
  }
  if (status === "connecting") {
    return {
      status,
      label: "Menghubungkan…",
      title: "Menyiapkan sesi WhatsApp",
      text: "Mohon tunggu sebentar. QR akan muncul otomatis setelah sesi siap.",
    };
  }
  if (status === "error") {
    return {
      status,
      label: "Koneksi bermasalah",
      title: "Koneksi WhatsApp terputus",
      text: wa?.error || "Terjadi kesalahan saat menghubungkan WhatsApp. Silakan hubungkan ulang.",
    };
  }
  return {
    status: "disconnected",
    label: "Belum terhubung",
    title: "WhatsApp belum terhubung",
    text: "Hubungkan WhatsApp kios agar resi dan bukti transaksi bisa dikirim langsung ke pelanggan.",
  };
}

function qrPanelHtml(wa) {
  const status = wa?.status || "disconnected";

  if (status === "qr") {
    return `
      <div class="qr-panel">
        ${wa.qrDataUrl
          ? `<div class="qr-frame"><img src="${wa.qrDataUrl}" alt="QR login WhatsApp" /></div>`
          : `<div class="qr-frame empty"><span class="spinner"></span></div>`}
        <ol class="qr-steps">
          <li>Buka aplikasi WhatsApp di ponsel Anda.</li>
          <li>Ketuk menu <strong>⋮</strong> lalu pilih <strong>Perangkat tertaut</strong>.</li>
          <li>Ketuk <strong>Tautkan perangkat</strong> dan pindai QR ini.</li>
          <li>Setelah terhubung, QR akan hilang dan status berubah menjadi Terhubung.</li>
        </ol>
      </div>`;
  }

  if (status === "connecting") {
    return `
      <div class="qr-panel">
        <div class="qr-frame empty">
          <div style="display:grid;gap:9px;place-items:center">
            <span class="spinner spinner-lg"></span>
            <span>Menyiapkan QR…</span>
          </div>
        </div>
        <ol class="qr-steps">
          <li>Menyiapkan koneksi ke WhatsApp Web.</li>
          <li>QR akan muncul otomatis di sini.</li>
          <li>Siapkan ponsel yang akan ditautkan.</li>
        </ol>
      </div>`;
  }

  if (status === "error") {
    return `
      <div class="alert alert-danger mt-16">
        ${icon("alert", 16)}
        <span>${escapeHtml(wa?.error || "Koneksi WhatsApp terputus. Silakan hubungkan ulang.")}</span>
      </div>`;
  }

  return "";
}

function actionsHtml(wa) {
  const status = wa?.status || "disconnected";

  if (status === "connected") {
    return `
      <button class="btn btn-soft" type="button" data-wa-refresh>${icon("refresh", 16)} Segarkan</button>
      <button class="btn btn-ghost" type="button" data-wa-logout>${icon("power", 16)} Putuskan</button>`;
  }

  if (status === "qr" || status === "connecting") {
    return `
      <button class="btn btn-soft" type="button" data-wa-refresh>${icon("refresh", 16)} Segarkan QR</button>
      <button class="btn btn-ghost" type="button" data-wa-logout>${icon("x", 16)} Batalkan</button>`;
  }

  return `
    <button class="btn btn-whatsapp" type="button" data-wa-connect>
      ${icon("whatsapp", 17)} ${status === "error" ? "Hubungkan ulang" : "Hubungkan WhatsApp"}
    </button>
    <button class="btn btn-soft" type="button" data-wa-refresh>${icon("refresh", 16)} Segarkan</button>`;
}

function accountHtml(wa) {
  if (wa?.status !== "connected" || !wa.me) {
    return `
      <div class="empty-state" style="padding:22px 8px">
        <div class="empty-icon">${icon("smartphone", 24)}</div>
        <h3>Belum ada perangkat</h3>
        <p>Hubungkan WhatsApp untuk melihat detail akun yang aktif di kios ini.</p>
      </div>`;
  }

  return `
    <div class="wa-account">
      <span class="avatar">${icon("whatsapp", 18)}</span>
      <div>
        <strong>${escapeHtml(wa.me.name || "Perangkat WhatsApp")}</strong>
        <span>${escapeHtml(formatWaNumber(wa.me.number))}${wa.connectedAt ? ` · ${escapeHtml(relativeTime(wa.connectedAt))}` : ""}</span>
      </div>
    </div>
    <div class="summary-strip mt-12" style="grid-template-columns:1fr 1fr">
      <div class="summary-item"><span>Status</span><strong class="text-success">Aktif</strong></div>
      <div class="summary-item"><span>Sesi</span><strong>Tersimpan lokal</strong></div>
    </div>`;
}

export async function renderWhatsapp(container) {
  const [waSnap, settingsResult] = await Promise.all([
    api.get("/wa/status").catch(() => state.wa),
    api.get("/settings").catch(() => null),
  ]);

  if (settingsResult?.settings) {
    state.settings = { ...(state.settings || {}), ...settingsResult.settings };
  }

  const settings = state.settings || {};
  const defaultMessage = settings.waDefaultMessage || "Terima kasih telah bertransaksi di kios kami.";

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">Integrasi pesan</span>
          <h2>WhatsApp</h2>
          <p>Hubungkan WhatsApp kios untuk mengirim bukti transaksi sebagai dokumen PDF langsung ke pelanggan.</p>
        </div>
        <span class="badge badge-info">${icon("shieldCheck", 12)} Sesi tersimpan lokal</span>
      </div>

      <div class="wa-grid">
        <div class="stack-16">
          <section class="wa-hero" id="waHero">
            <div class="wa-hero-top">
              <span class="wa-logo">${icon("whatsapp", 26)}</span>
              <div style="flex:1;min-width:0">
                <h3 id="waHeroTitle">WhatsApp</h3>
                <p id="waHeroText">Memeriksa status koneksi…</p>
                <span class="wa-status" id="waStatus"><i class="dot"></i><span id="waStatusText">Memeriksa…</span></span>
              </div>
            </div>
            <div class="wa-actions" id="waActions"></div>
            <div id="waQr"></div>
          </section>

          <section class="card">
            <div class="card-head">
              <div>
                <h3>Preferensi pengiriman</h3>
                <p>Atur pengiriman resi otomatis dari kios.</p>
              </div>
            </div>
            <div class="card-body">
              <form id="waPrefsForm">
                <label class="switch">
                  <input type="checkbox" id="autoSendReceipt" ${settings.autoSendReceipt ? "checked" : ""} />
                  <span class="switch-track"></span>
                  <span class="switch-label">Kirim resi otomatis setelah transaksi
                    <small>Hanya berlaku jika ID pelanggan berupa nomor HP dan WhatsApp terhubung.</small>
                  </span>
                </label>

                <label class="field mt-16">
                  <span>Pesan pengantar default</span>
                  <textarea class="textarea" id="waDefaultMessage" rows="3" maxlength="300">${escapeHtml(defaultMessage)}</textarea>
                  <span class="field-hint">Dipakai saat mengirim resi dan pesan tes. Maksimal 300 karakter.</span>
                </label>

                <div class="form-actions">
                  <button type="submit" class="btn btn-primary" id="saveWaPrefs">${icon("save", 17)} Simpan preferensi</button>
                </div>
              </form>
            </div>
          </section>
        </div>

        <div class="stack-16">
          <section class="card">
            <div class="card-head">
              <div><h3>Akun terhubung</h3><p>Perangkat WhatsApp aktif di kios ini.</p></div>
            </div>
            <div class="card-body" id="waAccount"></div>
          </section>

          <section class="card">
            <div class="card-head">
              <div><h3>Tes koneksi</h3><p>Kirim pesan uji ke nomor WhatsApp.</p></div>
            </div>
            <div class="card-body">
              <form class="test-form" id="waTestForm">
                <label class="field" style="margin-bottom:0">
                  <span>Nomor tujuan</span>
                  <div class="input-prefix">
                    <span class="prefix">+62</span>
                    <input class="input" id="waTestNumber" placeholder="81234567890" inputmode="tel" autocomplete="off" />
                  </div>
                </label>

                <label class="field" style="margin-bottom:0">
                  <span>Pesan</span>
                  <textarea class="textarea" id="waTestMessage" rows="3" maxlength="300">${escapeHtml(defaultMessage)}</textarea>
                </label>

                <button class="btn btn-whatsapp btn-block" id="waTestBtn" type="submit" disabled>
                  ${icon("send", 16)} Kirim pesan tes
                </button>
                <p class="hint" id="waTestHint" style="text-align:center">Memeriksa status WhatsApp…</p>
              </form>
            </div>
          </section>

          <section class="card card-pad">
            <div class="wa-info">
              <div class="wa-info-item">${icon("filePdf", 16)}<span>Resi dikirim sebagai dokumen PDF beserta pesan pengantar.</span></div>
              <div class="wa-info-item">${icon("smartphone", 16)}<span>Scan QR dari WhatsApp → Perangkat tertaut. Sesi tersimpan di perangkat kios.</span></div>
              <div class="wa-info-item">${icon("shieldCheck", 16)}<span>Nomor pelanggan harus terdaftar di WhatsApp. Nomor diawali 08 atau 62.</span></div>
              <div class="wa-info-item">${icon("alert", 16)}<span>Jangan putuskan perangkat saat sedang mengirim resi.</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>`;

  const hero = container.querySelector("#waHero");
  const heroTitle = container.querySelector("#waHeroTitle");
  const heroText = container.querySelector("#waHeroText");
  const statusEl = container.querySelector("#waStatus");
  const statusText = container.querySelector("#waStatusText");
  const actions = container.querySelector("#waActions");
  const qrBox = container.querySelector("#waQr");
  const accountBox = container.querySelector("#waAccount");
  const testForm = container.querySelector("#waTestForm");
  const testBtn = container.querySelector("#waTestBtn");
  const testHint = container.querySelector("#waTestHint");
  const prefsForm = container.querySelector("#waPrefsForm");

  let current = null;
  let renderedKey = "";
  let alive = true;
  let timer = null;

  function renderHero() {
    const info = statusInfo(current);
    hero.classList.toggle("off", info.status === "disconnected" || info.status === "error");
    heroTitle.textContent = info.title;
    heroText.textContent = info.text;
    statusEl.className = `wa-status ${info.status}`;
    statusText.textContent = info.label;
  }

  function renderTestState() {
    const connected = current?.status === "connected";
    testBtn.disabled = !connected;
    testHint.textContent = connected
      ? "Pesan dikirim dari nomor WhatsApp yang terhubung."
      : "Hubungkan WhatsApp terlebih dahulu untuk mengirim pesan tes.";
  }

  function schedulePoll() {
    clearTimeout(timer);
    timer = null;
    if (!alive) return;
    const status = current?.status;
    if (status === "qr" || status === "connecting") {
      timer = setTimeout(pollStatus, 2500);
    }
  }

  function applySnapshot(snap, { broadcast = true } = {}) {
    current = snap || { status: "disconnected" };
    state.wa = current;

    if (broadcast) {
      window.dispatchEvent(new CustomEvent("wa:updated", { detail: current }));
    }

    const key = [
      current.status,
      current.qrDataUrl || "",
      current.error || "",
      current.me?.number || "",
      current.connectedAt || "",
    ].join("|");

    if (key !== renderedKey) {
      renderedKey = key;
      renderHero();
      qrBox.innerHTML = qrPanelHtml(current);
      actions.innerHTML = actionsHtml(current);
      accountBox.innerHTML = accountHtml(current);
      renderTestState();
    }

    schedulePoll();
  }

  async function pollStatus() {
    if (!alive) return;
    try {
      const snap = await api.get("/wa/status");
      if (!alive) return;
      applySnapshot(snap);
    } catch {
      if (alive) schedulePoll();
    }
  }

  function onExternal(event) {
    if (!alive || !event.detail) return;
    applySnapshot(event.detail, { broadcast: false });
  }

  actions.addEventListener("click", async (event) => {
    const connectBtn = event.target.closest("[data-wa-connect]");
    if (connectBtn) {
      setLoading(connectBtn, true, "Menyiapkan QR…");
      try {
        const snap = await api.post("/wa/connect");
        applySnapshot(snap);
        toast("Menyiapkan sesi WhatsApp. Pindai QR yang muncul.", "info");
      } catch (error) {
        toast(error.message || "Gagal menghubungkan WhatsApp.", "error");
      } finally {
        setLoading(connectBtn, false);
      }
      return;
    }

    const refreshBtn = event.target.closest("[data-wa-refresh]");
    if (refreshBtn) {
      setLoading(refreshBtn, true, "Memuat…");
      try {
        const snap = await api.get("/wa/status");
        applySnapshot(snap);
        toast("Status WhatsApp diperbarui.", "success");
      } catch (error) {
        toast(error.message || "Gagal memuat status WhatsApp.", "error");
      } finally {
        setLoading(refreshBtn, false);
      }
      return;
    }

    const logoutBtn = event.target.closest("[data-wa-logout]");
    if (logoutBtn) {
      const confirmed = await confirmDialog({
        title: "Putuskan WhatsApp",
        message: "Perangkat akan diputuskan dan sesi WhatsApp dihapus dari kios ini. Lanjutkan?",
        confirmLabel: "Ya, putuskan",
        tone: "danger",
      });
      if (!confirmed) return;

      setLoading(logoutBtn, true, "Memutuskan…");
      try {
        const snap = await api.post("/wa/logout");
        applySnapshot(snap);
        toast(snap.message || "Perangkat WhatsApp berhasil diputuskan.", "success");
      } catch (error) {
        toast(error.message || "Gagal memutuskan WhatsApp.", "error");
      } finally {
        setLoading(logoutBtn, false);
      }
    }
  });

  prefsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = container.querySelector("#saveWaPrefs");
    const autoSendReceipt = container.querySelector("#autoSendReceipt").checked;
    const waDefaultMessage = container.querySelector("#waDefaultMessage").value.trim();

    if (!waDefaultMessage) {
      toast("Pesan pengantar default wajib diisi.", "warning");
      container.querySelector("#waDefaultMessage").focus();
      return;
    }

    setLoading(button, true, "Menyimpan…");
    try {
      const result = await api.put("/settings", { autoSendReceipt, waDefaultMessage });
      updateSettings(result.settings);
      toast(result.message || "Preferensi WhatsApp disimpan.", "success");
    } catch (error) {
      toast(error.message || "Gagal menyimpan preferensi.", "error");
    } finally {
      setLoading(button, false);
    }
  });

  testForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const number = container.querySelector("#waTestNumber").value.trim();
    const message = container.querySelector("#waTestMessage").value.trim();

    if (!number) {
      toast("Nomor WhatsApp tujuan wajib diisi.", "warning");
      container.querySelector("#waTestNumber").focus();
      return;
    }

    setLoading(testBtn, true, "Mengirim…");
    try {
      const result = await api.post("/wa/test", { number, message });
      toast(result.message || "Pesan tes berhasil dikirim.", "success");
    } catch (error) {
      toast(error.message || "Gagal mengirim pesan tes.", "error");
    } finally {
      setLoading(testBtn, false);
      renderTestState();
    }
  });

  window.addEventListener("wa:external", onExternal);
  applySnapshot(waSnap || { status: "disconnected" });

  return () => {
    alive = false;
    clearTimeout(timer);
    window.removeEventListener("wa:external", onExternal);
  };
}
