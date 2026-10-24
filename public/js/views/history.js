import { api, buildQuery } from "../api.js";
import { icon } from "../icons.js";
import { findCategory, state } from "../store.js";
import {
  debounce,
  emptyState,
  escapeHtml,
  fmtDateTime,
  methodLabel,
  num,
  openModal,
  rp,
  statusBadge,
  toast,
} from "../ui.js";
import { openTransactionDetail, showWaModal } from "../receipt-modal.js";

export async function renderHistory(container) {
  const filters = {
    q: "",
    category: "all",
    status: "all",
    from: "",
    to: "",
    page: 1,
    limit: 15,
  };

  const categoryOptions = state.categories
    .map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`)
    .join("");

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">Arsip transaksi</span>
          <h2>Riwayat transaksi</h2>
          <p>Semua transaksi tercatat otomatis dan dapat dicetak ulang kapan saja.</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-ghost" href="#/export">${icon("download", 17)} Export</a>
          <a class="btn btn-primary" href="#/menu/pln">${icon("plus", 17)} Transaksi Baru</a>
        </div>
      </div>

      <section class="card filter-card">
        <div class="filter-row">
          <div class="search-box">
            ${icon("search", 17)}
            <input id="historySearch" placeholder="Cari referensi, nomor, atau nama pelanggan…" autocomplete="off" />
          </div>
          <select class="select" id="historyCategory">
            <option value="all">Semua kategori</option>
            ${categoryOptions}
          </select>
          <select class="select" id="historyStatus">
            <option value="all">Semua status</option>
            <option value="sukses">Sukses</option>
            <option value="gagal">Gagal</option>
          </select>
          <div class="date-range">
            ${icon("calendar", 15)}
            <input class="input" type="date" id="historyFrom" aria-label="Dari tanggal" />
            <span>s/d</span>
            <input class="input" type="date" id="historyTo" aria-label="Sampai tanggal" />
          </div>
          <button class="btn btn-ghost" id="historyReset">${icon("refresh", 15)} Reset</button>
        </div>
      </section>

      <div class="summary-strip" id="historySummary">
        <div class="summary-item"><span>Transaksi</span><strong>—</strong></div>
        <div class="summary-item"><span>Pendapatan</span><strong>—</strong></div>
        <div class="summary-item"><span>Biaya admin</span><strong>—</strong></div>
        <div class="summary-item"><span>Keberhasilan</span><strong>—</strong></div>
      </div>

      <section class="card">
        <div class="card-head">
          <div><h3>Daftar transaksi</h3><p id="historyCount">Memuat data…</p></div>
          <button class="btn btn-soft btn-sm" id="historyRefresh">${icon("refresh", 14)} Muat ulang</button>
        </div>
        <div id="historyTable">
          <div class="loading-block"><span class="spinner"></span><span>Memuat transaksi…</span></div>
        </div>
        <div class="pagination" id="historyPagination"></div>
      </section>
    </div>`;

  const tableBox = container.querySelector("#historyTable");
  const summaryBox = container.querySelector("#historySummary");
  const paginationBox = container.querySelector("#historyPagination");
  const countText = container.querySelector("#historyCount");

  const searchInput = container.querySelector("#historySearch");
  const categorySelect = container.querySelector("#historyCategory");
  const statusSelect = container.querySelector("#historyStatus");
  const fromInput = container.querySelector("#historyFrom");
  const toInput = container.querySelector("#historyTo");

  function queryString() {
    return buildQuery({
      q: filters.q,
      category: filters.category,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      page: filters.page,
      limit: filters.limit,
    });
  }

  async function load() {
    tableBox.innerHTML = `<div class="loading-block"><span class="spinner"></span><span>Memuat transaksi…</span></div>`;
    paginationBox.innerHTML = "";
    try {
      const data = await api.get(`/transactions${queryString()}`);
      const { items, total, page, pages, summary } = data;

      countText.textContent = `${num(total)} transaksi ditemukan`;
      summaryBox.innerHTML = `
        <div class="summary-item"><span>Transaksi</span><strong>${num(summary.count)}</strong></div>
        <div class="summary-item"><span>Pendapatan</span><strong class="money">${rp(summary.revenue)}</strong></div>
        <div class="summary-item"><span>Biaya admin</span><strong class="money">${rp(summary.fee)}</strong></div>
        <div class="summary-item"><span>Keberhasilan</span><strong>${summary.successRate.toLocaleString("id-ID")}%</strong></div>`;

      if (!items.length) {
        tableBox.innerHTML = emptyState(
          "history",
          "Transaksi tidak ditemukan",
          "Coba ubah kata kunci atau filter tanggal. Transaksi baru akan muncul otomatis di sini.",
          `<a class="btn btn-primary btn-sm" href="#/menu/pln">${icon("plus", 15)} Mulai transaksi</a>`,
        );
      } else {
        tableBox.innerHTML = `
          <div class="table-wrap" style="border-radius:var(--radius);overflow-x:auto">
            <table class="modern-data-table">
              <thead>
                <tr>
                  <th style="width:150px">Waktu / Referensi</th>
                  <th>Produk</th>
                  <th>Pelanggan</th>
                  <th style="width:140px;text-align:right">Total</th>
                  <th style="width:120px">Metode</th>
                  <th style="width:110px">Status</th>
                  <th style="width:230px;text-align:right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (trx) => `
                  <tr data-ref="${escapeHtml(trx.ref)}">
                    <td style="width:150px">
                      <span class="badge-ref">${escapeHtml(trx.ref)}</span>
                      <div class="cell-sub"><small>${escapeHtml(fmtDateTime(trx.createdAt))}</small></div>
                    </td>
                    <td>
                      <strong class="table-item-title">${escapeHtml(trx.productLabel)}</strong>
                      <div class="cell-sub">${escapeHtml(trx.categoryName)} · ${escapeHtml(trx.typeName)}</div>
                    </td>
                    <td>
                      <div style="font-weight:600;font-size:0.83rem">${escapeHtml(trx.customerName || "-")}</div>
                      <div class="cell-sub">
                        <span>ID: ${escapeHtml(trx.customerId)}</span>
                        ${trx.customerPhone ? `<span>· WA: ${escapeHtml(trx.customerPhone)}</span>` : ""}
                      </div>
                    </td>
                    <td style="width:140px;text-align:right">
                      <span class="cell-price">${rp(trx.total)}</span>
                    </td>
                    <td style="width:120px">
                      <span class="badge-cat">${escapeHtml(methodLabel(trx.paymentMethod))}</span>
                    </td>
                    <td style="width:110px">${statusBadge(trx.status)}</td>
                    <td class="cell-actions" style="width:230px;text-align:right">
                      <div class="row-actions justify-end">
                        <button class="btn-action-wa" data-wa="${escapeHtml(trx.ref)}" title="Send Receipt WA">
                          ${icon("whatsapp", 15)} <span>Send Receipt WA</span>
                        </button>
                        <button class="icon-btn sm" data-view="${escapeHtml(trx.ref)}" title="Lihat detail resi">
                          ${icon("eye", 15)}
                        </button>
                      </div>
                    </td>
                  </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`;
      }

      paginationBox.innerHTML = `
        <span>Halaman ${page} dari ${pages} · ${num(total)} data</span>
        <div class="pagination-btns">
          <button class="btn btn-ghost" id="prevPage" ${page <= 1 ? "disabled" : ""}>${icon("chevronLeft", 14)} Sebelumnya</button>
          <button class="btn btn-ghost" id="nextPage" ${page >= pages ? "disabled" : ""}>Berikutnya ${icon("chevronRight", 14)}</button>
        </div>`;

      tableBox.querySelectorAll("tr[data-ref]").forEach((row) => {
        row.addEventListener("click", (event) => {
          if (event.target.closest("[data-view]") || event.target.closest("[data-wa]")) return;
          openTransactionDetail(row.dataset.ref);
        });
      });
      tableBox.querySelectorAll("[data-wa]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const ref = button.dataset.wa;
          const found = items.find((x) => x.ref === ref);
          if (found) showWaModal(found);
        });
      });
      tableBox.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openTransactionDetail(button.dataset.view);
        });
      });

      paginationBox.querySelector("#prevPage")?.addEventListener("click", () => {
        if (filters.page > 1) {
          filters.page -= 1;
          load();
          container.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      paginationBox.querySelector("#nextPage")?.addEventListener("click", () => {
        if (filters.page < pages) {
          filters.page += 1;
          load();
          container.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    } catch (error) {
      tableBox.innerHTML = `<div class="alert alert-danger" style="margin:16px">${icon("alert", 16)}<span>${escapeHtml(error.message)}</span></div>`;
      countText.textContent = "Gagal memuat transaksi";
      toast(error.message, "error");
    }
  }

  const debouncedLoad = debounce(() => {
    filters.page = 1;
    load();
  }, 350);

  searchInput.addEventListener("input", () => {
    filters.q = searchInput.value.trim();
    debouncedLoad();
  });

  categorySelect.addEventListener("change", () => {
    filters.category = categorySelect.value;
    filters.page = 1;
    load();
  });

  statusSelect.addEventListener("change", () => {
    filters.status = statusSelect.value;
    filters.page = 1;
    load();
  });

  fromInput.addEventListener("change", () => {
    filters.from = fromInput.value;
    filters.page = 1;
    load();
  });

  toInput.addEventListener("change", () => {
    filters.to = toInput.value;
    filters.page = 1;
    load();
  });

  container.querySelector("#historyReset").addEventListener("click", () => {
    filters.q = "";
    filters.category = "all";
    filters.status = "all";
    filters.from = "";
    filters.to = "";
    filters.page = 1;
    searchInput.value = "";
    categorySelect.value = "all";
    statusSelect.value = "all";
    fromInput.value = "";
    toInput.value = "";
    load();
  });

  container.querySelector("#historyRefresh").addEventListener("click", load);

  await load();
}
