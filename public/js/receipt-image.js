import { state } from "./store.js";
import { downloadBlob, fmtDateTime, rp } from "./ui.js";

const WIDTH = 640;
const PAD = 44;
const CONTENT = WIDTH - PAD * 2;
const SCALE = 2;

function wrapText(ctx, text, maxWidth) {
  const words = String(text ?? "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawReceipt(ctx, trx, settings, qrImage) {
  const success = trx.status === "sukses";
  let y = 0;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, 3000);

  const bar = ctx.createLinearGradient(0, 0, WIDTH, 0);
  bar.addColorStop(0, "#6366f1");
  bar.addColorStop(0.55, "#4f46e5");
  bar.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, WIDTH, 8);
  y = 8 + 34;

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = '700 23px "Segoe UI", Arial, sans-serif';
  ctx.fillText(settings.kioskName || "Payment Gateway", WIDTH / 2, y + 18);
  y += 28;

  ctx.font = '11px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = "#64748b";
  ctx.fillText(settings.kioskTagline || "", WIDTH / 2, y + 12);
  y += 20;

  ctx.font = '10px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = "#94a3b8";
  const addressLines = wrapText(ctx, settings.kioskAddress || "", CONTENT);
  for (const line of addressLines) {
    ctx.fillText(line, WIDTH / 2, y + 10);
    y += 14;
  }
  y += 2;
  ctx.fillText(`${settings.kioskPhone || ""}  •  ${settings.kioskEmail || ""}`, WIDTH / 2, y + 10);
  y += 18;

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(WIDTH - PAD, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 24;

  ctx.fillStyle = "#94a3b8";
  ctx.font = '700 9px "Segoe UI", Arial, sans-serif';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText("BUKTI PEMBAYARAN", WIDTH / 2, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  y += 17;

  ctx.fillStyle = "#475569";
  ctx.font = '600 11px ui-monospace, Consolas, monospace';
  ctx.fillText(trx.ref, WIDTH / 2, y);
  y += 16;

  const stampW = CONTENT;
  const stampH = 26;
  ctx.fillStyle = success ? "#ecfdf5" : "#fef2f2";
  roundedRect(ctx, PAD, y, stampW, stampH, 7);
  ctx.fill();
  ctx.fillStyle = success ? "#059669" : "#dc2626";
  ctx.font = '700 10px "Segoe UI", Arial, sans-serif';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "1.2px";
  ctx.fillText(success ? "TRANSAKSI BERHASIL / LUNAS" : "TRANSAKSI GAGAL", WIDTH / 2, y + 17);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  y += stampH + 22;

  const kv = (label, value, { bold = false, size = 11 } = {}) => {
    ctx.font = `${bold ? 700 : 600} ${size}px "Segoe UI", Arial, sans-serif`;
    const lines = wrapText(ctx, value, CONTENT * 0.62);
    const lineHeight = size + 4;
    const rowHeight = Math.max(17, lines.length * lineHeight + 3);

    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = `${size}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(label, PAD, y + 11);

    ctx.textAlign = "right";
    ctx.fillStyle = "#0f172a";
    ctx.font = `${bold ? 700 : 600} ${size}px "Segoe UI", Arial, sans-serif`;
    lines.forEach((line, index) => {
      ctx.fillText(line, WIDTH - PAD, y + 11 + index * lineHeight);
    });
    y += rowHeight;
  };

  kv("Waktu", fmtDateTime(trx.createdAt));
  kv("Produk", trx.productLabel, { bold: true });
  kv("Jenis", trx.typeName);
  kv(trx.customerName === "Nomor Prabayar" ? "Nomor Tujuan" : "Pelanggan", trx.customerName || "-");
  kv("ID / Nomor", trx.customerId);
  if (trx.period) kv("Periode", trx.period);
  for (const meta of trx.meta || []) {
    if (meta.label === "Token" || meta.label === "Serial Number") continue;
    kv(meta.label, meta.value);
  }

  y += 6;
  ctx.strokeStyle = "#e2e8f0";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(WIDTH - PAD, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 18;

  for (const item of trx.items || []) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#475569";
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    const lines = wrapText(ctx, item.label, CONTENT * 0.66);
    ctx.fillText(lines[0], PAD, y + 10);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0f172a";
    ctx.font = '600 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(rp(item.amount), WIDTH - PAD, y + 10);
    y += 18;
    for (let i = 1; i < lines.length; i += 1) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = '10px "Segoe UI", Arial, sans-serif';
      ctx.fillText(lines[i], PAD, y + 9);
      y += 13;
    }
  }

  kv("Biaya Admin", rp(trx.adminFee));
  y += 4;

  const totalH = 54;
  ctx.fillStyle = "#0f172a";
  roundedRect(ctx, PAD, y, CONTENT, totalH, 11);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = "#94a3b8";
  ctx.font = '700 9px "Segoe UI", Arial, sans-serif';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "1.4px";
  ctx.fillText("TOTAL PEMBAYARAN", PAD + 16, y + 19);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText(rp(trx.total), WIDTH - PAD - 16, y + 37);
  y += totalH + 14;

  const method = trx.paymentMethod === "qris" ? "QRIS" : trx.paymentMethod === "transfer" ? "Transfer Bank" : "Tunai";
  kv("Metode Bayar", method);

  if (trx.token || trx.serial) {
    y += 4;
    const tokenH = 66;
    ctx.fillStyle = "#eef2ff";
    roundedRect(ctx, PAD, y, CONTENT, tokenH, 10);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#6366f1";
    ctx.font = '700 9px "Segoe UI", Arial, sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "1.6px";
    ctx.fillText(trx.token ? "TOKEN LISTRIK" : "SERIAL NUMBER", WIDTH / 2, y + 19);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillStyle = "#312e81";
    ctx.font = '700 18px ui-monospace, Consolas, monospace';
    const tokenText = trx.token ? trx.token.match(/.{1,5}/g).join(" ") : trx.serial;
    ctx.fillText(tokenText, WIDTH / 2, y + 43);
    if (trx.token) {
      ctx.fillStyle = "#818cf8";
      ctx.font = '9px "Segoe UI", Arial, sans-serif';
      ctx.fillText("Masukkan token pada kWh meter", WIDTH / 2, y + 58);
    }
    y += tokenH + 10;
  }

  if (trx.note) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#b45309";
    ctx.font = 'italic 10px "Segoe UI", Arial, sans-serif';
    const lines = wrapText(ctx, `Catatan: ${trx.note}`, CONTENT);
    for (const line of lines) {
      ctx.fillText(line, PAD, y + 10);
      y += 14;
    }
    y += 4;
  }

  if (qrImage) {
    const qrSize = 108;
    ctx.drawImage(qrImage, (WIDTH - qrSize) / 2, y + 2, qrSize, qrSize);
    y += qrSize + 14;
    ctx.textAlign = "center";
    ctx.fillStyle = "#94a3b8";
    ctx.font = '9px "Segoe UI", Arial, sans-serif';
    ctx.fillText("Scan untuk verifikasi transaksi", WIDTH / 2, y + 8);
    y += 14;
  }

  y += 4;
  ctx.strokeStyle = "#e2e8f0";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(WIDTH - PAD, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 18;

  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = '10px "Segoe UI", Arial, sans-serif';
  const footerLines = wrapText(ctx, settings.receiptFooter || "", CONTENT);
  for (const line of footerLines) {
    ctx.fillText(line, WIDTH / 2, y + 10);
    y += 14;
  }
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Terima kasih telah bertransaksi", WIDTH / 2, y + 10);
  y += 18;

  if (state.simulation) {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = '8px "Segoe UI", Arial, sans-serif';
    ctx.fillText("Dokumen simulasi — data tagihan dihasilkan oleh sistem.", WIDTH / 2, y + 8);
    y += 14;
  }

  ctx.fillStyle = "#cbd5e1";
  ctx.font = '8px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`Dicetak ${fmtDateTime(new Date())}`, WIDTH / 2, y + 8);
  y += 14;

  return y;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function buildReceiptCanvas(trx, settings = state.settings, qrDataUrl = "") {
  const qrImage = await loadImage(qrDataUrl);

  const probe = document.createElement("canvas");
  probe.width = WIDTH * SCALE;
  probe.height = 3200 * SCALE;
  const probeCtx = probe.getContext("2d");
  probeCtx.scale(SCALE, SCALE);
  const endY = drawReceipt(probeCtx, trx, settings, qrImage);

  const height = Math.max(Math.ceil(endY + 30), 600);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  drawReceipt(ctx, trx, settings, qrImage);
  return canvas;
}

export async function downloadReceiptImage(trx, settings = state.settings, qrDataUrl = "") {
  const canvas = await buildReceiptCanvas(trx, settings, qrDataUrl);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Gagal membuat gambar resi.");
  downloadBlob(blob, `Resi-${trx.ref}.png`);
  return true;
}
