import express from "express";
import os from "node:os";
import { PUBLIC_DIR } from "./paths.js";
import { ensureDefaultSettings, getPublicSettings, getSettings, saveSettings, ACCENTS } from "./settings.js";
import {
  AppError,
  PAYMENT_METHODS,
  createTransaction,
  getDashboard,
  getTransactionByRef,
  listTransactions,
  getAllTransactions,
  markWaSent,
} from "./transactions.js";
import { getCatalog, findCategory, runInquiry } from "./catalog.js";
import { createReceiptPdf, createReportPdf, receiptQrDataUrl, SIMULATION_MODE } from "./receipt.js";
import { createExcelReport } from "./exporter.js";
import { seedDemoTransactions } from "./seed.js";
import { whatsapp } from "./whatsapp.js";
import { authRequired, changePassword, login, logout, me } from "./auth.js";
import { businessDate, formatShortDate, rupiah } from "./util.js";
import { db, verifyPassword } from "./db.js";
import {
  listCustomers,
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  seedDefaultCustomers,
} from "./customers.js";
import {
  listOfficeItems,
  getOfficeItemById,
  createOfficeItem,
  updateOfficeItem,
  deleteOfficeItem,
  listOfficeExpenses,
  getOfficeExpenseById,
  createOfficeExpense,
  deleteOfficeExpense,
  getOfficeSummary,
  seedOfficeData,
} from "./office.js";
import { resetDatabase, deleteAllData, restoreFactoryDefaults } from "./maintenance.js";
import { checkFirebaseStatus, syncToFirebase, broadcastCloudEvent } from "./firebase.js";

ensureDefaultSettings();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; base-uri 'self'; form-action 'self'",
  );
  next();
});

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const looksLikePhone = (value) => /^(08|628)\d{7,12}$/.test(String(value || "").replace(/[^\d]/g, ""));

function exportLabels(query) {
  const from = query.from ? formatShortDate(query.from) : null;
  const to = query.to ? formatShortDate(query.to) : null;
  let periodLabel = "Semua Periode";
  if (from || to) periodLabel = `${from || "Awal"} — ${to || "Sekarang"}`;

  const parts = [];
  if (query.category && query.category !== "all") {
    parts.push(findCategory(query.category)?.name || query.category);
  }
  if (query.status && query.status !== "all") {
    parts.push(query.status === "sukses" ? "Hanya Sukses" : "Hanya Gagal");
  }
  if (query.q) parts.push(`Pencarian: ${query.q}`);
  return { periodLabel, filterLabel: parts.join(" • ") };
}

function sendFileHeaders(res, contentType, fileName, disposition = "attachment") {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `${disposition}; filename="${fileName}"`);
  res.setHeader("Cache-Control", "no-store");
}

// ---------- Public ----------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, simulation: SIMULATION_MODE, time: new Date().toISOString() });
});

app.get("/api/public/branding", (req, res) => {
  const s = getPublicSettings();
  const admin = db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
  res.json({
    kioskName: s.kioskName,
    kioskTagline: s.kioskTagline,
    kioskAddress: s.kioskAddress,
    kioskPhone: s.kioskPhone,
    kioskEmail: s.kioskEmail,
    theme: s.theme,
    accent: s.accent,
    fontScale: s.fontScale,
    firstRun: admin ? verifyPassword("admin123", admin.password_hash) : false,
  });
});

// ---------- Auth ----------
app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);

// ---------- Protected ----------
const api = express.Router();
api.use(authRequired);

api.get("/auth/me", me);
api.post("/auth/password", changePassword);

api.get("/catalog", (req, res) => {
  res.json({
    categories: getCatalog(),
    paymentMethods: PAYMENT_METHODS,
    simulation: SIMULATION_MODE,
    accents: ACCENTS,
  });
});

api.post("/inquiry", (req, res) => {
  const { categoryId, typeId, productId, customerId, customerName, customAmount, amount } = req.body || {};
  const result = runInquiry({ categoryId, typeId, productId, customerId, customerName, customAmount, amount });
  if (!result.ok) throw new AppError(400, result.message);
  res.json(result);
});

