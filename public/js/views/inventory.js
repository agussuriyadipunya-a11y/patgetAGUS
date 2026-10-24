import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  confirmDialog,
  escapeHtml,
  openModal,
  rp,
  setLoading,
  toast,
} from "../ui.js";

const CATEGORIES = [
  "ATK",
  "Kios & Resi",
  "Konsumsi / Pantry",
  "Kebersihan",
  "Komputer & Elektronik",
  "Perlengkapan",
  "Lain-lain",
];

const COMMON_UNITS = ["Pcs", "Roll", "Rim", "Box", "Pack", "Botol", "Galon", "Unit", "Set", "Lembar"];

export async function renderInventory(viewEl) {
  let query = "";
  let selectedCategory = "all";
  let onlyLowStock = false;

  viewEl.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Gudang & Barang Kantor</h2>
        <p class="view-desc">Katalog persediaan barang kantor, kertas struk thermal, ATK, dan kebutuhan operasional.</p>
      </div>
      <div class="view-actions">
        <button class="btn btn-primary" id="addItemBtn">
          ${icon("plus", 16)} Tambah Barang
        </button>
      </div>
    </div>

    <div class="stat-grid mb-16" id="invStats">
      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-label">Total Jenis Barang</span>
          <span class="stat-icon">${icon("box", 18)}</span>
        </div>
        <div class="stat-value" id="statTotalItems">-</div>
        <div class="stat-foot">Katalog barang kantor aktif</div>
      </div>

      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-label">Total Kuantitas Stok</span>
          <span class="stat-icon">${icon("packageCheck", 18)}</span>
        </div>
        <div class="stat-value" id="statTotalStock">-</div>
        <div class="stat-foot">Gabungan seluruh unit fisik</div>
      </div>

      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-label">Perlu Restock</span>
          <span class="stat-icon">${icon("alert", 18)}</span>
        </div>
        <div class="stat-value text-warning" id="statLowStock">-</div>
        <div class="stat-foot">Stok di bawah batas minimum</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="filter-bar" style="gap:12px;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:240px">
          ${icon("search", 16)}
          <input type="search" id="invSearch" placeholder="Cari kode barang, nama barang, atau catatan…" autocomplete="off" />
        </div>

        <select class="select" id="invCategorySelect" style="width:auto;min-width:160px">
          <option value="all">Semua Kategori</option>
          ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>

        <label class="checkbox-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">
          <input type="checkbox" id="lowStockCheckbox" />
          <span>Hanya stok menipis</span>
        </label>
      </div>
    </div>

    <div id="invTableWrap">
      <div class="loading-block">
        <span class="spinner"></span>
        <span>Memuat data gudang & barang…</span>
      </div>
    </div>`;

  const searchInput = viewEl.querySelector("#invSearch");
  const categorySelect = viewEl.querySelector("#invCategorySelect");
  const lowStockCheckbox = viewEl.querySelector("#lowStockCheckbox");
  const tableWrap = viewEl.querySelector("#invTableWrap");
  const addBtn = viewEl.querySelector("#addItemBtn");

  const statTotalItems = viewEl.querySelector("#statTotalItems");
  const statTotalStock = viewEl.querySelector("#statTotalStock");
  const statLowStock = viewEl.querySelector("#statLowStock");

  async function loadData() {
    tableWrap.innerHTML = `
      <div class="loading-block">
        <span class="spinner"></span>
        <span>Memuat data gudang…</span>
      </div>`;

    try {
      const q = encodeURIComponent(query);
      const cat = encodeURIComponent(selectedCategory);
      const low = onlyLowStock ? "1" : "0";
      const items = await api.get(`/office/items?q=${q}&category=${cat}&lowStock=${low}`);
      updateStats(items);
      renderTable(items);
    } catch (error) {
      tableWrap.innerHTML = `
        <div class="empty-state">
          ${icon("alert", 32)}
          <h3>Gagal memuat data gudang</h3>
          <p>${escapeHtml(error.message)}</p>
          <button class="btn btn-soft mt-12" id="retryInvBtn">${icon("refresh", 14)} Coba Lagi</button>
        </div>`;
      viewEl.querySelector("#retryInvBtn")?.addEventListener("click", loadData);
    }
  }

  function updateStats(items) {
    const totalItems = items.length;
    let totalStock = 0;
    let lowStock = 0;

    for (const it of items) {
      totalStock += it.stock;
      if (it.stock <= it.min_stock) lowStock += 1;
    }

    statTotalItems.textContent = totalItems.toLocaleString("id-ID");
    statTotalStock.textContent = totalStock.toLocaleString("id-ID");
    statLowStock.textContent = lowStock.toLocaleString("id-ID");
  }

  function renderTable(items) {
    if (!items.length) {
      tableWrap.innerHTML = `
        <div class="empty-state card">
          ${icon("box", 36)}
          <h3>Tidak ada barang di gudang</h3>
          <p>${query || selectedCategory !== "all" || onlyLowStock ? "Tidak ada barang yang cocok dengan filter yang dipilih." : "Belum ada barang kantor yang didaftarkan."}</p>
          ${
            query || selectedCategory !== "all" || onlyLowStock
              ? `<button class="btn btn-soft mt-12" id="resetInvFilter">Reset Filter</button>`
              : `<button class="btn btn-primary mt-12" id="emptyAddInvBtn">${icon("plus", 14)} Tambah Barang Pertama</button>`
          }
        </div>`;

      viewEl.querySelector("#resetInvFilter")?.addEventListener("click", () => {
        searchInput.value = "";
        categorySelect.value = "all";
        lowStockCheckbox.checked = false;
        query = "";
        selectedCategory = "all";
        onlyLowStock = false;
        loadData();
      });
      viewEl.querySelector("#emptyAddInvBtn")?.addEventListener("click", () => openItemModal(null, loadData));
      return;
    }

    const rows = items
      .map((it) => {
        const isOutOfStock = it.stock <= 0;
        const isLowStock = !isOutOfStock && it.stock <= it.min_stock;
        let stockBadge = `<span class="badge badge-success">Aman (${it.stock} ${escapeHtml(it.unit)})</span>`;
        if (isOutOfStock) {
          stockBadge = `<span class="badge badge-danger">Habis (0 ${escapeHtml(it.unit)})</span>`;
        } else if (isLowStock) {
          stockBadge = `<span class="badge badge-warning">Menipis (${it.stock} ${escapeHtml(it.unit)})</span>`;
        }

        return `
        <tr>
          <td>
            <span class="badge badge-soft"><strong>${escapeHtml(it.code)}</strong></span>
          </td>
          <td>
            <strong>${escapeHtml(it.name)}</strong>
            ${it.notes ? `<div class="cell-sub"><small>${escapeHtml(it.notes)}</small></div>` : ""}
          </td>
          <td>
            <span class="badge badge-soft">${escapeHtml(it.category)}</span>
          </td>
          <td>
            <strong>${rp(it.price)}</strong>
            <div class="cell-sub"><small>/ ${escapeHtml(it.unit)}</small></div>
          </td>
          <td>
            ${stockBadge}
            <div class="cell-sub"><small>Min: ${it.min_stock} ${escapeHtml(it.unit)}</small></div>
          </td>
          <td style="text-align:right">
            <div class="row-actions">
              <button class="btn btn-icon btn-ghost" data-quick-add="${it.id}" title="Tambah Stok (+1)">
                ${icon("plus", 15)}
              </button>
              <button class="btn btn-icon btn-ghost" data-edit="${it.id}" title="Edit Barang">
                ${icon("edit", 15)}
              </button>
              <button class="btn btn-icon btn-ghost text-danger" data-del="${it.id}" data-name="${escapeHtml(it.name)}" title="Hapus">
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
              <th style="width:120px">Kode</th>
              <th>Nama Barang</th>
              <th style="width:150px">Kategori</th>
              <th style="width:140px">Harga Acuan</th>
              <th style="width:160px">Status Stok</th>
              <th style="text-align:right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="card-footer-info"><small>Menampilkan ${items.length} barang di gudang kantor.</small></div>
      </div>`;

    tableWrap.querySelectorAll("[data-quick-add]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-quick-add");
        const it = items.find((x) => String(x.id) === String(id));
        if (!it) return;
        try {
          await api.put(`/office/items/${id}`, { stock: it.stock + 1 });
          toast(`Stok "${it.name}" bertambah menjadi ${it.stock + 1}.`, "success");
          loadData();
        } catch (error) {
          toast(error.message, "error");
        }
      });
    });

    tableWrap.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const it = items.find((x) => String(x.id) === String(id));
        if (it) openItemModal(it, loadData);
      });
    });

    tableWrap.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        const name = btn.getAttribute("data-name");
        const ok = await confirmDialog({
          title: "Hapus Barang?",
          message: `Apakah Anda yakin ingin menghapus "${name}" dari gudang?`,
          confirmText: "Ya, Hapus",
          confirmVariant: "danger",
        });
        if (!ok) return;

        try {
          await api.delete(`/office/items/${id}`);
          toast("Barang berhasil dihapus dari gudang.", "success");
          loadData();
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

  lowStockCheckbox.addEventListener("change", (e) => {
    onlyLowStock = e.target.checked;
    loadData();
  });

  addBtn.addEventListener("click", () => openItemModal(null, loadData));

  loadData();

  return () => {
    clearTimeout(searchTimer);
  };
}

export function openItemModal(item = null, onSaved = null) {
  const isEdit = Boolean(item?.id);
  const title = isEdit ? "Edit Barang Kantor" : "Tambah Barang ke Gudang";
  const subtitle = isEdit ? `${item.code} · ${item.name}` : "Tambahkan katalog barang operasional & harga acuan";

  openModal({
    title,
    subtitle,
    size: "md",
    body: `
      <form id="itemForm" class="customer-form">
        <div class="form-grid">
          <label class="field col-6">
            <span>Kode Barang</span>
            <input class="input" id="itemCode" placeholder="Otomatis (misal: BRG-001)" value="${escapeHtml(item?.code || "")}" />
            <span class="field-hint">Biarkan kosong untuk generate otomatis.</span>
          </label>

          <label class="field col-6">
            <span>Kategori</span>
            <select class="select" id="itemCat">
              ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${item?.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
            </select>
          </label>

          <label class="field col-12">
            <span>Nama Barang <b class="text-danger">*</b></span>
            <input class="input" id="itemName" placeholder="Contoh: Kertas Struk Thermal 80mm" value="${escapeHtml(item?.name || "")}" required autofocus />
          </label>

          <label class="field col-6">
            <span>Satuan</span>
            <input class="input" id="itemUnit" list="unitList" placeholder="Pcs / Roll / Rim / Box" value="${escapeHtml(item?.unit || "Pcs")}" required />
            <datalist id="unitList">
              ${COMMON_UNITS.map((u) => `<option value="${escapeHtml(u)}"></option>`).join("")}
            </datalist>
          </label>

          <label class="field col-6">
            <span>Harga Acuan Beli (Rp)</span>
            <input class="input" type="number" id="itemPrice" min="0" step="500" placeholder="0" value="${item?.price ?? 0}" />
            <span class="field-hint">Estimasi harga satuan saat belanja.</span>
          </label>

          <label class="field col-6">
            <span>Stok Saat Ini</span>
            <input class="input" type="number" id="itemStock" min="0" step="1" placeholder="0" value="${item?.stock ?? 0}" required />
            <span class="field-hint">Jumlah unit fisik di gudang.</span>
          </label>

          <label class="field col-6">
            <span>Batas Minimum Stok</span>
            <input class="input" type="number" id="itemMinStock" min="0" step="1" placeholder="0" value="${item?.min_stock ?? 2}" />
            <span class="field-hint">Peringatan saat stok mencapai batas ini.</span>
          </label>

          <label class="field col-12">
            <span>Catatan / Spesifikasi</span>
            <textarea class="textarea" id="itemNotes" rows="2" placeholder="Keterangan merk, ukuran, atau kegunaan barang…">${escapeHtml(item?.notes || "")}</textarea>
          </label>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
          <button type="submit" class="btn btn-primary" id="saveItemBtn">
            ${icon("save", 16)} ${isEdit ? "Simpan Perubahan" : "Simpan Barang"}
          </button>
        </div>
      </form>`,
    onMount(card, close) {
      const form = card.querySelector("#itemForm");
      const saveBtn = card.querySelector("#saveItemBtn");
      card.querySelector("[data-cancel]")?.addEventListener("click", () => close());

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = card.querySelector("#itemName").value.trim();
        const code = card.querySelector("#itemCode").value.trim();
        const category = card.querySelector("#itemCat").value;
        const unit = card.querySelector("#itemUnit").value.trim() || "Pcs";
        const price = Number(card.querySelector("#itemPrice").value) || 0;
        const stock = Number(card.querySelector("#itemStock").value) || 0;
        const minStock = Number(card.querySelector("#itemMinStock").value) || 0;
        const notes = card.querySelector("#itemNotes").value.trim();

        if (!name) {
          toast("Nama barang wajib diisi.", "warning");
          card.querySelector("#itemName").focus();
          return;
        }

        setLoading(saveBtn, true, "Menyimpan…");
        try {
          const payload = {
            name,
            code,
            category,
            unit,
            price,
            stock,
            minStock,
            notes,
          };

          let res;
          if (isEdit) {
            res = await api.put(`/office/items/${item.id}`, payload);
          } else {
            res = await api.post("/office/items", payload);
          }

          toast(res.message || "Barang berhasil disimpan.", "success");
          close("saved");
          onSaved?.(res.item);
        } catch (error) {
          toast(error.message || "Gagal menyimpan barang.", "error");
        } finally {
          setLoading(saveBtn, false);
        }
      });
    },
  });
}
