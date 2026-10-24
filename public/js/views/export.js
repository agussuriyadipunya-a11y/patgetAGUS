import { api, buildQuery, downloadFile } from "../api.js";
import { icon } from "../icons.js";
import { state } from "../store.js";
import { escapeHtml, num, rp, setLoading, toast, todayWib } from "../ui.js";

function firstDayOfMonthWib() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}-01`;
}

export async function renderExport(container) {
  const filters = {
    from: todayWib(-6),
    to: todayWib(),
    category: "all",
    status: "all",
    preset: "7d",
    format: "xlsx",
  };

  const categoryOptions = state.categories
    .map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`)
    .join("");

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">Laporan &amp; arsip</span>
          <h2>Export transaksi</h2>
          <p>Unduh seluruh transaksi sesuai filter dalam format Excel atau PDF.</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-ghost" href="#/riwayat">${icon("history", 17)} Riwayat</a>
        </div>
      </div>

      <div class="export-grid">
        <div class="stack-16">
          <section class="card">
            <div class="card-head">
              <div><h3>1. Pilih periode</h3><p>Gunakan preset atau atur rentang tanggal sendiri.</p></div>
            </div>
            <div class="card-body">
              <div class="preset-row" id="exportPresets">
                <button type="button" class="preset-btn" data-preset="today">Hari ini</button>
                <button type="button" class="preset-btn active" data-preset="7d">7 hari</button>
                <button type="button" class="preset-btn" data-preset="30d">30 hari</button>
                <button type="button" class="preset-btn" data-preset="month">Bulan ini</button>
                <button type="button" class="preset-btn" data-preset="all">Semua</button>
              </div>
              <div class="date-pair">
                <label class="field" style="margin-bottom:0">
                  <span>Dari tanggal</span>
                  <input type="date" class="input" id="exportFrom" value="${filters.from}" />
                </label>
                <label class="field" style="margin-bottom:0">
                  <span>Sampai tanggal</span>
                  <input type="date" class="input" id="exportTo" value="${filters.to}" />
                </label>
              </div>

              <div class="form-grid mt-16">
                <label class="field">
                  <span>Kategori</span>
                  <select class="select" id="exportCategory">
                    <option value="all">Semua kategori</option>
                    ${categoryOptions}
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select class="select" id="exportStatus">
                    <option value="all">Semua status</option>
                    <option value="sukses">Sukses</option>
                    <option value="gagal">Gagal</option>
                  </select>
                </label>
              </div>

              <div class="export-preview" id="exportPreview">
                <div class="loading-block" style="padding:14px"><span class="spinner"></span><span>Menghitung data…</span></div>
              </div>
            </div>
          </section>

          <div class="alert alert-info">
            ${icon("info", 16)}
            <span>File export memuat <strong>seluruh transaksi</strong> sesuai filter, bukan hanya halaman yang tampil di riwayat. File dibuat langsung dari database kios.</span>
          </div>
        </div>

        <section class="card">
          <div class="card-head">
            <div><h3>2. Pilih format</h3><p>Excel untuk analisis, PDF untuk cetak.</p></div>
          </div>
          <div class="card-body">
            <div class="format-options" id="exportFormats">
              <button type="button" class="format-card active" data-format="xlsx">
                <span class="format-icon xlsx">${icon("barChart", 19)}</span>
                <span class="format-text"><strong>Excel (.xlsx)</strong><small>Data lengkap + ringkasan kategori</small></span>
                <span class="format-check">${icon("checkCircle", 18)}</span>
              </button>
              <button type="button" class="format-card" data-format="pdf">
                <span class="format-icon pdf">${icon("fileText", 19)}</span>
                <span class="format-text"><strong>PDF (.pdf)</strong><small>Laporan siap cetak, ukuran A4 landscape</small></span>
                <span class="format-check">${icon("checkCircle", 18)}</span>
              </button>
            </div>

            <button class="btn btn-primary btn-lg btn-block" id="downloadExport">${icon("download", 18)} Unduh laporan</button>
            <p class="hint mt-12" style="text-align:center">Nama file otomatis menyertakan tanggal unduhan.</p>
          </div>
        </section>
      </div>
    </div>`;

  const previewBox = container.querySelector("#exportPreview");
  const fromInput = container.querySelector("#exportFrom");
  const toInput = container.querySelector("#exportTo");
  const categorySelect = container.querySelector("#exportCategory");
  const statusSelect = container.querySelector("#exportStatus");
  const downloadBtn = container.querySelector("#downloadExport");

  function query() {
    return {
      from: filters.from,
      to: filters.to,
      category: filters.category,
      status: filters.status,
    };
  }

  async function loadPreview() {
    previewBox.innerHTML = `<div class="loading-block" style="padding:14px"><span class="spinner"></span><span>Menghitung data…</span></div>`;
    try {
      const data = await api.get(`/transactions${buildQuery({ ...query(), limit: 1, page: 1 })}`);
      const summary = data.summary;
      previewBox.innerHTML = `
        <div class="export-stat"><span>Jumlah transaksi</span><strong>${num(summary.count)}</strong></div>
        <div class="export-stat"><span>Total pendapatan</span><strong>${rp(summary.revenue)}</strong></div>
        <div class="export-stat"><span>Biaya admin</span><strong>${rp(summary.fee)}</strong></div>
        <div class="export-stat"><span>Keberhasilan</span><strong>${summary.successRate.toLocaleString("id-ID")}%</strong></div>`;
    } catch (error) {
      previewBox.innerHTML = `<div class="alert alert-danger">${icon("alert", 16)}<span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  function setPreset(preset) {
    filters.preset = preset;
    const today = todayWib();
    if (preset === "today") {
      filters.from = today;
      filters.to = today;
    } else if (preset === "7d") {
      filters.from = todayWib(-6);
      filters.to = today;
    } else if (preset === "30d") {
      filters.from = todayWib(-29);
      filters.to = today;
    } else if (preset === "month") {
      filters.from = firstDayOfMonthWib();
      filters.to = today;
    } else if (preset === "all") {
      filters.from = "";
      filters.to = "";
    }
    fromInput.value = filters.from;
    toInput.value = filters.to;
    container.querySelectorAll("[data-preset]").forEach((button) => {
      button.classList.toggle("active", button.dataset.preset === preset);
    });
    loadPreview();
  }

  container.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => setPreset(button.dataset.preset));
  });

  fromInput.addEventListener("change", () => {
    filters.from = fromInput.value;
    filters.preset = "custom";
    container.querySelectorAll("[data-preset]").forEach((button) => button.classList.remove("active"));
    loadPreview();
  });

  toInput.addEventListener("change", () => {
    filters.to = toInput.value;
    filters.preset = "custom";
    container.querySelectorAll("[data-preset]").forEach((button) => button.classList.remove("active"));
    loadPreview();
  });

  categorySelect.addEventListener("change", () => {
    filters.category = categorySelect.value;
    loadPreview();
  });

  statusSelect.addEventListener("change", () => {
    filters.status = statusSelect.value;
    loadPreview();
  });

  container.querySelectorAll("[data-format]").forEach((button) => {
    button.addEventListener("click", () => {
      filters.format = button.dataset.format;
      container.querySelectorAll("[data-format]").forEach((el) => el.classList.toggle("active", el === button));
    });
  });

  downloadBtn.addEventListener("click", async () => {
    if (filters.from && filters.to && filters.from > filters.to) {
      toast("Tanggal awal tidak boleh melebihi tanggal akhir.", "warning");
      return;
    }
    setLoading(downloadBtn, true, "Menyiapkan file…");
    try {
      const extension = filters.format === "pdf" ? "pdf" : "xlsx";
      const filename = await downloadFile(
        `/export/transactions.${extension}${buildQuery(query())}`,
        `Laporan-Transaksi.${extension}`,
      );
      toast(`File ${filename} berhasil diunduh.`, "success");
    } catch (error) {
      toast(error.message || "Gagal mengunduh laporan.", "error");
    } finally {
      setLoading(downloadBtn, false);
    }
  });

  await loadPreview();
}