api.post(
  "/transactions",
  asyncRoute(async (req, res) => {
    const trx = createTransaction(req.body || {});
    const settings = getSettings();
    res.status(201).json({ transaction: trx, message: "Transaksi berhasil diproses." });

    const targetPhone = trx.customerPhone || (looksLikePhone(trx.customerId) ? trx.customerId : "");
    if (settings.autoSendReceipt && targetPhone && whatsapp.status === "connected") {
      try {
        const pdf = await createReceiptPdf(trx, settings);
        const caption = `*BUKTI PEMBAYARAN*\n${settings.kioskName}\n\nRef: ${trx.ref}\nProduk: ${trx.productLabel}\nTotal: ${rupiah(trx.total)}\nStatus: LUNAS\n\n${settings.waDefaultMessage}`;
        await whatsapp.sendDocument(targetPhone, pdf, `${trx.ref}.pdf`, caption);
        markWaSent(trx.ref);
      } catch (error) {
        console.warn("[WA] gagal kirim otomatis:", error.message);
      }
    }
  }),
);

api.get("/transactions", (req, res) => {
  res.json(listTransactions(req.query));
});

api.get("/transactions/:ref", asyncRoute(async (req, res) => {
  const trx = getTransactionByRef(req.params.ref);
  if (!trx) throw new AppError(404, "Transaksi tidak ditemukan.");
  const settings = getSettings();
  res.json({
    transaction: trx,
    qrDataUrl: await receiptQrDataUrl(trx, settings),
    wa: { connected: whatsapp.status === "connected" },
  });
}));

api.get(
  "/transactions/:ref/receipt.pdf",
  asyncRoute(async (req, res) => {
    const trx = getTransactionByRef(req.params.ref);
    if (!trx) throw new AppError(404, "Transaksi tidak ditemukan.");
    const pdf = await createReceiptPdf(trx, getSettings());
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    sendFileHeaders(res, "application/pdf", `Resi-${trx.ref}.pdf`, disposition);
    res.send(pdf);
  }),
);

api.post(
  "/transactions/:ref/send-wa",
  asyncRoute(async (req, res) => {
    const trx = getTransactionByRef(req.params.ref);
    if (!trx) throw new AppError(404, "Transaksi tidak ditemukan.");
    const settings = getSettings();
    const phone = String(req.body?.phone || "").trim() || trx.customerPhone || (looksLikePhone(trx.customerId) ? trx.customerId : "");
    if (!phone) {
      throw new AppError(400, "Nomor WhatsApp tujuan wajib diisi.");
    }
    const pdf = await createReceiptPdf(trx, settings);
    const extra = String(req.body?.message || "").trim().slice(0, 300);
    const caption = [
      "*BUKTI PEMBAYARAN*",
      settings.kioskName,
      "",
      `No. Ref   : ${trx.ref}`,
      `Produk    : ${trx.productLabel}`,
      `Pelanggan : ${trx.customerName || "-"}`,
      `Total     : ${rupiah(trx.total)}`,
      `Status    : ${trx.status === "sukses" ? "LUNAS" : "GAGAL"}`,
      "",
      extra || settings.waDefaultMessage,
    ].join("\n");

    const result = await whatsapp.sendDocument(phone, pdf, `${trx.ref}.pdf`, caption);
    const sentAt = markWaSent(trx.ref);
    res.json({ ok: true, sentAt, number: result.number, message: "Bukti transaksi terkirim via WhatsApp." });
  }),
);

api.get("/dashboard", (req, res) => {
  res.json(getDashboard());
});

// ---------- Pelanggan ----------
api.get("/customers", (req, res) => {
  res.json(listCustomers(req.query));
});

api.get("/customers/all", (req, res) => {
  res.json(getAllCustomers());
});

api.get("/customers/:id", (req, res) => {
  res.json(getCustomerById(Number(req.params.id)));
});

api.post("/customers", (req, res) => {
  const customer = createCustomer(req.body || {});
  res.status(201).json({ customer, message: "Data pelanggan berhasil disimpan." });
});

api.put("/customers/:id", (req, res) => {
  const customer = updateCustomer(Number(req.params.id), req.body || {});
  res.json({ customer, message: "Data pelanggan berhasil diperbarui." });
});

api.delete("/customers/:id", (req, res) => {
  res.json(deleteCustomer(Number(req.params.id)));
});

// ---------- Gudang / Barang Kantor ----------
api.get("/office/items", (req, res) => {
  res.json(listOfficeItems(req.query));
});

