import ExcelJS from "exceljs";
import { getSettings } from "./settings.js";
import { formatDateTime, formatShortDate, rupiah } from "./util.js";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
const ACCENT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
const BORDER = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

function methodLabel(id) {
  if (id === "qris") return "QRIS";
  if (id === "transfer") return "Transfer Bank";
  return "Tunai";
}

export async function createExcelReport(transactions, { settings = getSettings(), periodLabel = "Semua Periode", filterLabel = "" } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = settings.kioskName;
  workbook.created = new Date();
  workbook.title = "Laporan Transaksi Payment Gateway";

  const sheet = workbook.addWorksheet("Transaksi", {
    views: [{ state: "frozen", ySplit: 7 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Waktu", key: "date", width: 20 },
    { header: "No. Referensi", key: "ref", width: 22 },
    { header: "Kategori", key: "category", width: 14 },
    { header: "Produk", key: "product", width: 28 },
    { header: "ID Pelanggan", key: "customerId", width: 20 },
    { header: "Nama Pelanggan", key: "customerName", width: 24 },
    { header: "Nominal", key: "amount", width: 14 },
    { header: "Biaya Admin", key: "adminFee", width: 14 },
    { header: "Total", key: "total", width: 15 },
    { header: "Metode", key: "method", width: 14 },
    { header: "Status", key: "status", width: 10 },
    { header: "Kirim WA", key: "wa", width: 20 },
  ];
  sheet.columns = columns;

  // Judul
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.mergeCells(3, 1, 3, columns.length);

  const title = sheet.getCell(1, 1);
  title.value = settings.kioskName.toUpperCase();
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF0F172A" } };
  title.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 24;

  const subtitle = sheet.getCell(2, 1);
  subtitle.value = "Laporan Transaksi Pembayaran";
  subtitle.font = { size: 11, bold: true, color: { argb: "FF4F46E5" } };

  const info = sheet.getCell(3, 1);
  info.value = `Periode: ${periodLabel}${filterLabel ? `  •  ${filterLabel}` : ""}   |   Dicetak: ${formatDateTime(new Date())}`;
  info.font = { size: 9, color: { argb: "FF64748B" } };
  sheet.getRow(3).height = 18;

  const headerRow = sheet.getRow(7);
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: col.key === "total" || col.key === "amount" || col.key === "adminFee" ? "right" : "left" };
    cell.border = BORDER;
  });
  headerRow.height = 22;

  transactions.forEach((trx, index) => {
    const row = sheet.addRow({
      no: index + 1,
      date: formatDateTime(trx.createdAt).replace(" WIB", ""),
      ref: trx.ref,
      category: trx.categoryName,
      product: trx.productLabel,
      customerId: trx.customerId,
      customerName: trx.customerName || "-",
      amount: trx.amount,
      adminFee: trx.adminFee,
      total: trx.total,
      method: methodLabel(trx.paymentMethod),
      status: trx.status === "sukses" ? "Sukses" : "Gagal",
      wa: trx.waSentAt ? formatDateTime(trx.waSentAt).replace(" WIB", "") : "-",
    });

    row.eachCell((cell) => {
      cell.border = BORDER;
      cell.font = { size: 9, color: { argb: "FF334155" } };
      cell.alignment = { vertical: "middle" };
    });
    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
    ["amount", "adminFee", "total"].forEach((key) => {
      const cell = row.getCell(key);
      cell.numFmt = '"Rp"#,##0';
      cell.alignment = { horizontal: "right" };
    });
    const statusCell = row.getCell("status");
    statusCell.font = {
      size: 9,
      bold: true,
      color: { argb: trx.status === "sukses" ? "FF059669" : "FFDC2626" },
    };
    row.getCell("ref").font = { size: 9, bold: true, color: { argb: "FF1E293B" } };
    row.height = 18;
  });

  // Ringkasan
  const revenue = transactions.filter((t) => t.status === "sukses").reduce((sum, t) => sum + t.total, 0);
  const fee = transactions.filter((t) => t.status === "sukses").reduce((sum, t) => sum + t.adminFee, 0);
  const success = transactions.filter((t) => t.status === "sukses").length;

  const summaryStart = sheet.rowCount + 2;
  sheet.mergeCells(summaryStart, 1, summaryStart, 4);
  const summaryTitle = sheet.getCell(summaryStart, 1);
  summaryTitle.value = "RINGKASAN";
  summaryTitle.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
  summaryTitle.fill = ACCENT_FILL;

  const summaryRows = [
    ["Jumlah transaksi", transactions.length],
    ["Transaksi sukses", success],
    ["Transaksi gagal", transactions.length - success],
    ["Total pendapatan", revenue],
    ["Total biaya admin", fee],
  ];
  summaryRows.forEach(([label, value], i) => {
    const row = sheet.getRow(summaryStart + 1 + i);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { size: 9, color: { argb: "FF64748B" } };
    row.getCell(2).font = { size: 9, bold: true, color: { argb: "FF0F172A" } };
    if (label.startsWith("Total")) row.getCell(2).numFmt = '"Rp"#,##0';
  });

  sheet.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: 7, column: columns.length },
  };

  // Sheet ringkasan kategori
  const stats = new Map();
  for (const trx of transactions) {
    const entry = stats.get(trx.categoryName) || { count: 0, success: 0, revenue: 0, fee: 0 };
    entry.count += 1;
    if (trx.status === "sukses") {
      entry.success += 1;
      entry.revenue += trx.total;
      entry.fee += trx.adminFee;
    }
    stats.set(trx.categoryName, entry);
  }

  const statsSheet = workbook.addWorksheet("Ringkasan Kategori");
  statsSheet.columns = [
    { header: "Kategori", key: "category", width: 24 },
    { header: "Transaksi", key: "count", width: 14 },
    { header: "Sukses", key: "success", width: 12 },
    { header: "Pendapatan", key: "revenue", width: 18 },
    { header: "Biaya Admin", key: "fee", width: 16 },
  ];
  statsSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
  });
  for (const [category, entry] of [...stats.entries()].sort((a, b) => b[1].revenue - a[1].revenue)) {
    const row = statsSheet.addRow({ category, ...entry });
    row.eachCell((cell) => {
      cell.border = BORDER;
      cell.font = { size: 9 };
    });
    row.getCell("revenue").numFmt = '"Rp"#,##0';
    row.getCell("fee").numFmt = '"Rp"#,##0';
  }
  statsSheet.addRow({});
  const totalRow = statsSheet.addRow({
    category: "TOTAL",
    count: transactions.length,
    success,
    revenue,
    fee,
  });
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9 };
    cell.border = BORDER;
    cell.fill = ACCENT_FILL;
  });
  totalRow.getCell("revenue").numFmt = '"Rp"#,##0';
  totalRow.getCell("fee").numFmt = '"Rp"#,##0';

  return workbook.xlsx.writeBuffer();
}

export function exportFileName(prefix, extension) {
  const stamp = formatShortDate(new Date()).replaceAll(" ", "-").replaceAll(".", "");
  return `${prefix}-${stamp}.${extension}`;
}

export { rupiah };
