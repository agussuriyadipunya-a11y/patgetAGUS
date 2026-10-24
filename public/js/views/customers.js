import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  confirmDialog,
  escapeHtml,
  openModal,
  setLoading,
  toast,
} from "../ui.js";

function formatCustomerPhone(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "-";
  if (digits.startsWith("62")) {
    return `+62 ${digits.slice(2).replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3")}`;
  }
  return digits;
}

export async function renderCustomers(viewEl) {
  let query = "";
  let currentPage = 1;
  let loading = false;

  viewEl.innerHTML = `
    <div class="view-header">
      <div>
        <h2 class="view-title">Data Pelanggan</h2>
        <p class="view-desc">Kelola direktori kontak & ID meter/tagihan pelanggan tetap kios.</p>
      </div>
      <div class="view-actions">
        <button class="btn btn-primary" id="addCustomerBtn">
          ${icon("userPlus", 16)} Tambah Pelanggan
        </button>
      </div>
    </div>

    <div class="card mb-16">
      <div class="filter-bar">
        <div class="search-input">
          ${icon("search", 16)}
          <input type="search" id="customerSearch" placeholder="Cari nama, nomor HP / WA, alamat, atau ID meter…" autocomplete="off" />
        </div>
      </div>
    </div>

    <div id="customerTableWrap">
      <div class="loading-block">
        <span class="spinner"></span>
        <span>Memuat data pelanggan…</span>
      </div>
    </div>`;

  const searchInput = viewEl.querySelector("#customerSearch");
  const tableWrap = viewEl.querySelector("#customerTableWrap");
  const addBtn = viewEl.querySelector("#addCustomerBtn");

  async function loadData() {
    loading = true;
    tableWrap.innerHTML = `
      <div class="loading-block">
        <span class="spinner"></span>
        <span>Memuat data pelanggan…</span>
      </div>`;

    try {
      const q = encodeURIComponent(query);
      const res = await api.get(`/customers?q=${q}&page=${currentPage}&limit=25`);
      renderTable(res);
    } catch (error) {
      tableWrap.innerHTML = `
        <div class="empty-state">
          ${icon("alert", 32)}
          <h3>Gagal memuat data</h3>
          <p>${escapeHtml(error.message)}</p>
          <button class="btn btn-soft mt-12" id="retryCustomerBtn">${icon("refresh", 14)} Coba Lagi</button>
        </div>`;
      viewEl.querySelector("#retryCustomerBtn")?.addEventListener("click", loadData);
    } finally {
      loading = false;
    }
  }

  function renderTable(data) {
    const { items = [], total = 0, page = 1, pages = 1 } = data;

    if (!items.length) {
      tableWrap.innerHTML = `
        <div class="empty-state card">
          ${icon("users", 36)}
          <h3>Tidak ada data pelanggan</h3>
          <p>${query ? "Tidak ada pelanggan yang cocok dengan pencarian Anda." : "Belum ada data pelanggan yang tersimpan."}</p>
          ${query ? `<button class="btn btn-soft mt-12" id="resetSearchBtn">Reset Pencarian</button>` : `<button class="btn btn-primary mt-12" id="emptyAddBtn">${icon("plus", 14)} Tambah Pelanggan Pertama</button>`}
        </div>`;

      viewEl.querySelector("#resetSearchBtn")?.addEventListener("click", () => {
        searchInput.value = "";
        query = "";
        currentPage = 1;
        loadData();
      });
      viewEl.querySelector("#emptyAddBtn")?.addEventListener("click", () => openCustomerModal(null, loadData));
      return;
    }

    const rows = items
      .map(
        (c) => `
        <tr>
          <td>
            <div class="customer-name-cell">
              <strong>${escapeHtml(c.name)}</strong>
              ${c.customer_no ? `<span class="badge badge-soft" title="ID / No. Pelanggan">${escapeHtml(c.customer_no)}</span>` : ""}
            </div>
            ${c.address ? `<div class="cell-sub"><small>${escapeHtml(c.address)}</small></div>` : ""}
          </td>
          <td>
            <a href="https://wa.me/${c.phone}" target="_blank" class="phone-link" title="Chat WhatsApp">
              ${icon("whatsapp", 14)} ${escapeHtml(formatCustomerPhone(c.phone))}
            </a>
            ${c.email ? `<div class="cell-sub"><small>${escapeHtml(c.email)}</small></div>` : ""}
          </td>
          <td>
            <span>${escapeHtml(c.notes || "-")}</span>
          </td>
          <td style="text-align:right">
            <div class="row-actions">
              <a href="https://wa.me/${c.phone}" target="_blank" class="btn btn-icon btn-ghost" title="Chat WhatsApp">
                ${icon("whatsapp", 15)}
              </a>
              <button class="btn btn-icon btn-ghost" data-edit="${c.id}" title="Edit Data">
                ${icon("edit", 15)}
              </button>
              <button class="btn btn-icon btn-ghost text-danger" data-del="${c.id}" data-name="${escapeHtml(c.name)}" title="Hapus">
                ${icon("trash", 15)}
              </button>
            </div>
          </td>
        </tr>`,
      )
      .join("");

    tableWrap.innerHTML = `
      <div class="card overflow-x" style="border-radius:var(--radius)">
        <table class="modern-data-table">
          <thead>
            <tr>
              <th>Pelanggan</th>
              <th>Kontak WhatsApp</th>
              <th>Catatan</th>
              <th style="text-align:right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        ${
          pages > 1
            ? `
          <div class="pagination">
            <span>Menampilkan halaman ${page} dari ${pages} (${total} pelanggan)</span>
            <div class="pagination-buttons">
              <button class="btn btn-soft btn-sm" id="prevPage" ${page <= 1 ? "disabled" : ""}>${icon("chevronLeft", 14)} Prev</button>
              <button class="btn btn-soft btn-sm" id="nextPage" ${page >= pages ? "disabled" : ""}>Next ${icon("chevronRight", 14)}</button>
            </div>
          </div>`
            : `<div class="card-footer-info"><small>Total ${total} pelanggan tersimpan.</small></div>`
        }
      </div>`;

    tableWrap.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const c = items.find((x) => String(x.id) === String(id));
        if (c) openCustomerModal(c, loadData);
      });
    });

    tableWrap.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        const name = btn.getAttribute("data-name");
        const ok = await confirmDialog({
          title: "Hapus Pelanggan?",
          message: `Apakah Anda yakin ingin menghapus pelanggan "${name}"? Tindakan ini tidak dapat dibatalkan.`,
          confirmText: "Ya, Hapus",
          confirmVariant: "danger",
        });
        if (!ok) return;

        try {
          await api.delete(`/customers/${id}`);
          toast("Pelanggan berhasil dihapus.", "success");
          loadData();
        } catch (error) {
          toast(error.message, "error");
        }
      });
    });

    viewEl.querySelector("#prevPage")?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        loadData();
      }
    });

    viewEl.querySelector("#nextPage")?.addEventListener("click", () => {
      if (currentPage < pages) {
        currentPage += 1;
        loadData();
      }
    });
  }

  let searchTimeout = null;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      query = e.target.value.trim();
      currentPage = 1;
      loadData();
    }, 300);
  });

  addBtn.addEventListener("click", () => openCustomerModal(null, loadData));

  loadData();

  return () => {
    clearTimeout(searchTimeout);
  };
}

