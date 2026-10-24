import { api } from "../api.js";
import { icon, categoryIcon } from "../icons.js";
import { categoryColor, findCategory, loadCatalog, state } from "../store.js";
import {
  escapeHtml,
  fmtDateTime,
  num,
  openModal,
  rp,
  setLoading,
  toast,
} from "../ui.js";
import { showReceipt } from "../receipt-modal.js";

function providerInitials(name) {
  return String(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function typeContentHtml(category, type, local) {
  const productSection = type.products.length > 1
    ? `
      <div class="form-section">
        <div class="section-label">${type.kind === "prepaid" ? "Pilih nominal" : "Pilih penyedia layanan"}</div>
        ${type.kind === "prepaid" ? `
          <div class="product-grid">
            ${type.products.map((product) => `
              <button type="button" class="product-btn ${local.productId === product.id ? "selected" : ""}" data-product="${escapeHtml(product.id)}">
                <span class="tick">${icon("checkCircle", 15)}</span>
                <strong>${escapeHtml(product.name)}</strong>
                <small>${escapeHtml(product.desc || "")}</small>
                <span class="price">${rp(product.price + product.adminFee)}</span>
              </button>`).join("")}
          </div>` : `
          <div class="provider-grid">
            ${type.products.map((product) => `
              <button type="button" class="provider-btn ${local.productId === product.id ? "selected" : ""}" data-product="${escapeHtml(product.id)}">
                <span class="provider-logo">${escapeHtml(providerInitials(product.name))}</span>
                <span class="provider-text">
                  <strong>${escapeHtml(product.name)}</strong>
                  <small>${escapeHtml(product.desc || `Admin ${rp(product.adminFee)}`)}</small>
                </span>
              </button>`).join("")}
          </div>`}
      </div>`
    : `
      <div class="alert alert-info" style="margin-bottom:16px">
        ${icon("info", 16)}
        <span><strong>${escapeHtml(type.products[0].name)}</strong> · biaya admin ${rp(type.products[0].adminFee)}</span>
      </div>`;

  const field = type.field;
  return `
    ${productSection}

    <div class="form-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="section-label" style="margin-bottom:0">Data pelanggan</div>
        <button type="button" class="btn btn-ghost btn-sm" id="pickCustomerBtn" style="font-size:12px;padding:2px 8px">
          ${icon("users", 14)} Pilih Pelanggan
        </button>
      </div>
      <label class="field" style="margin-bottom:8px">
        <span>${escapeHtml(field.label)}</span>
        <div class="input-icon">
          ${icon(type.field.inputMode === "tel" ? "smartphone" : "user", 17)}
          <input class="input" id="customerInput" placeholder="${escapeHtml(field.placeholder)}" inputmode="${field.inputMode || "text"}" maxlength="${field.maxlength || 24}" value="${escapeHtml(local.customerId)}" autocomplete="off" />
        </div>
        <span class="field-hint">${escapeHtml(field.hint || "")}</span>
      </label>

      ${type.field.inputMode !== "tel" ? `
        <label class="field" style="margin-bottom:8px">
          <span>Nomor WhatsApp Pelanggan (opsional untuk kirim struk/resi otomatis)</span>
          <div class="input-icon">
            ${icon("whatsapp", 17)}
            <input class="input" id="customerPhoneInput" placeholder="Contoh: 081234567890" inputmode="tel" maxlength="16" value="${escapeHtml(local.customerPhone || "")}" autocomplete="off" />
          </div>
          <span class="field-hint">Resi akan otomatis dikirimkan ke nomor ini setelah transaksi berhasil.</span>
        </label>
      ` : ""}

      ${type.kind === "postpaid" ? `
        <button type="button" class="btn btn-soft btn-block" id="checkBill" ${!local.productId || local.customerId.length < 4 ? "disabled" : ""}>
          ${icon("search", 16)} Cek Tagihan
        </button>` : ""}
      <div id="billResult">${local.inquiry ? billHtml(local.inquiry) : ""}</div>
    </div>

    <div class="form-section">
      <div class="section-label">Metode pembayaran</div>
      <div class="method-grid">
        ${state.paymentMethods.map((method) => `
          <button type="button" class="method-btn ${local.method === method.id ? "selected" : ""}" data-method="${escapeHtml(method.id)}">
            ${icon(method.id === "qris" ? "qris" : method.id === "transfer" ? "bank" : "cash", 19)}
            <span>${escapeHtml(method.label)}</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function billHtml(inquiry) {
  return `
    <div class="bill-card">
      <div class="bill-head">
        <div class="bill-customer">
          <strong>${escapeHtml(inquiry.customerName)}</strong>
          <span>${escapeHtml(inquiry.customerId)}</span>
        </div>
        <span class="badge badge-success">${icon("checkCircle", 12)} Tagihan ditemukan</span>
      </div>
      <div class="bill-rows">
        ${(inquiry.items || []).map((item) => `<div class="bill-row"><span>${escapeHtml(item.label)}</span><span>${rp(item.amount)}</span></div>`).join("")}
        <div class="bill-row"><span>Biaya admin</span><span>${rp(inquiry.adminFee)}</span></div>
      </div>
      <div class="bill-total"><span>Total tagihan</span><strong>${rp(inquiry.total)}</strong></div>
      ${(inquiry.meta || []).length ? `
        <div class="bill-meta">
          ${inquiry.meta.map((meta) => `<div class="bill-row"><span>${escapeHtml(meta.label)}</span><span>${escapeHtml(meta.value)}</span></div>`).join("")}
        </div>` : ""}
    </div>`;
}

function summaryHtml(local) {
  const type = local.type;
  const product = type.products.find((p) => p.id === local.productId);
  const inquiry = local.inquiry;
  const method = state.paymentMethods.find((m) => m.id === local.method);

  if (!product) {
    return `
      <div class="summary-rows">
        <div class="summary-row"><span>Layanan</span><strong>${escapeHtml(local.category.name)} · ${escapeHtml(type.label)}</strong></div>
        <div class="summary-row"><span>Pelanggan</span><strong>${escapeHtml(local.customerId || "Belum diisi")}</strong></div>
        <div class="summary-row"><span>Metode</span><strong>${escapeHtml(method?.label || "Tunai")}</strong></div>
      </div>
      <div class="summary-empty">${type.kind === "prepaid" ? "Pilih nominal pulsa/token terlebih dahulu." : "Pilih penyedia layanan terlebih dahulu."}</div>`;
  }

  const amount = type.kind === "postpaid" ? (inquiry?.amount ?? 0) : product.price;
  const adminFee = type.kind === "postpaid" ? (inquiry?.adminFee ?? product.adminFee) : product.adminFee;
  const total = type.kind === "postpaid" ? (inquiry?.total ?? 0) : product.price + product.adminFee;

  return `
    <div class="summary-rows">
      <div class="summary-row"><span>Layanan</span><strong>${escapeHtml(local.category.name)} · ${escapeHtml(type.label)}</strong></div>
      <div class="summary-row"><span>Produk</span><strong>${escapeHtml(product.name)}</strong></div>
      <div class="summary-row"><span>Nomor</span><strong>${escapeHtml(local.customerId || "Belum diisi")}</strong></div>
      ${inquiry ? `<div class="summary-row"><span>Nama</span><strong>${escapeHtml(inquiry.customerName)}</strong></div>` : ""}
      <div class="summary-row"><span>Nominal</span><strong>${type.kind === "postpaid" && !inquiry ? "Cek tagihan dulu" : rp(amount)}</strong></div>
      <div class="summary-row"><span>Biaya admin</span><strong>${rp(adminFee)}</strong></div>
      <div class="summary-row"><span>Metode</span><strong>${escapeHtml(method?.label || "Tunai")}</strong></div>
    </div>
    <div class="summary-total"><span>Total bayar</span><strong>${type.kind === "postpaid" && !inquiry ? "—" : rp(total)}</strong></div>`;
}

export async function renderMenu(container, categoryId = "pln") {
  if (!state.categories.length) {
    container.innerHTML = `<div class="loading-block"><span class="spinner"></span><span>Memuat katalog layanan…</span></div>`;
    try {
      await loadCatalog();
    } catch (error) {
      container.innerHTML = `<div class="card card-pad"><div class="empty-state"><h3>Gagal memuat katalog</h3><p>${escapeHtml(error.message)}</p></div></div>`;
      return;
    }
  }

  const category = findCategory(categoryId) || state.categories[0];
  if (!category) {
    container.innerHTML = `<div class="card card-pad"><div class="empty-state"><h3>Katalog kosong</h3></div></div>`;
    return;
  }

  const local = {
    category,
    type: category.types[0],
    productId: null,
    customerId: "",
    customerPhone: "",
    method: "tunai",
    inquiry: null,
    checking: false,
    paying: false,
  };
  local.productId = local.type.products.length === 1 ? local.type.products[0].id : null;

  const categoryCards = state.categories.map((cat) => `
    <a class="category-card ${cat.id === category.id ? "active" : ""}" href="#/menu/${cat.id}" style="--cat-color:${categoryColor(cat.id)}">
      <span class="cat-icon">${icon(categoryIcon[cat.id] || "grid", 19)}</span>
      <span class="cat-text"><strong>${escapeHtml(cat.name)}</strong><small>${escapeHtml(cat.tagline)}</small></span>
      <span class="cat-arrow">${icon("chevronRight", 16)}</span>
    </a>`).join("");

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">Menu pembayaran</span>
          <h2>Pilih layanan</h2>
          <p>Proses pembayaran dan cetak resi dalam satu alur.</p>
        </div>
        <span class="sim-chip"><i></i> MODE SIMULASI</span>
      </div>

      <div class="category-strip">${categoryCards}</div>

      <div class="menu-layout">
        <section class="card">
          <div class="menu-head" style="padding:19px 22px;border-bottom:1px solid var(--border);--cat-color:${categoryColor(category.id)}">
            <div>
              <h3><span class="menu-badge">${icon(categoryIcon[category.id] || "grid", 17)}</span> ${escapeHtml(category.name)}</h3>
              <p>${escapeHtml(category.fullName)} · ${escapeHtml(category.tagline)}</p>
            </div>
            ${category.types.length > 1 ? `
              <div class="segmented" id="typeTabs">
                ${category.types.map((type) => `
                  <button type="button" class="${type.id === local.type.id ? "active" : ""}" data-type="${escapeHtml(type.id)}">${escapeHtml(type.name)}</button>`).join("")}
              </div>` : `<span class="badge badge-info">${escapeHtml(local.type.name)}</span>`}
          </div>
          <div class="card-body">
            <div class="menu-head" style="margin-bottom:16px">
              <div>
                <h3 style="font-size:.9rem">${escapeHtml(local.type.label)}</h3>
                <p>${escapeHtml(local.type.description || "")}</p>
              </div>
              ${local.type.kind === "prepaid" ? `<span class="badge badge-success">Prabayar</span>` : `<span class="badge badge-warning">Pascabayar</span>`}
            </div>
            <div id="typeContent">${typeContentHtml(category, local.type, local)}</div>
          </div>
        </section>

        <aside class="summary-card">
          <div class="summary-head">
            <h3>Ringkasan transaksi</h3>
            <span>${escapeHtml(category.name)}</span>
          </div>
          <div id="summaryBody">${summaryHtml(local)}</div>
          <button class="btn btn-primary btn-lg" id="payBtn" disabled>${icon("wallet", 18)} Bayar Sekarang</button>
          <p class="summary-note">${icon("shieldCheck", 13)} Pembayaran diproses secara lokal. Pastikan nominal dan nomor tujuan sudah benar.</p>
        </aside>
      </div>
    </div>`;

  const typeContent = container.querySelector("#typeContent");
  const summaryBody = container.querySelector("#summaryBody");
  const payBtn = container.querySelector("#payBtn");

  function canPay() {
    if (!local.productId || local.customerId.length < 4) return false;
    if (local.type.kind === "postpaid" && !local.inquiry) return false;
    return true;
  }

  function update() {
    const checkBtn = container.querySelector("#checkBill");
    if (checkBtn) {
      checkBtn.disabled = local.checking || !local.productId || local.customerId.length < 4;
    }
    container.querySelectorAll("[data-product]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.product === local.productId);
    });
    container.querySelectorAll("[data-method]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.method === local.method);
    });
    summaryBody.innerHTML = summaryHtml(local);
    payBtn.disabled = !canPay() || local.paying;
  }

  function rerenderType() {
    typeContent.innerHTML = typeContentHtml(category, local.type, local);
    update();
  }

  function resetForm() {
    local.customerId = "";
    local.customerPhone = "";
    local.inquiry = null;
    local.method = "tunai";
    local.productId = local.type.products.length === 1 ? local.type.products[0].id : null;
    rerenderType();
  }

  container.addEventListener("click", async (event) => {
    if (event.target.closest("#pickCustomerBtn")) {
      try {
        const list = await api.get("/customers/all");
        if (!list || !list.length) {
          toast("Belum ada data pelanggan tersimpan. Tambah pelanggan di menu Pelanggan.", "warning");
          return;
        }

        openModal({
          title: "Pilih Pelanggan",
          subtitle: "Pilih dari direktori pelanggan kios",
          size: "sm",
          body: `
            <div class="search-input mb-12">
              ${icon("search", 16)}
              <input type="search" id="modalCustSearch" placeholder="Cari nama, nomor HP, atau ID meter…" autocomplete="off" />
            </div>
            <div id="modalCustList" style="max-height:280px;overflow-y:auto;display:grid;gap:6px">
              <!-- items -->
            </div>`,
          onMount(card, close) {
            const search = card.querySelector("#modalCustSearch");
            const listEl = card.querySelector("#modalCustList");

            function render(items) {
              if (!items.length) {
                listEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Pelanggan tidak ditemukan</div>`;
                return;
              }
              listEl.innerHTML = items
                .map(
                  (c) => `
                <button type="button" class="btn btn-soft btn-block" data-select-id="${c.id}" style="justify-content:space-between;text-align:left;padding:8px 12px">
                  <div>
                    <strong>${escapeHtml(c.name)}</strong>
                    ${c.customer_no ? `<small style="display:block;color:var(--text-muted)">ID: ${escapeHtml(c.customer_no)}</small>` : ""}
                  </div>
                  <span class="badge badge-soft">${escapeHtml(c.phone)}</span>
                </button>`,
                )
                .join("");

              listEl.querySelectorAll("[data-select-id]").forEach((btn) => {
                btn.addEventListener("click", () => {
                  const id = btn.getAttribute("data-select-id");
                  const found = items.find((x) => String(x.id) === String(id));
                  if (found) {
                    if (local.type.field.inputMode === "tel") {
                      local.customerId = found.phone || "";
                    } else {
                      local.customerId = found.customer_no || found.phone || "";
                    }
                    local.customerPhone = found.phone || "";
                    const custInput = container.querySelector("#customerInput");
                    const phoneInput = container.querySelector("#customerPhoneInput");
                    if (custInput) custInput.value = local.customerId;
                    if (phoneInput) phoneInput.value = local.customerPhone;
                    local.inquiry = null;
                    const bill = container.querySelector("#billResult");
                    if (bill) bill.innerHTML = "";
                    update();
                    toast(`Data ${found.name} dimasukkan.`, "success");
                    close();
                  }
                });
              });
            }

            render(list);

            search.addEventListener("input", (e) => {
              const q = e.target.value.toLowerCase().trim();
              const filtered = list.filter(
                (c) =>
                  c.name.toLowerCase().includes(q) ||
                  c.phone.includes(q) ||
                  (c.customer_no && c.customer_no.toLowerCase().includes(q)),
              );
              render(filtered);
            });
          },
        });
      } catch (err) {
        toast(err.message, "error");
      }
      return;
    }
    const typeButton = event.target.closest("[data-type]");
    if (typeButton) {
      const typeId = typeButton.dataset.type;
      if (typeId === local.type.id) return;
      local.type = category.types.find((t) => t.id === typeId) || local.type;
      local.inquiry = null;
      local.customerId = "";
      local.productId = local.type.products.length === 1 ? local.type.products[0].id : null;
      container.querySelectorAll("#typeTabs button").forEach((button) => {
        button.classList.toggle("active", button.dataset.type === typeId);
      });
      const label = typeContent.parentElement.querySelector(".menu-head h3");
      if (label) label.textContent = local.type.label;
      rerenderType();
      return;
    }

    const productButton = event.target.closest("[data-product]");
    if (productButton) {
      local.productId = productButton.dataset.product;
      local.inquiry = null;
      const bill = container.querySelector("#billResult");
      if (bill) bill.innerHTML = "";
      update();
      return;
    }

    const methodButton = event.target.closest("[data-method]");
    if (methodButton) {
      local.method = methodButton.dataset.method;
      update();
      return;
    }

    if (event.target.closest("#checkBill")) {
      const button = container.querySelector("#checkBill");
      if (!local.productId) {
        toast("Pilih penyedia layanan terlebih dahulu.", "warning");
        return;
      }
      if (local.customerId.length < 4) {
        toast("Masukkan nomor pelanggan terlebih dahulu.", "warning");
        return;
      }
      local.checking = true;
      setLoading(button, true, "Mengecek…");
      update();
      try {
        const result = await api.post("/inquiry", {
          categoryId: category.id,
          typeId: local.type.id,
          productId: local.productId,
          customerId: local.customerId,
        });
        local.inquiry = result;
        container.querySelector("#billResult").innerHTML = billHtml(result);
        toast(`Tagihan ${result.customerName} ditemukan.`, "success");
      } catch (error) {
        local.inquiry = null;
        container.querySelector("#billResult").innerHTML = `
          <div class="alert alert-danger mt-12">${icon("alert", 16)}<span>${escapeHtml(error.message)}</span></div>`;
        toast(error.message, "error");
      } finally {
        local.checking = false;
        setLoading(button, false);
        update();
      }
      return;
    }

    if (event.target.closest("#payBtn")) {
      if (!canPay() || local.paying) return;
      local.paying = true;
      payBtn.disabled = true;
      setLoading(payBtn, true, "Memproses pembayaran…");
      try {
        const data = await api.post("/transactions", {
          categoryId: category.id,
          typeId: local.type.id,
          productId: local.productId,
          customerId: local.customerId,
          customerPhone: local.customerPhone || (/^(08|628)\d{7,12}$/.test(local.customerId) ? local.customerId : null),
          paymentMethod: local.method,
        });
        await showReceipt(data.transaction, { onNew: resetForm });
        toast("Transaksi berhasil diproses.", "success");
      } catch (error) {
        toast(error.message || "Transaksi gagal diproses.", "error");
      } finally {
        local.paying = false;
        setLoading(payBtn, false);
        update();
      }
    }
  });

  container.addEventListener("input", (event) => {
    if (event.target.id === "customerPhoneInput") {
      local.customerPhone = event.target.value.trim();
      return;
    }
    if (event.target.id !== "customerInput") return;
    const value = event.target.value;
    const previous = local.customerId;
    local.customerId = value.trim();
    if (local.inquiry && local.customerId !== previous) {
      local.inquiry = null;
      const bill = container.querySelector("#billResult");
      if (bill) bill.innerHTML = "";
    }
    update();
  });

  update();
}
