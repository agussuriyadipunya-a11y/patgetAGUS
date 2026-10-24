import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getSettings } from "./settings.js";
import { formatDateTime, formatShortDate, rupiah } from "./util.js";

export const SIMULATION_MODE = process.env.SIMULATION === "true";

const RECEIPT_WIDTH = 226.77; // 80 mm
const MARGIN = 15;
const CONTENT_WIDTH = RECEIPT_WIDTH - MARGIN * 2;

function qrText(trx, settings) {
  return [
    settings.kioskName,
    `Ref: ${trx.ref}`,
    `Tanggal: ${formatDateTime(trx.createdAt)}`,
    `Produk: ${trx.productLabel}`,
    `Total: ${rupiah(trx.total)}`,
    `Status: ${trx.status === "sukses" ? "LUNAS" : "GAGAL"}`,
  ].join("\n");
}

export function receiptQrDataUrl(trx, settings = getSettings()) {
  return QRCode.toDataURL(qrText(trx, settings), {
    margin: 1,
    width: 260,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

function qrBuffer(trx, settings) {
  return QRCode.toBuffer(qrText(trx, settings), {
    type: "png",
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

function dashed(doc, y, color = "#cbd5e1") {
  doc.save();
  doc.strokeColor(color).lineWidth(0.6).dash(2, { space: 2 });
  doc.moveTo(MARGIN, y).lineTo(RECEIPT_WIDTH - MARGIN, y).stroke();
  doc.restore();
  return y + 8;
}

function centered(doc, text, y, { font = "Helvetica", size = 7, color = "#0f172a", width = CONTENT_WIDTH, x = MARGIN } = {}) {
  doc.font(font).fontSize(size).fillColor(color);
  doc.text(text, x, y, { width, align: "center" });
  return doc.y;
}

function keyValue(doc, y, label, value, { bold = false, size = 7, color = "#0f172a", labelColor = "#64748b" } = {}) {
  const labelWidth = CONTENT_WIDTH * 0.4;
  const valueWidth = CONTENT_WIDTH * 0.6;
  doc.font("Helvetica").fontSize(size).fillColor(labelColor);
  doc.text(label, MARGIN, y, { width: labelWidth, lineBreak: true });
  const labelHeight = doc.heightOfString(label, { width: labelWidth });
  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .fillColor(color)
    .text(String(value), MARGIN + labelWidth, y, { width: valueWidth, align: "right" });
  const valueHeight = doc.heightOfString(String(value), { width: valueWidth, align: "right" });
  return y + Math.max(labelHeight, valueHeight) + 2.5;
}

function drawReceipt(doc, trx, settings, qrPng) {
  doc.rect(0, 0, RECEIPT_WIDTH, doc.page.height).fill("#ffffff");
  let y = 18;

  y = centered(doc, settings.kioskName.toUpperCase(), y, { font: "Helvetica-Bold", size: 11, color: "#0f172a" });
  y = centered(doc, settings.kioskTagline, y + 1, { size: 6.3, color: "#64748b" });
  y = centered(doc, settings.kioskAddress, y + 3, { size: 5.8, color: "#94a3b8" });
  y = centered(doc, `${settings.kioskPhone}  •  ${settings.kioskEmail}`, y + 1, { size: 5.8, color: "#94a3b8" });

  y = dashed(doc, y + 7);

  // Judul & status
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 24, 5).fill("#f1f5f9");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a");
  doc.text("BUKTI PEMBAYARAN", MARGIN, y + 5, { width: CONTENT_WIDTH, align: "center" });
  doc.font("Helvetica").fontSize(5.8).fillColor("#64748b");
  doc.text(trx.ref, MARGIN, y + 15, { width: CONTENT_WIDTH, align: "center" });
  y += 32;

  // Stempel status
  const success = trx.status === "sukses";
  const stampColor = success ? "#059669" : "#dc2626";
  const stampBg = success ? "#ecfdf5" : "#fef2f2";
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 22, 5).fill(stampBg);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(stampColor);
  doc.text(success ? "TRANSAKSI BERHASIL / LUNAS" : "TRANSAKSI GAGAL", MARGIN, y + 6, {
    width: CONTENT_WIDTH,
    align: "center",
  });
  y += 30;

  // Detail transaksi
  y = centered(doc, "DETAIL TRANSAKSI", y, { font: "Helvetica-Bold", size: 6.5, color: "#94a3b8" });
  y += 3;
  y = keyValue(doc, y, "Waktu", formatDateTime(trx.createdAt));
  y = keyValue(doc, y, "Produk", trx.productLabel, { bold: true });
  y = keyValue(doc, y, "Jenis", trx.typeName);
  y = keyValue(doc, y, trx.customerName === "Nomor Prabayar" ? "Nomor Tujuan" : "Pelanggan", trx.customerName || "-");
  y = keyValue(doc, y, "ID / Nomor", trx.customerId);

  if (trx.period) y = keyValue(doc, y, "Periode", trx.period);

  for (const meta of trx.meta || []) {
    if (meta.label === "Token" || meta.label === "Serial Number") continue;
    y = keyValue(doc, y, meta.label, meta.value);
  }

  y = dashed(doc, y + 4);

  // Rincian tagihan
  for (const item of trx.items || []) {
    doc.font("Helvetica").fontSize(6.8).fillColor("#475569");
    doc.text(item.label, MARGIN, y, { width: CONTENT_WIDTH * 0.62 });
    const itemHeight = doc.heightOfString(item.label, { width: CONTENT_WIDTH * 0.62 });
    doc.font("Helvetica").fontSize(6.8).fillColor("#0f172a");
    doc.text(rupiah(item.amount), MARGIN + CONTENT_WIDTH * 0.62, y, {
      width: CONTENT_WIDTH * 0.38,
      align: "right",
    });
    y += Math.max(itemHeight, 9) + 2;
  }

  y = keyValue(doc, y, "Biaya Admin", rupiah(trx.adminFee));

  // Total box
  doc.roundedRect(MARGIN, y + 2, CONTENT_WIDTH, 34, 6).fill("#0f172a");
  doc.font("Helvetica").fontSize(6.3).fillColor("#94a3b8");
  doc.text("TOTAL PEMBAYARAN", MARGIN + 9, y + 7, { width: CONTENT_WIDTH - 18 });
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff");
  doc.text(rupiah(trx.total), MARGIN + 9, y + 15, { width: CONTENT_WIDTH - 18, align: "right" });
  y += 44;

  y = keyValue(doc, y, "Metode Bayar", trx.paymentMethod === "qris" ? "QRIS" : trx.paymentMethod === "transfer" ? "Transfer Bank" : "Tunai");

  // Token / serial
  if (trx.token || trx.serial) {
    doc.roundedRect(MARGIN, y + 3, CONTENT_WIDTH, 44, 6).fill("#eef2ff");
    doc.font("Helvetica").fontSize(5.8).fillColor("#6366f1");
    doc.text(trx.token ? "TOKEN LISTRIK" : "SERIAL NUMBER", MARGIN, y + 8, {
      width: CONTENT_WIDTH,
      align: "center",
    });
    doc.font("Courier-Bold").fontSize(trx.token ? 9.2 : 8.2).fillColor("#312e81");
    doc.text(trx.token || trx.serial, MARGIN + 5, y + 17, {
      width: CONTENT_WIDTH - 10,
      align: "center",
      characterSpacing: trx.token ? 0.9 : 0.2,
    });
    if (trx.token) {
      doc.font("Helvetica").fontSize(5.5).fillColor("#818cf8");
      doc.text("Masukkan token pada kWh meter", MARGIN, y + 33, { width: CONTENT_WIDTH, align: "center" });
    }
    y += 54;
  }

  if (trx.note) {
    doc.font("Helvetica-Oblique").fontSize(6).fillColor("#b45309");
    doc.text(`Catatan: ${trx.note}`, MARGIN, y + 2, { width: CONTENT_WIDTH });
    y = doc.y + 4;
  }

  // QR verifikasi
  if (qrPng) {
    const qrSize = 66;
    doc.image(qrPng, (RECEIPT_WIDTH - qrSize) / 2, y + 4, { width: qrSize, height: qrSize });
    y += qrSize + 8;
    y = centered(doc, "Scan untuk verifikasi transaksi", y, { size: 5.5, color: "#94a3b8" });
    y += 2;
  }

  y = dashed(doc, y + 3);
  y = centered(doc, settings.receiptFooter, y, { size: 5.8, color: "#64748b" });
  y = centered(doc, "Terima kasih telah bertransaksi 🙏", y + 1, { size: 5.8, color: "#94a3b8" });
  if (SIMULATION_MODE) {
    y = centered(doc, "Dokumen simulasi — data tagihan dihasilkan oleh sistem.", y + 3, {
      size: 4.9,
      color: "#cbd5e1",
    });
  }
  y = centered(doc, `Dicetak ${formatDateTime(new Date())}`, y + 2, { size: 4.9, color: "#cbd5e1" });

  return y + 12;
}

export async function createReceiptPdf(trx, settings = getSettings()) {
  const png = await qrBuffer(trx, settings);

  const probe = new PDFDocument({ size: [RECEIPT_WIDTH, 1600], margin: 0, autoFirstPage: true });
  probe.on("data", () => {});
  const measured = drawReceipt(probe, trx, settings, png);
  probe.end();

  const height = Math.max(Math.ceil(measured), 420);
  const doc = new PDFDocument({
    size: [RECEIPT_WIDTH, height],
    margin: 0,
    autoFirstPage: true,
    info: {
      Title: `Bukti Pembayaran ${trx.ref}`,
      Author: settings.kioskName,
      Subject: trx.productLabel,
      Creator: "Payment Gateway Kiosk",
    },
  });

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawReceipt(doc, trx, settings, png);
  doc.end();
  return done;
}

const REPORT_COLUMNS = [
  { key: "no", label: "No", width: 26, align: "left" },
  { key: "date", label: "Waktu", width: 82, align: "left" },
  { key: "ref", label: "No. Referensi", width: 104, align: "left" },
  { key: "category", label: "Kategori", width: 60, align: "left" },
  { key: "product", label: "Produk", width: 160, align: "left" },
  { key: "customer", label: "Pelanggan", width: 158, align: "left" },
  { key: "total", label: "Total", width: 72, align: "right" },
  { key: "method", label: "Metode", width: 58, align: "left" },
  { key: "status", label: "Status", width: 48, align: "left" },
];

function methodLabel(id) {
  if (id === "qris") return "QRIS";
  if (id === "transfer") return "Transfer";
  return "Tunai";
}

export function createReportPdf(transactions, { settings = getSettings(), periodLabel = "Semua Periode", filterLabel = "" } = {}) {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 32,
    bufferPages: true,
    info: {
      Title: "Laporan Transaksi Payment Gateway",
      Author: settings.kioskName,
      Creator: "Payment Gateway Kiosk",
    },
  });

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const left = 32;
  const right = pageWidth - 32;
  const contentWidth = right - left;

  const revenue = transactions.filter((t) => t.status === "sukses").reduce((sum, t) => sum + t.total, 0);
  const fee = transactions.filter((t) => t.status === "sukses").reduce((sum, t) => sum + t.adminFee, 0);
  const success = transactions.filter((t) => t.status === "sukses").length;

  function drawHeader() {
    doc.rect(0, 0, pageWidth, 86).fill("#0f172a");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16);
    doc.text("LAPORAN TRANSAKSI", left, 26, { width: contentWidth });
    doc.font("Helvetica").fontSize(8.5).fillColor("#94a3b8");
    doc.text(`${settings.kioskName} • ${settings.kioskPhone}`, left, 49, { width: contentWidth });
    doc.fontSize(8).fillColor("#cbd5e1");
    doc.text(`Periode: ${periodLabel}${filterLabel ? ` • ${filterLabel}` : ""}`, left, 62, {
      width: contentWidth * 0.7,
    });
    doc.fontSize(7.5).fillColor("#94a3b8");
    doc.text(`Dicetak: ${formatDateTime(new Date())}`, left, 62, { width: contentWidth, align: "right" });

    let y = 102;
    const boxes = [
      { label: "TOTAL TRANSAKSI", value: `${transactions.length}`, accent: "#6366f1" },
      { label: "PENDAPATAN", value: rupiah(revenue), accent: "#059669" },
      { label: "BIAYA ADMIN", value: rupiah(fee), accent: "#f59e0b" },
      {
        label: "KEBERHASILAN",
        value: `${transactions.length ? Math.round((success / transactions.length) * 1000) / 10 : 0}%`,
        accent: "#0ea5e9",
      },
    ];
    const boxWidth = (contentWidth - 24) / 4;
    boxes.forEach((box, index) => {
      const x = left + index * (boxWidth + 8);
      doc.roundedRect(x, y, boxWidth, 44, 6).fill("#f8fafc");
      doc.rect(x, y, 3, 44).fill(box.accent);
      doc.font("Helvetica").fontSize(6.5).fillColor("#64748b");
      doc.text(box.label, x + 12, y + 9, { width: boxWidth - 18 });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
      doc.text(box.value, x + 12, y + 21, { width: boxWidth - 18 });
    });
    return y + 58;
  }

  function drawTableHeader(y) {
    doc.rect(left, y, contentWidth, 22).fill("#1e293b");
    let x = left;
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff");
    for (const col of REPORT_COLUMNS) {
      doc.text(col.label, x + 5, y + 7, { width: col.width - 10, align: col.align });
      x += col.width;
    }
    return y + 22;
  }

  let y = drawHeader();
  y = drawTableHeader(y);

  const bottom = pageHeight - 40;

  transactions.forEach((trx, index) => {
    const cells = {
      no: String(index + 1),
      date: formatDateTime(trx.createdAt).replace(" WIB", ""),
      ref: trx.ref,
      category: trx.categoryName,
      product: trx.productLabel,
      customer: `${trx.customerName || "-"}\n${trx.customerId}`,
      total: rupiah(trx.total),
      method: methodLabel(trx.paymentMethod),
      status: trx.status === "sukses" ? "Sukses" : "Gagal",
    };

    doc.font("Helvetica").fontSize(6.6);
    let rowHeight = 20;
    for (const col of REPORT_COLUMNS) {
      const text = cells[col.key];
      const height = doc.heightOfString(String(text), { width: col.width - 10 }) + 9;
      rowHeight = Math.max(rowHeight, height);
    }

    if (y + rowHeight > bottom) {
      doc.addPage();
      y = 32;
      y = drawTableHeader(y);
    }

    if (index % 2 === 0) doc.rect(left, y, contentWidth, rowHeight).fill("#f8fafc");
    let x = left;
    for (const col of REPORT_COLUMNS) {
      const isStatus = col.key === "status";
      doc
        .font(col.key === "ref" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(col.key === "ref" ? 6.2 : 6.6)
        .fillColor(isStatus ? (trx.status === "sukses" ? "#059669" : "#dc2626") : col.key === "total" ? "#0f172a" : "#334155");
      doc.text(String(cells[col.key]), x + 5, y + 5, {
        width: col.width - 10,
        align: col.align,
        lineGap: 1,
      });
      x += col.width;
    }
    y += rowHeight;
  });

  if (!transactions.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#94a3b8");
    doc.text("Tidak ada transaksi pada periode/filter yang dipilih.", left, y + 20, {
      width: contentWidth,
      align: "center",
    });
    y += 50;
  }

  y += 10;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a");
  doc.text(`Total pendapatan: ${rupiah(revenue)}`, left, y, { width: contentWidth, align: "right" });

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    doc.font("Helvetica").fontSize(6.5).fillColor("#94a3b8");
    doc.text(
      `${settings.kioskName} • Halaman ${i + 1} dari ${pages.count}`,
      left,
      pageHeight - 24,
      { width: contentWidth, align: "center" },
    );
  }

  doc.end();
  return done;
}
