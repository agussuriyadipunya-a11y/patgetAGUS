import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  confirmDialog,
  escapeHtml,
  fmtDate,
  openModal,
  rp,
  setLoading,
  toast,
} from "../ui.js";

const EXPENSE_CATEGORIES = [
  "Operasional",
  "ATK",
  "Kios & Resi",
  "Konsumsi / Pantry",
  "Kebersihan",
  "Perlengkapan",
  "Maintenance & Perbaikan",
  "Lain-lain",
];

const PAYMENT_METHODS = [
  { id: "tunai", label: "Tunai (Kasir)" },
  { id: "transfer", label: "Transfer Bank" },
  { id: "petty_cash", label: "Kas Kecil (Petty Cash)" },
];

export async function renderExpenses(viewEl) {
  let query = "";
  let selectedCategory = "all";
  let fromDate = "";
  let toDate = "";

  viewEl.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Belanja Kantor</h2>
        <p class="view-desc">Pencatatan transaksi pengeluaran operasional, pembelian ATK, struk thermal, dan kebutuhan kantor.</p>
      </div>
      <div class="view-actions">
        <button class="btn btn-primary" id="addExpenseBtn">
          ${icon("shoppingCart", 16)} Catat Belanja Baru
        </button>
      </div>
    </div>

    <div class="stat-grid mb-16" id="expenseStats">
      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-label">Pengeluaran Bulan Ini</span>
          <span class="stat-icon">${icon("calendar", 18)}</span>
        </div>
        <div class="stat-value text-primary" id="statMonthTotal">-</div>
        <div class="stat-foot">Total belanja operasional bulan ini</div>
      </div>

      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-label">Belanja Hari Ini</span>
          <span class="stat-icon">${icon("creditCard", 18)}</span>
        </div>
        <div class="stat-value" id="statTodayTotal">-</div>
        <div class="stat-foot">Transaksi yang dicatat hari ini</div>
      </div>

      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-label">Total Transaksi</span>
          <span class="stat-icon">${icon("receipt", 18)}</span>
        </div>
        <div class="stat-value" id="statCount">-</div>
        <div class="stat-foot">Keseluruhan nota belanja kantor</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="filter-bar" style="gap:12px;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:220px">
          ${icon("search", 16)}
          <input type="search" id="expSearch" placeholder="Cari ref, keperluan belanja, PIC, atau no nota…" autocomplete="off" />
        </div>

        <select class="select" id="expCategorySelect" style="width:auto;min-width:160px">
          <option value="all">Semua Kategori</option>
          ${EXPENSE_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>

        <div style="display:flex;align-items:center;gap:6px">
          <input type="date" class="input" id="expFromDate" style="width:auto;padding:6px 10px" title="Dari tanggal" />
          <span>—</span>
          <input type="date" class="input" id="expToDate" style="width:auto;padding:6px 10px" title="Sampai tanggal" />
        </div>
      </div>
    </div>

    <div id="expenseTableWrap">
      <div class="loading-block">
        <span class="spinner"></span>
        <span>Memuat data transaksi belanja kantor…</span>
      </div>
    </div>`;

  const searchInput = viewEl.querySelector("#expSearch");
  const categorySelect = viewEl.querySelector("#expCategorySelect");
  const fromDateInput = viewEl.querySelector("#expFromDate");
  const toDateInput = viewEl.querySelector("#expToDate");
  const tableWrap = viewEl.querySelector("#expenseTableWrap");
  const addBtn = viewEl.querySelector("#addExpenseBtn");

  const statMonthTotal = viewEl.querySelector("#statMonthTotal");
  const statTodayTotal = viewEl.querySelector("#statTodayTotal");
  const statCount = viewEl.querySelector("#statCount");

  async function loadSummary() {
    try {
      const summary = await api.get("/office/summary");
      statMonthTotal.textContent = rp(summary.monthTotal || 0);
      statTodayTotal.textContent = rp(summary.todayTotal || 0);
      statCount.textContent = `${summary.totalExpenseCount || 0} nota`;
    } catch {
      // abaikan jika summary gagal
    }
  }

  async function loadData() {
    tableWrap.innerHTML = `
      <div class="loading-block">
        <span class="spinner"></span>
        <span>Memuat data belanja…</span>
      </div>`;

    try {
      const q = encodeURIComponent(query);
      const cat = encodeURIComponent(selectedCategory);
      const from = encodeURIComponent(fromDate);
      const to = encodeURIComponent(toDate);
      const items = await api.get(`/office/expenses?q=${q}&category=${cat}&from=${from}&to=${to}`);
      renderTable(items);
    } catch (error) {
      tableWrap.innerHTML = `
        <div class="empty-state">
          ${icon("alert", 32)}
          <h3>Gagal memuat data belanja</h3>
          <p>${escapeHtml(error.message)}</p>
          <button class="btn btn-soft mt-12" id="retryExpBtn">${icon("refresh", 14)} Coba Lagi</button>
        </div>`;
      viewEl.querySelector("#retryExpBtn")?.addEventListener("click", loadData);
    }
  }

  function renderTable(items) {
    if (!items.length) {
      tableWrap.innerHTML = `
        <div class="empty-state card">
          ${icon("shoppingCart", 36)}
          <h3>Tidak ada data belanja kantor</h3>
          <p>${query || selectedCategory !== "all" || fromDate || toDate ? "Tidak ada transaksi yang cocok dengan filter yang dipilih." : "Belum ada transaksi belanja kantor yang dicatat."}</p>
          ${
            query || selectedCategory !== "all" || fromDate || toDate
              ? `<button class="btn btn-soft mt-12" id="resetExpFilter">Reset Filter</button>`
              : `<button class="btn btn-primary mt-12" id="emptyAddExpBtn">${icon("plus", 14)} Catat Belanja Pertama</button>`
          }
        </div>`;

      viewEl.querySelector("#resetExpFilter")?.addEventListener("click", () => {
        searchInput.value = "";
        categorySelect.value = "all";
        fromDateInput.value = "";
        toDateInput.value = "";
        query = "";
        selectedCategory = "all";
        fromDate = "";
        toDate = "";
        loadData();
      });
      viewEl.querySelector("#emptyAddExpBtn")?.addEventListener("click", () => openExpenseModal(null, () => { loadData(); loadSummary(); }));
      return;
    }

    const rows = items
      .map((e) => {
        const methodLabel = PAYMENT_METHODS.find((m) => m.id === e.paymentMethod)?.label || e.paymentMethod;
        const itemCount = (e.items || []).length;

        return `
        <tr>
          <td style="width:140px">
            <span class="badge-ref">${escapeHtml(e.ref)}</span>
            <div class="cell-sub"><small>${escapeHtml(fmtDate(e.expenseDate))}</small></div>
          </td>
          <td>
            <strong class="table-item-title">${escapeHtml(e.title)}</strong>
            <div class="cell-sub">
              <span>${itemCount} macam barang</span>
              ${e.receiptNumber ? `<span>· Nota: <strong>${escapeHtml(e.receiptNumber)}</strong></span>` : ""}
            </div>
          </td>
          <td style="width:140px">
            <span class="badge-cat">${escapeHtml(e.category)}</span>
          </td>
          <td style="width:140px">
            <div style="font-weight:600;font-size:0.82rem">${escapeHtml(e.pic || "-")}</div>
            <div class="cell-sub"><small>${escapeHtml(methodLabel)}</small></div>
          </td>
          <td style="width:150px;text-align:right">
            <span class="cell-price">${rp(e.totalAmount)}</span>
          </td>
          <td style="width:230px;text-align:right">
            <div class="row-actions justify-end">
              <button class="btn-action-wa" data-send-wa="${e.id}" title="Send Receipt WA">
                ${icon("whatsapp", 15)} <span>Send Receipt WA</span>
              </button>
              <button class="icon-btn sm" data-view="${e.id}" title="Lihat Detail Nota">
                ${icon("fileText", 15)}
              </button>
              <button class="icon-btn sm text-danger" data-del="${e.id}" data-ref="${escapeHtml(e.ref)}" title="Hapus">
                ${icon("trash", 15)}
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    tableWrap.innerHTML = `
      <div class="card overflow-x" style="border-radius:var(--radius)">
        <table class="modern-data-table">
          <thead>
            <tr>
              <th style="width:140px">No. Referensi</th>
              <th>Keperluan Belanja</th>
              <th style="width:140px">Kategori</th>
              <th style="width:140px">PIC / Metode</th>
              <th style="width:150px;text-align:right">Total Pengeluaran</th>
              <th style="width:230px;text-align:right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="card-footer-info" style="display:flex;justify-content:space-between;align-items:center">
          <small>Menampilkan <strong>${items.length}</strong> transaksi belanja kantor.</small>
          <small class="text-muted">Gunakan tombol <strong>Send WA</strong> untuk mengirim bukti belanja ke WhatsApp.</small>
        </div>
      </div>`;

    tableWrap.querySelectorAll("[data-send-wa]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-send-wa");
        const exp = items.find((x) => String(x.id) === String(id));
        if (exp) showExpenseWaModal(exp);
      });
    });

    tableWrap.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-view");
        const exp = items.find((x) => String(x.id) === String(id));
        if (exp) showExpenseDetailModal(exp);
      });
    });

    tableWrap.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        const ref = btn.getAttribute("data-ref");
        const ok = await confirmDialog({
          title: "Hapus Transaksi Belanja?",
          message: `Apakah Anda yakin ingin menghapus transaksi belanja ${ref}? Catatan pengeluaran ini akan dihapus permanen.`,
          confirmText: "Ya, Hapus",
          confirmVariant: "danger",
        });
        if (!ok) return;

        try {
          await api.delete(`/office/expenses/${id}`);
          toast("Transaksi belanja berhasil dihapus.", "success");
          loadData();
          loadSummary();
        } catch (error) {
          toast(error.message, "error");
        }
      });
    });
  }

  let searchTimer = null;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = e.target.value.trim();
      loadData();
    }, 300);
  });

  categorySelect.addEventListener("change", (e) => {
    selectedCategory = e.target.value;
    loadData();
  });

  fromDateInput.addEventListener("change", (e) => {
    fromDate = e.target.value;
    loadData();
  });

  toDateInput.addEventListener("change", (e) => {
    toDate = e.target.value;
    loadData();
  });

  addBtn.addEventListener("click", () => openExpenseModal(null, () => { loadData(); loadSummary(); }));

  loadSummary();
  loadData();

  return () => {
    clearTimeout(searchTimer);
  };
}