export function openCustomerModal(customer = null, onSaved = null) {
  const isEdit = Boolean(customer?.id);
  const title = isEdit ? "Edit Data Pelanggan" : "Tambah Pelanggan Baru";
  const subtitle = isEdit ? customer.name : "Simpan kontak pelanggan untuk transaksi dan kirim resi";

  const rawPhone = customer?.phone ? String(customer.phone).replace(/^62/, "0") : "";

  openModal({
    title,
    subtitle,
    size: "md",
    body: `
      <form id="customerForm" class="customer-form">
        <div class="form-grid">
          <label class="field col-12">
            <span>Nama Lengkap <b class="text-danger">*</b></span>
            <input class="input" id="custName" placeholder="Contoh: Budi Santoso" value="${escapeHtml(customer?.name || "")}" required autofocus />
          </label>

          <label class="field col-6">
            <span>Nomor WhatsApp / HP <b class="text-danger">*</b></span>
            <div class="input-prefix">
              <span class="prefix">+62</span>
              <input class="input" id="custPhone" placeholder="81234567890" inputmode="tel" value="${escapeHtml(rawPhone.replace(/^0/, ""))}" required />
            </div>
            <span class="field-hint">Digunakan untuk kirim resi otomatis via WA.</span>
          </label>

          <label class="field col-6">
            <span>ID Pelanggan / Nomor Meter</span>
            <input class="input" id="custNo" placeholder="Contoh: 51234567890" value="${escapeHtml(customer?.customer_no || "")}" />
            <span class="field-hint">No. Meter PLN / ID Pelanggan default</span>
          </label>

          <label class="field col-12">
            <span>Email</span>
            <input class="input" type="email" id="custEmail" placeholder="pelanggan@email.com" value="${escapeHtml(customer?.email || "")}" />
          </label>

          <label class="field col-12">
            <span>Alamat Lengkap</span>
            <textarea class="textarea" id="custAddress" rows="2" placeholder="Alamat rumah / kantor pelanggan…">${escapeHtml(customer?.address || "")}</textarea>
          </label>

          <label class="field col-12">
            <span>Catatan</span>
            <textarea class="textarea" id="custNotes" rows="2" placeholder="Catatan tambahan (misal: sering beli token PLN 50rb)…">${escapeHtml(customer?.notes || "")}</textarea>
          </label>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
          <button type="submit" class="btn btn-primary" id="saveCustBtn">
            ${icon("save", 16)} ${isEdit ? "Simpan Perubahan" : "Simpan Pelanggan"}
          </button>
        </div>
      </form>`,
    onMount(card, close) {
      const form = card.querySelector("#customerForm");
      const saveBtn = card.querySelector("#saveCustBtn");
      card.querySelector("[data-cancel]")?.addEventListener("click", () => close());

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = card.querySelector("#custName").value.trim();
        let phone = card.querySelector("#custPhone").value.trim();
        const customerNo = card.querySelector("#custNo").value.trim();
        const email = card.querySelector("#custEmail").value.trim();
        const address = card.querySelector("#custAddress").value.trim();
        const notes = card.querySelector("#custNotes").value.trim();

        if (!name) {
          toast("Nama pelanggan wajib diisi.", "warning");
          card.querySelector("#custName").focus();
          return;
        }

        if (!phone) {
          toast("Nomor WhatsApp/HP wajib diisi.", "warning");
          card.querySelector("#custPhone").focus();
          return;
        }

        setLoading(saveBtn, true, "Menyimpan…");
        try {
          const payload = {
            name,
            phone,
            customerNo,
            email,
            address,
            notes,
          };

          let res;
          if (isEdit) {
            res = await api.put(`/customers/${customer.id}`, payload);
          } else {
            res = await api.post("/customers", payload);
          }

          toast(res.message || "Data pelanggan berhasil disimpan.", "success");
          close("saved");
          onSaved?.(res.customer);
        } catch (error) {
          toast(error.message || "Gagal menyimpan data pelanggan.", "error");
        } finally {
          setLoading(saveBtn, false);
        }
      });
    },
  });
}
