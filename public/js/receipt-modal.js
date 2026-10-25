import { api, downloadFile } from "./api.js";
import { icon } from "./icons.js";
import { state } from "./store.js";
import {
  escapeHtml,
  fmtDateTime,
  openModal,
  rp,
  setLoading,
  toast,
} from "./ui.js";
import { downloadReceiptImage } from "./receipt-image.js";

function paperHtml(trx, qrDataUrl) {
  const success = trx.status === "sukses";
  const metaRows = (trx.meta || [])
    .filter((m) => m.label !== "Token" && m.label !== "Serial Number")
    .map((m) => `<div class="paper-row"><span>${escapeHtml(m.label)}</span><b>${escapeHtml(m.value)}</b></div>`)
    .join("");

  const items = (trx.items || [])
    .map((item) => `<div class="paper-item"><span>${escapeHtml(item.label)}</span><span>${rp(item.amount)}</span></div>`)
    .join("");

  return `
    <div class="receipt-paper">
      <div class="paper-brand">
        <strong>${escapeHtml(state.settings?.kioskName || "Payment Gateway")}</strong>
        <span>${escapeHtml(state.settings?.kioskTagline || "")}</span>
        <small>${escapeHtml(state.settings?.kioskAddress || "")}<br />${escapeHtml(state.settings?.kioskPhone || "")}</small>
      </div>
      <div class="paper-dashed"></div>
      <div class="paper-title">BUKTI PEMBAYARAN</div>
      <div class="paper-ref">${escapeHtml(trx.ref)}</div>
      <div class="paper-status ${success ? "" : "failed"}">${success ? "TRANSAKSI BERHASIL / LUNAS" : "TRANSAKSI GAGAL"}</div>
      <div class="paper-rows">
        <div class="paper-row"><span>Waktu</span><b>${escapeHtml(fmtDateTime(trx.createdAt))}</b></div>
        <div class="paper-row"><span>Produk</span><b>${escapeHtml(trx.productLabel)}</b></div>
        <div class="paper-row"><span>Jenis</span><b>${escapeHtml(trx.typeName)}</b></div>
        <div class="paper-row"><span>${trx.customerName === "Nomor Prabayar" ? "Nomor" : "Pelanggan"}</span><b>${escapeHtml(trx.customerName || "-")}</b></div>
        <div class="paper-row"><span>ID / Nomor</span><b>${escapeHtml(trx.customerId)}</b></div>
        ${trx.period ? `<div class="paper-row"><span>Periode</span><b>${escapeHtml(trx.period)}</b></div>` : ""}
        ${metaRows}
      </div>
      <div class="paper-dashed"></div>
      <div class="paper-items">${items}</div>
      <div class="paper-row" style="margin-top:6px">
        <span>Biaya admin</span>
        <b>${(!trx.adminFee || trx.adminFee === 0) ? '<span class="paper-badge-free">Rp 0 (BEBAS ADMIN)</span>' : rp(trx.adminFee)}</b>
      </div>
      <div class="paper-total"><span>TOTAL PEMBAYARAN</span><strong>${rp(trx.total)}</strong></div>
      <div class="paper-row" style="margin-top:8px"><span>Metode bayar</span><b>${trx.paymentMethod === "qris" ? "QRIS" : trx.paymentMethod === "transfer" ? "Transfer Bank" : "Tunai"}</b></div>
      ${trx.token || trx.serial ? `
        <div class="paper-token">
          <span>${trx.token ? "TOKEN LISTRIK" : "SERIAL NUMBER"}</span>
          <code>${escapeHtml(trx.token ? trx.token.match(/.{1,5}/g).join(" ") : trx.serial)}</code>
        </div>` : ""}
      ${trx.note ? `<div class="paper-row" style="margin-top:8px"><span>Catatan</span><b>${escapeHtml(trx.note)}</b></div>` : ""}
      <div class="paper-qr">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR verifikasi" />` : `<div style="width:86px;height:86px"></div>`}
        <small>Scan untuk verifikasi</small>
      </div>
      <div class="paper-dashed"></div>
      <div class="paper-foot">${escapeHtml(state.settings?.receiptFooter || "")}<br />Terima kasih telah bertransaksi</div>
      ${state.simulation ? `<div class="paper-sim">Dokumen simulasi — data tagihan dihasilkan oleh sistem.</div>` : ""}
    </div>`;
}

export async function showReceipt(trx, { qrDataUrl = "", onNew = null } = {}) {
  if (!qrDataUrl) {
    try {
      const detail = await api.get(`/transactions/${encodeURIComponent(trx.ref)}`);
      qrDataUrl = detail.qrDataUrl || "";
    } catch {
      // resi tetap dapat ditampilkan tanpa QR
    }
  }

  const success = trx.status === "sukses";
  const entry = openModal({
    bare: true,
    size: "sm",
    className: "receipt-modal",
    body: `
      <div class="success-hero">
        <div class="success-check" style="${success ? "" : "background:var(--danger);box-shadow:0 0 0 9px color-mix(in srgb, var(--danger) 11%, transparent)"}">
          ${icon(success ? "check" : "x", 28)}
        </div>
        <h3>${success ? "Transaksi Berhasil" : "Transaksi Gagal"}</h3>
        <p>${success ? "Pembayaran telah diproses. Simpan resi di bawah ini." : "Transaksi tidak berhasil diproses."}</p>
      </div>
      <div class="receipt-wrap">${paperHtml(trx, qrDataUrl)}</div>
      <div class="receipt-actions">
        <button class="receipt-action" data-action="pdf">${icon("filePdf", 18)}PDF</button>
        <button class="receipt-action" data-action="image">${icon("image", 18)}Gambar</button>
        <button class="receipt-action" data-action="wa">${icon("whatsapp", 18)}Kirim WA</button>
        <button class="receipt-action" data-action="print">${icon("printer", 18)}Cetak</button>
      </div>
      <div class="receipt-foot">
        <button class="btn btn-soft" data-new>${icon("plus", 16)} Transaksi Baru</button>
        <button class="btn btn-primary" data-close>Tutup</button>
      </div>`,
    onMount(card, close) {
      card.querySelector("[data-new]")?.addEventListener("click", () => {
        close("new");
        onNew?.();
      });

      card.querySelector('[data-action="pdf"]').addEventListener("click", async (event) => {
        const button = event.currentTarget;
        setLoading(button, true, "");
        try {
          await downloadFile(`/transactions/${encodeURIComponent(trx.ref)}/receipt.pdf?download=1`, `Resi-${trx.ref}.pdf`);
          toast("Resi PDF berhasil diunduh.", "success");
        } catch (error) {
          toast(error.message, "error");
        } finally {
          setLoading(button, false);
        }
      });

      card.querySelector('[data-action="image"]').addEventListener("click", async (event) => {
        const button = event.currentTarget;
        setLoading(button, true, "");
        try {
          await downloadReceiptImage(trx, state.settings, qrDataUrl);
          toast("Resi gambar berhasil diunduh.", "success");
        } catch (error) {
          toast(error.message || "Gagal membuat gambar resi.", "error");
        } finally {
          setLoading(button, false);
        }
      });

      card.querySelector('[data-action="wa"]').addEventListener("click", () => {
        showWaModal(trx);
      });

      card.querySelector('[data-action="print"]').addEventListener("click", () => {
        const pdfUrl = `/api/transactions/${encodeURIComponent(trx.ref)}/receipt.pdf`;
        const win = window.open(pdfUrl, "_blank");
        if (!win) {
          window.print();
        }
      });
    },
  });

  return entry;
}

export async function openTransactionDetail(ref) {
  const modal = openModal({
    title: "Detail transaksi",
    subtitle: ref,
    size: "sm",
    body: `<div class="loading-block"><span class="spinner"></span><span>Mengambil data transaksi…</span></div>`,
  });
  try {
    const data = await api.get(`/transactions/${encodeURIComponent(ref)}`);
    modal.close("loaded");
    await showReceipt(data.transaction, { qrDataUrl: data.qrDataUrl });
  } catch (error) {
    modal.close("error");
    toast(error.message || "Transaksi tidak ditemukan.", "error");
  }
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!digits.startsWith("62")) digits = `62${digits}`;
  return digits;
}

export async function showWaModal(trx) {
  let wa = state.wa;
  try {
    wa = await api.get("/wa/status");
    state.wa = wa;
  } catch {
    // gunakan status terakhir
  }
  const connected = wa?.status === "connected";

  let defaultPhone = trx.customerPhone || "";
  if (!defaultPhone && /^(08|628)\d{7,12}$/.test(String(trx.customerId))) {
    defaultPhone = trx.customerId;
  }

  const defaultMessage = state.settings?.waDefaultMessage || "Terima kasih telah bertransaksi di kios kami.";

  const summaryText = [
    "*BUKTI PEMBAYARAN*",
    state.settings?.kioskName || "Payment Gateway",
    "",
    `No. Ref   : ${trx.ref}`,
    `Produk    : ${trx.productLabel}`,
    `Pelanggan : ${trx.customerName || "-"}`,
    `Total     : ${rp(trx.total)}`,
    `Status    : ${trx.status === "sukses" ? "LUNAS" : "GAGAL"}`,
    "",
    defaultMessage,
  ].join("\n");

  openModal({
    title: "Kirim Bukti Resi via WhatsApp",
    subtitle: `${trx.ref} • ${rp(trx.total)}`,
    size: "sm",
    body: `
      <div class="wa-send-summary">
        <span class="wa-mini-icon">${icon("whatsapp", 18)}</span>
        <div>
          <strong>${connected ? "WhatsApp Bot Terhubung" : "WhatsApp Bot Belum Terhubung"}</strong>
          <span>${connected ? `Siap kirim dokumen PDF (${escapeHtml(wa.me?.name || wa.me?.number || "Aktif")})` : "Gunakan tombol Buka WhatsApp manual atau hubungkan bot"}</span>
        </div>
      </div>

      ${
        connected
          ? ""
          : `
        <div class="alert alert-warning mt-12">
          ${icon("alert", 16)}
          <span>WhatsApp bot kasir belum terhubung. Anda tetap dapat membuka chat WhatsApp langsung melalui tombol <strong>Buka WhatsApp Web / App</strong> di bawah.</span>
        </div>`
      }

      <form id="waSendForm" class="mt-16">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label style="font-weight:600;font-size:13px">Nomor WhatsApp Tujuan</label>
          <button type="button" class="btn btn-ghost btn-sm" id="pickCustWaBtn" style="padding:2px 8px;font-size:12px">
            ${icon("users", 13)} Pilih Pelanggan
          </button>
        </div>

        <label class="field" style="margin-bottom:12px">
          <input class="input" id="waPhone" placeholder="Contoh: 081234567890" inputmode="tel" value="${escapeHtml(defaultPhone)}" required />
          <span class="field-hint">Mendukung format 08xx atau 62xx. Resi bot dikirim dalam format dokumen PDF resmi.</span>
        </label>

        <label class="field">
          <span>Pesan Pengantar</span>
          <textarea class="textarea" id="waMessage" rows="3">${escapeHtml(defaultMessage)}</textarea>
        </label>

        <div class="modal-foot" style="padding:8px 0 0;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-soft" data-manual style="flex:1">
            ${icon("external", 16)} Buka WhatsApp (Manual)
          </button>
          <button type="submit" class="btn btn-whatsapp" id="waSendBtn" style="flex:1" ${connected ? "" : "disabled"}>
            ${icon("send", 16)} Kirim Resi (Bot PDF)
          </button>
        </div>
      </form>`,
    async onMount(card, close) {
      const form = card.querySelector("#waSendForm");
      const phoneInput = card.querySelector("#waPhone");
      const messageInput = card.querySelector("#waMessage");
      const sendBtn = card.querySelector("#waSendBtn");
      const pickCustBtn = card.querySelector("#pickCustWaBtn");

      pickCustBtn?.addEventListener("click", async () => {
        try {
          const list = await api.get("/customers/all");
          if (!list || !list.length) {
            toast("Belum ada data pelanggan tersimpan. Tambah pelanggan di menu Pelanggan.", "warning");
            return;
          }
          openCustomerPickerModal(list, (selected) => {
            if (selected?.phone) {
              phoneInput.value = selected.phone;
              toast(`Nomor ${selected.name} dipilih.`, "success");
            }
          });
        } catch (err) {
          toast(err.message, "error");
        }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const raw = phoneInput.value.trim();
        const digits = normalizePhone(raw);
        if (!digits || digits.length < 10) {
          toast("Masukkan nomor WhatsApp yang valid (minimal 10 digit).", "warning");
          phoneInput.focus();
          return;
        }

        setLoading(sendBtn, true, "Mengirim resi…");
        try {
          const result = await api.post(`/transactions/${encodeURIComponent(trx.ref)}/send-wa`, {
            phone: digits,
            message: messageInput.value.trim(),
          });
          toast(result.message || "Bukti transaksi terkirim via WhatsApp.", "success");
          close("sent");
        } catch (error) {
          toast(error.message || "Gagal mengirim WhatsApp.", "error");
        } finally {
          setLoading(sendBtn, false);
        }
      });

      card.querySelector("[data-manual]").addEventListener("click", () => {
        const digits = normalizePhone(phoneInput.value);
        if (!digits || digits.length < 9) {
          toast("Masukkan nomor WhatsApp yang valid (contoh: 081234567890).", "warning");
          phoneInput.focus();
          return;
        }
        const text = `${summaryText}\n${messageInput.value.trim() ? `\n${messageInput.value.trim()}` : ""}`;
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank");
      });
    },
  });
}

function openCustomerPickerModal(customers, onPick) {
  openModal({
    title: "Pilih Pelanggan",
    subtitle: "Pilih dari direktori pelanggan kios",
    size: "sm",
    body: `
      <div class="search-input mb-12">
        ${icon("search", 16)}
        <input type="search" id="pickerSearch" placeholder="Cari nama atau nomor HP…" autocomplete="off" />
      </div>
      <div id="pickerList" style="max-height:280px;overflow-y:auto;display:grid;gap:6px">
        <!-- customer items -->
      </div>`,
    onMount(card, close) {
      const search = card.querySelector("#pickerSearch");
      const listEl = card.querySelector("#pickerList");

      function render(items) {
        if (!items.length) {
          listEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Pelanggan tidak ditemukan</div>`;
          return;
        }
        listEl.innerHTML = items
          .map(
            (c) => `
          <button type="button" class="btn btn-soft btn-block" data-cust-id="${c.id}" style="justify-content:space-between;text-align:left;padding:8px 12px">
            <div>
              <strong>${escapeHtml(c.name)}</strong>
              ${c.customer_no ? `<small style="display:block;color:var(--text-muted)">ID: ${escapeHtml(c.customer_no)}</small>` : ""}
            </div>
            <span class="badge badge-soft">${escapeHtml(c.phone)}</span>
          </button>`,
          )
          .join("");

        listEl.querySelectorAll("[data-cust-id]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-cust-id");
            const found = customers.find((x) => String(x.id) === String(id));
            if (found) {
              onPick(found);
              close();
            }
          });
        });
      }

      render(customers);

      search.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        const filtered = customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            (c.customer_no && c.customer_no.toLowerCase().includes(q)),
        );
        render(filtered);
      });
    },
  });
}