export async function openExpenseModal(expense = null, onSaved = null) {
  let inventoryItems = [];
  try {
    inventoryItems = await api.get("/office/items");
  } catch {
    // fallback jika gagal load items
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  openModal({
    title: "Catat Belanja Kantor",
    subtitle: "Catat pengeluaran operasional dan pembelian barang kantor",
    size: "lg",
    body: `
      <form id="expenseForm" class="customer-form">
        <div class="form-grid">
          <label class="field col-8">
            <span>Keperluan / Judul Belanja <b class="text-danger">*</b></span>
            <input class="input" id="expTitle" placeholder="Contoh: Belanja Kertas Struk & Tinta Printer" required autofocus />
          </label>

          <label class="field col-4">
            <span>Kategori Belanja</span>
            <select class="select" id="expCat">
              ${EXPENSE_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </label>

          <label class="field col-4">
            <span>Tanggal Belanja <b class="text-danger">*</b></span>
            <input type="date" class="input" id="expDate" value="${todayStr}" required />
          </label>

          <label class="field col-4">
            <span>Petugas / PIC Belanja</span>
            <input class="input" id="expPic" placeholder="Nama staff / admin" value="Admin Kios" />
          </label>

          <label class="field col-4">
            <span>Metode Pembayaran</span>
            <select class="select" id="expPaymentMethod">
              ${PAYMENT_METHODS.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`).join("")}
            </select>
          </label>

          <label class="field col-6">
            <span>Nomor Struk / Nota Toko</span>
            <input class="input" id="expReceiptNo" placeholder="Contoh: NOTA-12345 (jika ada)" />
          </label>

          <label class="field col-6">
            <span>Catatan Tambahan</span>
            <input class="input" id="expNotes" placeholder="Keterangan toko pembelian, garansi, dll." />
          </label>
        </div>

        <div class="expense-items-section mt-16">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>Rincian Barang yang Dibeli</strong>
            <button type="button" class="btn btn-soft btn-sm" id="addItemRowBtn">
              ${icon("plus", 14)} Tambah Baris
            </button>
          </div>

          <div class="table-wrap">
            <table class="table expense-items-table" style="font-size:13px">
              <thead>
                <tr>
                  <th style="min-width:200px">Barang (Pilih dari Gudang atau Tulis Bebas)</th>
                  <th style="width:90px">Satuan</th>
                  <th style="width:80px">Qty</th>
                  <th style="width:130px">Harga Satuan</th>
                  <th style="width:130px;text-align:right">Subtotal</th>
                  <th style="width:40px"></th>
                </tr>
              </thead>
              <tbody id="expenseItemsBody">
                <!-- Baris item akan dimasukkan di sini -->
              </tbody>
              <tfoot>
                <tr>
                  <th colspan="4" style="text-align:right">TOTAL PENGELUARAN:</th>
                  <th id="totalExpenseDisplay" style="text-align:right;font-size:15px;color:var(--primary);font-weight:700">Rp 0</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style="margin-top:12px;padding:8px 12px;background:var(--bg-subtle);border-radius:var(--radius-sm);display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="updateStockCheckbox" checked style="cursor:pointer" />
            <label for="updateStockCheckbox" style="cursor:pointer;user-select:none;font-size:13px">
              <strong>Otomatis tambahkan kuantitas ke stok Gudang</strong> untuk barang yang dipilih dari katalog.
            </label>
          </div>
        </div>

        <div class="modal-foot mt-16">
          <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
          <button type="submit" class="btn btn-primary" id="saveExpenseBtn">
            ${icon("save", 16)} Simpan Transaksi Belanja
          </button>
        </div>
      </form>`,
    onMount(card, close) {
      const form = card.querySelector("#expenseForm");
      const itemsBody = card.querySelector("#expenseItemsBody");
      const addRowBtn = card.querySelector("#addItemRowBtn");
      const totalDisplay = card.querySelector("#totalExpenseDisplay");
      const saveBtn = card.querySelector("#saveExpenseBtn");

      card.querySelector("[data-cancel]")?.addEventListener("click", () => close());

      function recalculateTotal() {
        let total = 0;
        itemsBody.querySelectorAll("tr").forEach((row) => {
          const qty = Number(row.querySelector(".item-qty").value) || 0;
          const price = Number(row.querySelector(".item-price").value) || 0;
          const sub = qty * price;
          total += sub;
          row.querySelector(".item-subtotal").textContent = rp(sub);
        });
        totalDisplay.textContent = rp(total);
        return total;
      }

      function addRow(initialItem = null) {
        const tr = document.createElement("tr");

        const optionsHtml = inventoryItems
          .map(
            (it) =>
              `<option value="${it.id}" data-price="${it.price}" data-unit="${escapeHtml(it.unit)}" data-name="${escapeHtml(it.name)}">${escapeHtml(it.name)} (${rp(it.price)}/${escapeHtml(it.unit)})</option>`,
          )
          .join("");

        tr.innerHTML = `
          <td>
            <div style="display:grid;gap:4px">
              <select class="select item-select" style="font-size:12px;padding:4px 8px">
                <option value="">-- Pilih dari Gudang Kantor --</option>
                ${optionsHtml}
              </select>
              <input class="input item-name" placeholder="Atau ketik nama barang…" value="${initialItem ? escapeHtml(initialItem.name) : ""}" required style="font-size:12px;padding:4px 8px" />
            </div>
          </td>
          <td>
            <input class="input item-unit" placeholder="Pcs" value="${initialItem ? escapeHtml(initialItem.unit) : "Pcs"}" style="font-size:12px;padding:4px 8px" />
          </td>
          <td>
            <input class="input item-qty" type="number" min="1" step="1" value="${initialItem ? initialItem.qty : 1}" style="font-size:12px;padding:4px 8px;text-align:center" required />
          </td>
          <td>
            <input class="input item-price" type="number" min="0" step="500" value="${initialItem ? initialItem.unitPrice : 0}" style="font-size:12px;padding:4px 8px" required />
          </td>
          <td class="item-subtotal" style="text-align:right;font-weight:600;font-size:13px">
            Rp 0
          </td>
          <td style="text-align:center">
            <button type="button" class="btn btn-icon btn-ghost text-danger remove-row-btn" title="Hapus Baris" style="padding:4px">
              ${icon("trash", 14)}
            </button>
          </td>`;

        const selectEl = tr.querySelector(".item-select");
        const nameEl = tr.querySelector(".item-name");
        const unitEl = tr.querySelector(".item-unit");
        const priceEl = tr.querySelector(".item-price");
        const qtyEl = tr.querySelector(".item-qty");
        const removeBtn = tr.querySelector(".remove-row-btn");

        selectEl.addEventListener("change", () => {
          const opt = selectEl.selectedOptions[0];
          if (opt && opt.value) {
            nameEl.value = opt.getAttribute("data-name") || "";
            unitEl.value = opt.getAttribute("data-unit") || "Pcs";
            priceEl.value = opt.getAttribute("data-price") || 0;
          }
          recalculateTotal();
        });

        qtyEl.addEventListener("input", recalculateTotal);
        priceEl.addEventListener("input", recalculateTotal);

        removeBtn.addEventListener("click", () => {
          if (itemsBody.querySelectorAll("tr").length > 1) {
            tr.remove();
            recalculateTotal();
          } else {
            toast("Minimal harus ada 1 barang belanjaan.", "warning");
          }
        });

        itemsBody.appendChild(tr);
        recalculateTotal();
      }

      addRowBtn.addEventListener("click", () => addRow());

      // Tambah baris awal
      addRow();

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = card.querySelector("#expTitle").value.trim();
        const category = card.querySelector("#expCat").value;
        const expenseDate = card.querySelector("#expDate").value;
        const pic = card.querySelector("#expPic").value.trim();
        const paymentMethod = card.querySelector("#expPaymentMethod").value;
        const receiptNumber = card.querySelector("#expReceiptNo").value.trim();
        const notes = card.querySelector("#expNotes").value.trim();
        const updateStock = card.querySelector("#updateStockCheckbox").checked;

        if (!title) {
          toast("Judul belanja wajib diisi.", "warning");
          card.querySelector("#expTitle").focus();
          return;
        }

        const items = [];
        let rowValid = true;

        itemsBody.querySelectorAll("tr").forEach((row) => {
          const select = row.querySelector(".item-select");
          const name = row.querySelector(".item-name").value.trim();
          const unit = row.querySelector(".item-unit").value.trim() || "Pcs";
          const qty = Number(row.querySelector(".item-qty").value) || 1;
          const unitPrice = Number(row.querySelector(".item-price").value) || 0;

          if (!name) {
            rowValid = false;
            return;
          }

          items.push({
            itemId: select.value ? Number(select.value) : null,
            name,
            unit,
            qty,
            unitPrice,
          });
        });

        if (!rowValid || !items.length) {
          toast("Lengkapi seluruh nama barang belanjaan.", "warning");
          return;
        }

        const totalAmount = recalculateTotal();

        setLoading(saveBtn, true, "Menyimpan transaksi…");
        try {
          const res = await api.post("/office/expenses", {
            title,
            category,
            expenseDate,
            pic,
            paymentMethod,
            receiptNumber,
            notes,
            items,
            totalAmount,
            updateStock,
          });

          toast(res.message || "Transaksi belanja berhasil dicatat.", "success");
          close("saved");
          onSaved?.(res.expense);
          showExpenseDetailModal(res.expense);
        } catch (error) {
          toast(error.message || "Gagal mencatat transaksi belanja.", "error");
        } finally {
          setLoading(saveBtn, false);
        }
      });
    },
  });
}

export function showExpenseDetailModal(exp) {
  const methodLabel = PAYMENT_METHODS.find((m) => m.id === exp.paymentMethod)?.label || exp.paymentMethod;

  openModal({
    title: "Detail Transaksi Belanja",
    subtitle: `${exp.ref} · ${fmtDate(exp.expenseDate)}`,
    size: "md",
    body: `
      <div class="receipt-paper" style="margin-bottom:16px" id="printableExpensePaper">
        <div class="paper-brand">
          <strong>NOTA PENGELUARAN KANTOR</strong>
          <span>Kios Pembayaran Digital</span>
        </div>
        <div class="paper-dashed"></div>
        <div class="paper-ref">${escapeHtml(exp.ref)}</div>
        <div class="paper-rows" style="margin-top:8px">
          <div class="paper-row"><span>Tanggal</span><b>${escapeHtml(fmtDate(exp.expenseDate))}</b></div>
          <div class="paper-row"><span>Keperluan</span><b>${escapeHtml(exp.title)}</b></div>
          <div class="paper-row"><span>Kategori</span><b>${escapeHtml(exp.category)}</b></div>
          <div class="paper-row"><span>Petugas / PIC</span><b>${escapeHtml(exp.pic || "-")}</b></div>
          <div class="paper-row"><span>Metode Bayar</span><b>${escapeHtml(methodLabel)}</b></div>
          ${exp.receiptNumber ? `<div class="paper-row"><span>No. Nota Toko</span><b>${escapeHtml(exp.receiptNumber)}</b></div>` : ""}
          ${exp.notes ? `<div class="paper-row"><span>Catatan</span><b>${escapeHtml(exp.notes)}</b></div>` : ""}
        </div>
        <div class="paper-dashed"></div>
        <div style="font-size:12px;font-weight:600;margin-bottom:6px">RINCIAN BARANG:</div>
        <div class="paper-items">
          ${(exp.items || [])
            .map(
              (it) => `
            <div class="paper-item" style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span>${escapeHtml(it.name)} (${it.qty} ${escapeHtml(it.unit)} @ ${rp(it.unitPrice)})</span>
              <strong>${rp(it.subtotal || it.qty * it.unitPrice)}</strong>
            </div>`,
            )
            .join("")}
        </div>
        <div class="paper-dashed"></div>
        <div class="paper-total" style="display:flex;justify-content:space-between;font-size:15px;margin-top:8px">
          <span>TOTAL PENGELUARAN</span>
          <strong>${rp(exp.totalAmount)}</strong>
        </div>
        <div class="paper-foot" style="margin-top:12px;text-align:center;font-size:11px;color:var(--text-muted)">
          Dokumen internal kas kantor & operasional.
        </div>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn btn-whatsapp" id="detailSendWaBtn">${icon("whatsapp", 16)} Send Receipt WA</button>
        <button type="button" class="btn btn-soft" id="printExpBtn">${icon("printer", 16)} Cetak Nota</button>
        <button type="button" class="btn btn-primary" data-close>Tutup</button>
      </div>`,
    onMount(card, close) {
      card.querySelector("[data-close]")?.addEventListener("click", () => close());
      card.querySelector("#detailSendWaBtn")?.addEventListener("click", () => {
        close();
        showExpenseWaModal(exp);
      });
      card.querySelector("#printExpBtn")?.addEventListener("click", () => {
        const printContent = card.querySelector("#printableExpensePaper").innerHTML;
        const win = window.open("", "_blank", "width=600,height=700");
        win.document.write(`
          <html>
            <head>
              <title>Nota Belanja - ${escapeHtml(exp.ref)}</title>
              <style>
                body { font-family: sans-serif; padding: 24px; color: #1e293b; }
                .paper-brand { text-align: center; margin-bottom: 12px; }
                .paper-brand strong { font-size: 16px; display: block; }
                .paper-brand span { font-size: 12px; color: #64748b; }
                .paper-dashed { border-top: 1px dashed #cbd5e1; margin: 12px 0; }
                .paper-ref { text-align: center; font-weight: bold; font-size: 13px; margin-bottom: 8px; }
                .paper-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
                .paper-total { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; margin-top: 8px; }
                .paper-foot { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 16px; }
              </style>
            </head>
            <body>
              ${printContent}
              <script>window.print();</script>
            </body>
          </html>
        `);
        win.document.close();
      });
    },
  });
}

export async function showExpenseWaModal(exp) {
  let wa = null;
  try {
    wa = await api.get("/wa/status");
  } catch {
    // fallback
  }
  const connected = wa?.status === "connected";
  const methodLabel = PAYMENT_METHODS.find((m) => m.id === exp.paymentMethod)?.label || exp.paymentMethod;

  const itemLines = (exp.items || [])
    .map(
      (it, idx) =>
        `  ${idx + 1}. ${it.name} (${it.qty} ${it.unit} @ ${rp(it.unitPrice)}) = ${rp(it.subtotal || it.qty * it.unitPrice)}`,
    )
    .join("\n");

  const summaryText = [
    "*BUKTI PENGELUARAN BELANJA KANTOR*",
    "Kios Pembayaran Digital",
    "",
    `No. Ref   : ${exp.ref}`,
    `Tanggal   : ${fmtDate(exp.expenseDate)}`,
    `Keperluan : ${exp.title}`,
    `Kategori  : ${exp.category}`,
    `PIC       : ${exp.pic || "-"}`,
    `Metode    : ${methodLabel}`,
    exp.receiptNumber ? `No. Nota  : ${exp.receiptNumber}` : "",
    "",
    "*Rincian Barang:*",
    itemLines || "  -",
    "",
    `*TOTAL PENGELUARAN: ${rp(exp.totalAmount)}*`,
    exp.notes ? `\nCatatan: ${exp.notes}` : "",
    "",
    "Dokumen internal kas kantor & operasional.",
  ]
    .filter(Boolean)
    .join("\n");

  openModal({
    title: "Send Receipt WA — Belanja Kantor",
    subtitle: `${exp.ref} · ${rp(exp.totalAmount)}`,
    size: "sm",
    body: `
      <div class="wa-send-summary mb-12">
        <span class="wa-mini-icon">${icon("whatsapp", 18)}</span>
        <div>
          <strong>${connected ? "WhatsApp Bot Terhubung" : "WhatsApp Bot Belum Terhubung"}</strong>
          <span>${connected ? `Siap kirim (${escapeHtml(wa?.me?.name || wa?.me?.number || "Aktif")})` : "Gunakan Buka WhatsApp manual atau hubungkan bot"}</span>
        </div>
      </div>

      <form id="expWaForm">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label style="font-weight:600;font-size:13px">Nomor WhatsApp Tujuan</label>
          <button type="button" class="btn btn-ghost btn-sm" id="pickCustForExpBtn" style="padding:2px 8px;font-size:12px">
            ${icon("users", 13)} Pilih Kontak
          </button>
        </div>

        <label class="field" style="margin-bottom:12px">
          <input class="input" id="expWaPhone" placeholder="Contoh: 081234567890" inputmode="tel" required />
          <span class="field-hint">Kirim bukti pengeluaran ini ke owner, bendahara, atau PIC.</span>
        </label>

        <label class="field" style="margin-bottom:12px">
          <span>Pratinjau Pesan Nota Belanja</span>
          <textarea class="textarea" id="expWaMsg" rows="6" readonly style="font-family:monospace;font-size:12px;background:var(--surface-2)">${escapeHtml(summaryText)}</textarea>
        </label>

        <div class="modal-foot" style="padding:8px 0 0;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-soft" data-manual style="flex:1">
            ${icon("external", 16)} Buka WA (Manual)
          </button>
          <button type="submit" class="btn btn-whatsapp" id="expWaSendBtn" style="flex:1" ${connected ? "" : "disabled"}>
            ${icon("send", 16)} Send Receipt WA
          </button>
        </div>
      </form>`,
    async onMount(card, close) {
      const form = card.querySelector("#expWaForm");
      const phoneInput = card.querySelector("#expWaPhone");
      const sendBtn = card.querySelector("#expWaSendBtn");
      const pickBtn = card.querySelector("#pickCustForExpBtn");

      pickBtn?.addEventListener("click", async () => {
        try {
          const list = await api.get("/customers/all");
          if (!list || !list.length) {
            toast("Belum ada kontak tersimpan di menu Pelanggan.", "warning");
            return;
          }
          openModal({
            title: "Pilih Kontak Tujuan",
            subtitle: "Pilih kontak untuk kirim bukti belanja",
            size: "sm",
            body: `
              <div class="search-input mb-12">
                ${icon("search", 16)}
                <input type="search" id="expPickerSearch" placeholder="Cari nama atau no. HP…" autocomplete="off" />
              </div>
              <div id="expPickerList" style="max-height:260px;overflow-y:auto;display:grid;gap:6px"></div>`,
            onMount(pCard, pClose) {
              const pSearch = pCard.querySelector("#expPickerSearch");
              const pList = pCard.querySelector("#expPickerList");

              function render(items) {
                if (!items.length) {
                  pList.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Kontak tidak ditemukan</div>`;
                  return;
                }
                pList.innerHTML = items
                  .map(
                    (c) => `
                  <button type="button" class="btn btn-soft btn-block" data-cid="${c.id}" style="justify-content:space-between;padding:8px 12px;text-align:left">
                    <strong>${escapeHtml(c.name)}</strong>
                    <span class="badge badge-soft">${escapeHtml(c.phone)}</span>
                  </button>`,
                  )
                  .join("");

                pList.querySelectorAll("[data-cid]").forEach((btn) => {
                  btn.addEventListener("click", () => {
                    const found = items.find((x) => String(x.id) === btn.getAttribute("data-cid"));
                    if (found?.phone) {
                      phoneInput.value = found.phone;
                      toast(`Kontak ${found.name} dipilih.`, "success");
                      pClose();
                    }
                  });
                });
              }

              render(list);
              pSearch.addEventListener("input", (e) => {
                const q = e.target.value.toLowerCase().trim();
                render(list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)));
              });
            },
          });
        } catch (err) {
          toast(err.message, "error");
        }
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const raw = phoneInput.value.trim();
        let digits = raw.replace(/[^\d]/g, "");
        if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
        else if (digits.startsWith("8")) digits = `62${digits}`;
        if (!digits.startsWith("62")) digits = `62${digits}`;

        if (!digits || digits.length < 10) {
          toast("Masukkan nomor WhatsApp yang valid (minimal 10 digit).", "warning");
          phoneInput.focus();
          return;
        }

        setLoading(sendBtn, true, "Mengirim…");
        try {
          const res = await api.post(`/office/expenses/${exp.id}/send-wa`, { phone: digits });
          toast(res.message || "Bukti belanja kantor terkirim via WhatsApp.", "success");
          close("sent");
        } catch (error) {
          toast(error.message || "Gagal mengirim WhatsApp.", "error");
        } finally {
          setLoading(sendBtn, false);
        }
      });

      card.querySelector("[data-manual]").addEventListener("click", () => {
        const raw = phoneInput.value.trim();
        let digits = raw.replace(/[^\d]/g, "");
        if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
        else if (digits.startsWith("8")) digits = `62${digits}`;
        if (!digits.startsWith("62")) digits = `62${digits}`;

        if (!digits || digits.length < 9) {
          toast("Masukkan nomor WhatsApp yang valid (contoh: 081234567890).", "warning");
          phoneInput.focus();
          return;
        }
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(summaryText)}`, "_blank");
      });
    },
  });
}