api.get("/office/items/:id", (req, res) => {
  res.json(getOfficeItemById(Number(req.params.id)));
});

api.post("/office/items", (req, res) => {
  const item = createOfficeItem(req.body || {});
  res.status(201).json({ item, message: "Barang kantor berhasil ditambahkan." });
});

api.put("/office/items/:id", (req, res) => {
  const item = updateOfficeItem(Number(req.params.id), req.body || {});
  res.json({ item, message: "Barang kantor berhasil diperbarui." });
});

api.delete("/office/items/:id", (req, res) => {
  res.json(deleteOfficeItem(Number(req.params.id)));
});

// ---------- Belanja Kantor ----------
api.get("/office/expenses", (req, res) => {
  res.json(listOfficeExpenses(req.query));
});

api.get("/office/expenses/:id", (req, res) => {
  res.json(getOfficeExpenseById(Number(req.params.id)));
});

api.post("/office/expenses", (req, res) => {
  const expense = createOfficeExpense(req.body || {});
  res.status(201).json({ expense, message: "Transaksi belanja kantor berhasil dicatat." });
});

api.post(
  "/office/expenses/:id/send-wa",
  asyncRoute(async (req, res) => {
    const exp = getOfficeExpenseById(Number(req.params.id));
    if (!exp) throw new AppError(404, "Data transaksi belanja tidak ditemukan.");

    const settings = getSettings();
    const phone = String(req.body?.phone || "").trim();
    if (!phone) {
      throw new AppError(400, "Nomor WhatsApp tujuan wajib diisi.");
    }

    const itemLines = (exp.items || [])
      .map(
        (it, idx) =>
          `  ${idx + 1}. ${it.name} (${it.qty} ${it.unit} @ ${rupiah(it.unitPrice)}) = ${rupiah(it.subtotal || it.qty * it.unitPrice)}`,
      )
      .join("\n");

    const text = [
      "*BUKTI PENGELUARAN BELANJA KANTOR*",
      settings.kioskName,
      "",
      `No. Ref   : ${exp.ref}`,
      `Tanggal   : ${formatShortDate(exp.expenseDate)}`,
      `Keperluan : ${exp.title}`,
      `Kategori  : ${exp.category}`,
      `PIC       : ${exp.pic || "-"}`,
      `Metode    : ${exp.paymentMethod === "transfer" ? "Transfer Bank" : exp.paymentMethod === "petty_cash" ? "Kas Kecil" : "Tunai"}`,
      exp.receiptNumber ? `No. Nota  : ${exp.receiptNumber}` : "",
      "",
      "*Rincian Barang:*",
      itemLines || "  -",
      "",
      `*TOTAL PENGELUARAN: ${rupiah(exp.totalAmount)}*`,
      exp.notes ? `\nCatatan: ${exp.notes}` : "",
      "",
      "Dokumen internal kas & operasional.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await whatsapp.sendText(phone, text);
    res.json({ ok: true, number: result.number, message: "Bukti belanja kantor berhasil dikirim via WhatsApp." });
  }),
);

api.delete("/office/expenses/:id", (req, res) => {
  res.json(deleteOfficeExpense(Number(req.params.id)));
});

api.get("/office/summary", (req, res) => {
  res.json(getOfficeSummary());
});

api.get("/settings", (req, res) => {
  res.json({ settings: getSettings(), accents: ACCENTS, username: req.user.username });
});

api.put("/settings", (req, res) => {
  const settings = saveSettings(req.body || {});
  res.json({ settings, message: "Pengaturan berhasil disimpan." });
});

api.post("/settings/reset-database", (req, res) => {
  res.json(resetDatabase(req.body || {}));
});

api.post("/settings/delete-all-data", (req, res) => {
  res.json(deleteAllData());
});

api.post("/settings/restore-defaults", (req, res) => {
  res.json(restoreFactoryDefaults());
});

// ---------- Firebase Cloud ----------
api.get(
  "/firebase/status",
  asyncRoute(async (req, res) => {
    res.json(await checkFirebaseStatus());
  }),
);

api.post(
  "/firebase/sync",
  asyncRoute(async (req, res) => {
    res.json(await syncToFirebase(req.body?.idToken));
  }),
);

api.post(
  "/firebase/broadcast",
  asyncRoute(async (req, res) => {
    const { type, payload, kioskId } = req.body || {};
    const result = await broadcastCloudEvent(type, payload, kioskId);
    res.json(result);
  }),
);

api.get(
  "/export/transactions.xlsx",
  asyncRoute(async (req, res) => {
    const transactions = getAllTransactions(req.query);
    const settings = getSettings();
    const { periodLabel, filterLabel } = exportLabels(req.query);
    const buffer = await createExcelReport(transactions, { settings, periodLabel, filterLabel });
    sendFileHeaders(
      res,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `Laporan-Transaksi-${businessDate()}.xlsx`,
    );
    res.send(Buffer.from(buffer));
  }),
);

api.get(
  "/export/transactions.pdf",
  asyncRoute(async (req, res) => {
    const transactions = getAllTransactions(req.query);
    const settings = getSettings();
    const { periodLabel, filterLabel } = exportLabels(req.query);
    const pdf = await createReportPdf(transactions, { settings, periodLabel, filterLabel });
    sendFileHeaders(res, "application/pdf", `Laporan-Transaksi-${businessDate()}.pdf`);
    res.send(pdf);
  }),
);

api.get("/wa/status", (req, res) => {
  res.json(whatsapp.snapshot());
});

api.post(
  "/wa/connect",
  asyncRoute(async (req, res) => {
    const snapshot = await whatsapp.connect();
    res.json(snapshot);
  }),
);

api.post(
  "/wa/logout",
  asyncRoute(async (req, res) => {
    const snapshot = await whatsapp.logout();
    res.json({ ...snapshot, message: "Perangkat WhatsApp berhasil diputuskan." });
  }),
);

api.post(
  "/wa/test",
  asyncRoute(async (req, res) => {
    const { number, message } = req.body || {};
    if (!number) throw new AppError(400, "Nomor WhatsApp tujuan wajib diisi.");
    const settings = getSettings();
    const text = String(message || "").trim() || `Tes koneksi WhatsApp dari ${settings.kioskName}. ✅`;
    const result = await whatsapp.sendText(number, text);
    res.json({ ok: true, number: result.number, message: "Pesan tes berhasil dikirim." });
  }),
);

api.get("/meta", (req, res) => {
  res.json({
    username: req.user.username,
    simulation: SIMULATION_MODE,
    version: "1.0.0",
    serverTime: new Date().toISOString(),
    timezone: "Asia/Jakarta",
    totalTransactions: db.prepare("SELECT COUNT(*) AS n FROM transactions").get().n,
  });
});

app.use("/api", api);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint API tidak ditemukan." });
});

app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: 0,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-cache");
    },
  }),
);

app.get("*", (req, res) => {
  res.sendFile("index.html", { root: PUBLIC_DIR });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error instanceof AppError ? error.status : error.status || 500;
  if (status >= 500) console.error("[ERROR]", error);
  const message = error.message || "Terjadi kesalahan pada server.";
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

function lanAddresses() {
  const list = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const net of entries || []) {
      if (net.family === "IPv4" && !net.internal) list.push(net.address);
    }
  }
  return list;
}

let server = null;
if (!process.env.VERCEL) {
  server = app.listen(PORT, HOST, () => {
    const settings = getSettings();
    console.log("");
    console.log("  ╔══════════════════════════════════════════════╗");
    console.log("  ║        PAYMENT GATEWAY — KIOSK PEMBAYARAN    ║");
    console.log("  ╚══════════════════════════════════════════════╝");
    console.log(`  Kios      : ${settings.kioskName}`);
    console.log(`  Lokal     : http://localhost:${PORT}`);
    for (const ip of lanAddresses()) console.log(`  Jaringan  : http://${ip}:${PORT}`);
    console.log(`  Mode      : ${SIMULATION_MODE ? "SIMULASI" : "REALTIME (Produksi)"}`);
    console.log(`  Database  : data/payment-gateway.db`);
    console.log("  Login     : admin / admin123 (ubah di menu Pengaturan)");
    console.log("");
    whatsapp.init();
  });

  process.on("SIGINT", async () => {
    await whatsapp.shutdown();
    if (server) server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });

  process.on("SIGTERM", async () => {
    await whatsapp.shutdown();
    if (server) server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

export default app;
export { app };
