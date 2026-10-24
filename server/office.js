import { db } from "./db.js";
import { AppError } from "./transactions.js";
import { businessDate, nowIso, randomRef } from "./util.js";

// ==================== GUDANG / BARANG KANTOR ====================

export function listOfficeItems(query = {}) {
  const clauses = [];
  const params = [];

  if (query.q) {
    const term = `%${String(query.q).trim()}%`;
    clauses.push("(code LIKE ? OR name LIKE ? OR category LIKE ? OR notes LIKE ?)");
    params.push(term, term, term, term);
  }

  if (query.category && query.category !== "all") {
    clauses.push("category = ?");
    params.push(query.category);
  }

  if (query.lowStock === "1" || query.lowStock === "true") {
    clauses.push("stock <= min_stock");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const items = db
    .prepare(`SELECT * FROM office_items ${where} ORDER BY name ASC`)
    .all(...params);

  return items;
}

export function getOfficeItemById(id) {
  const row = db.prepare("SELECT * FROM office_items WHERE id = ?").get(id);
  if (!row) throw new AppError(404, "Barang kantor tidak ditemukan.");
  return row;
}

export function generateItemCode() {
  const last = db.prepare("SELECT id FROM office_items ORDER BY id DESC LIMIT 1").get();
  const nextId = (last?.id || 0) + 1;
  return `BRG-${String(nextId).padStart(3, "0")}`;
}

export function createOfficeItem(input = {}) {
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "Nama barang wajib diisi.");

  let code = String(input.code || "").trim().toUpperCase();
  if (!code) code = generateItemCode();

  const existing = db.prepare("SELECT id FROM office_items WHERE code = ?").get(code);
  if (existing) {
    throw new AppError(400, `Kode barang "${code}" sudah digunakan.`);
  }

  const category = String(input.category || "ATK").trim();
  const unit = String(input.unit || "Pcs").trim();
  const price = Math.max(0, Number(input.price) || 0);
  const stock = Math.max(0, Number(input.stock) || 0);
  const minStock = Math.max(0, Number(input.minStock ?? input.min_stock) || 0);
  const notes = input.notes ? String(input.notes).trim() : null;
  const now = nowIso();

  const info = db
    .prepare(
      `INSERT INTO office_items (code, name, category, unit, price, stock, min_stock, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(code, name, category, unit, price, stock, minStock, notes, now, now);

  return getOfficeItemById(Number(info.lastInsertRowid));
}

export function updateOfficeItem(id, input = {}) {
  const existing = getOfficeItemById(id);
  const name = input.name !== undefined ? String(input.name).trim() : existing.name;
  if (!name) throw new AppError(400, "Nama barang wajib diisi.");

  let code = input.code !== undefined ? String(input.code).trim().toUpperCase() : existing.code;
  if (!code) code = existing.code;

  if (code !== existing.code) {
    const duplicate = db.prepare("SELECT id FROM office_items WHERE code = ? AND id <> ?").get(code, id);
    if (duplicate) throw new AppError(400, `Kode barang "${code}" sudah digunakan.`);
  }

  const category = input.category !== undefined ? String(input.category).trim() : existing.category;
  const unit = input.unit !== undefined ? String(input.unit).trim() : existing.unit;
  const price = input.price !== undefined ? Math.max(0, Number(input.price) || 0) : existing.price;
  const stock = input.stock !== undefined ? Math.max(0, Number(input.stock) || 0) : existing.stock;
  const minStock = input.minStock !== undefined
    ? Math.max(0, Number(input.minStock) || 0)
    : (input.min_stock !== undefined ? Math.max(0, Number(input.min_stock) || 0) : existing.min_stock);
  const notes = input.notes !== undefined ? (input.notes ? String(input.notes).trim() : null) : existing.notes;
  const now = nowIso();

  db.prepare(
    `UPDATE office_items
     SET code = ?, name = ?, category = ?, unit = ?, price = ?, stock = ?, min_stock = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(code, name, category, unit, price, stock, minStock, notes, now, id);

  return getOfficeItemById(id);
}

export function deleteOfficeItem(id) {
  getOfficeItemById(id);
  db.prepare("DELETE FROM office_items WHERE id = ?").run(id);
  return { ok: true, message: "Barang kantor berhasil dihapus." };
}

// ==================== BELANJA KANTOR ====================

function safeJson(text, fallback = []) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function listOfficeExpenses(query = {}) {
  const clauses = [];
  const params = [];

  if (query.q) {
    const term = `%${String(query.q).trim()}%`;
    clauses.push("(ref LIKE ? OR title LIKE ? OR pic LIKE ? OR receipt_number LIKE ? OR notes LIKE ?)");
    params.push(term, term, term, term, term);
  }

  if (query.category && query.category !== "all") {
    clauses.push("category = ?");
    params.push(query.category);
  }

  if (query.from) {
    clauses.push("expense_date >= ?");
    params.push(query.from);
  }

  if (query.to) {
    clauses.push("expense_date <= ?");
    params.push(query.to);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM office_expenses ${where} ORDER BY expense_date DESC, id DESC`)
    .all(...params);

  return rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    category: r.category,
    expenseDate: r.expense_date,
    paymentMethod: r.payment_method,
    totalAmount: r.total_amount,
    receiptNumber: r.receipt_number,
    pic: r.pic,
    notes: r.notes,
    items: safeJson(r.items_json, []),
    createdAt: r.created_at,
  }));
}

export function getOfficeExpenseById(id) {
  const r = db.prepare("SELECT * FROM office_expenses WHERE id = ?").get(id);
  if (!r) throw new AppError(404, "Data transaksi belanja kantor tidak ditemukan.");
  return {
    id: r.id,
    ref: r.ref,
    title: r.title,
    category: r.category,
    expenseDate: r.expense_date,
    paymentMethod: r.payment_method,
    totalAmount: r.total_amount,
    receiptNumber: r.receipt_number,
    pic: r.pic,
    notes: r.notes,
    items: safeJson(r.items_json, []),
    createdAt: r.created_at,
  };
}

export function generateExpenseRef(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BLJ-${y}${m}${day}-${rand}`;
}

export function createOfficeExpense(input = {}) {
  const title = String(input.title || "").trim();
  if (!title) throw new AppError(400, "Keperluan / judul belanja wajib diisi.");

  const category = String(input.category || "Operasional").trim();
  const expenseDate = String(input.expenseDate || input.expense_date || businessDate()).trim();
  const paymentMethod = String(input.paymentMethod || input.payment_method || "tunai").trim();
  const pic = input.pic ? String(input.pic).trim() : "Kasir";
  const receiptNumber = input.receiptNumber ? String(input.receiptNumber).trim() : (input.receipt_number ? String(input.receipt_number).trim() : null);
  const notes = input.notes ? String(input.notes).trim() : null;

  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) {
    throw new AppError(400, "Masukkan minimal 1 barang belanjaan.");
  }

  let totalAmount = 0;
  const items = [];

  for (const item of rawItems) {
    const itemName = String(item.name || "").trim();
    if (!itemName) continue;
    const qty = Math.max(1, Number(item.qty) || 1);
    const unitPrice = Math.max(0, Number(item.unitPrice ?? item.unit_price) || 0);
    const subtotal = qty * unitPrice;
    totalAmount += subtotal;

    items.push({
      itemId: item.itemId || item.item_id || null,
      name: itemName,
      unit: item.unit || "Pcs",
      qty,
      unitPrice,
      subtotal,
    });

    // Otomatis update stok barang jika itemId valid dan opsi updateStock aktif
    if (Boolean(input.updateStock) && (item.itemId || item.item_id)) {
      const targetId = item.itemId || item.item_id;
      try {
        db.prepare("UPDATE office_items SET stock = stock + ?, updated_at = ? WHERE id = ?").run(qty, nowIso(), targetId);
      } catch (err) {
        console.warn("[Gudang] gagal update stok:", err.message);
      }
    }
  }

  if (input.totalAmount && Number(input.totalAmount) > 0) {
    totalAmount = Number(input.totalAmount);
  }

  const ref = generateExpenseRef(expenseDate);
  const now = nowIso();

  const info = db
    .prepare(
      `INSERT INTO office_expenses
        (ref, title, category, expense_date, payment_method, total_amount, receipt_number, pic, notes, items_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ref,
      title,
      category,
      expenseDate,
      paymentMethod,
      totalAmount,
      receiptNumber,
      pic,
      notes,
      JSON.stringify(items),
      now,
    );

  return getOfficeExpenseById(Number(info.lastInsertRowid));
}

export function deleteOfficeExpense(id) {
  getOfficeExpenseById(id);
  db.prepare("DELETE FROM office_expenses WHERE id = ?").run(id);
  return { ok: true, message: "Transaksi belanja berhasil dihapus." };
}

export function getOfficeSummary() {
  const today = businessDate();
  const currentMonthPrefix = today.slice(0, 7); // YYYY-MM

  const monthTotal = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) AS total FROM office_expenses WHERE expense_date LIKE ?")
    .get(`${currentMonthPrefix}%`).total;

  const todayTotal = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) AS total FROM office_expenses WHERE expense_date = ?")
    .get(today).total;

  const totalExpenseCount = db
    .prepare("SELECT COUNT(*) AS n FROM office_expenses")
    .get().n;

  const totalItemsCount = db
    .prepare("SELECT COUNT(*) AS n FROM office_items")
    .get().n;

  const lowStockCount = db
    .prepare("SELECT COUNT(*) AS n FROM office_items WHERE stock <= min_stock")
    .get().n;

  return {
    monthTotal,
    todayTotal,
    totalExpenseCount,
    totalItemsCount,
    lowStockCount,
  };
}

export function seedOfficeData() {
  const itemCount = db.prepare("SELECT COUNT(*) AS n FROM office_items").get().n;
  if (itemCount === 0) {
    const initialItems = [
      { code: "ATK-001", name: "Kertas Struk Thermal 80mm", category: "Kios & Resi", unit: "Roll", price: 6500, stock: 45, min_stock: 10, notes: "Kertas printer kasir untuk cetak struk/resi" },
      { code: "ATK-002", name: "Kertas HVS A4 80gr Sinar Dunia", category: "ATK", unit: "Rim", price: 54000, stock: 12, min_stock: 4, notes: "Untuk cetak dokumen & laporan" },
      { code: "ATK-003", name: "Tinta Printer Epson 003 Black", category: "ATK", unit: "Botol", price: 85000, stock: 5, min_stock: 2, notes: "Tinta printer kantor" },
      { code: "ATK-004", name: "Pulpen Faster Black 0.5", category: "ATK", unit: "Box", price: 32000, stock: 4, min_stock: 2, notes: "1 box isi 12 pcs" },
      { code: "PTR-001", name: "Kopi Kapal Api Special Mix", category: "Konsumsi / Pantry", unit: "Pack", price: 18000, stock: 8, min_stock: 3, notes: "Isi 10 sachet" },
      { code: "PTR-002", name: "Air Mineral Galon Aqua 19L", category: "Konsumsi / Pantry", unit: "Galon", price: 21000, stock: 2, min_stock: 1, notes: "Refill galon air minum" },
      { code: "KBR-001", name: "Hand Sanitizer Gel 500ml", category: "Kebersihan", unit: "Botol", price: 28000, stock: 3, min_stock: 2, notes: "Untuk meja kasir & pengunjung" },
    ];

    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO office_items (code, name, category, unit, price, stock, min_stock, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of initialItems) {
      insert.run(item.code, item.name, item.category, item.unit, item.price, item.stock, item.min_stock, item.notes, now, now);
    }
  }

  const expCount = db.prepare("SELECT COUNT(*) AS n FROM office_expenses").get().n;
  if (expCount === 0) {
    const today = businessDate();
    createOfficeExpense({
      title: "Pembelian Kertas Struk Kasir & Kertas HVS",
      category: "ATK",
      expenseDate: today,
      paymentMethod: "tunai",
      pic: "Admin Kios",
      receiptNumber: "NOTA-TB-8891",
      notes: "Beli stok kertas struk kasir 80mm dan kertas A4 di Toko Buku Gramedia",
      items: [
        { name: "Kertas Struk Thermal 80mm", unit: "Roll", qty: 20, unitPrice: 6500 },
        { name: "Kertas HVS A4 80gr Sinar Dunia", unit: "Rim", qty: 3, unitPrice: 54000 },
      ],
      updateStock: false,
    });
    createOfficeExpense({
      title: "Belanja Kebutuhan Pantry & Kebersihan Kantor",
      category: "Konsumsi / Pantry",
      expenseDate: today,
      paymentMethod: "tunai",
      pic: "Staff Operasional",
      receiptNumber: "STR-IDM-4321",
      notes: "Kopi, gula, air galon, dan hand sanitizer",
      items: [
        { name: "Kopi Kapal Api Special Mix", unit: "Pack", qty: 4, unitPrice: 18000 },
        { name: "Air Mineral Galon Aqua 19L", unit: "Galon", qty: 2, unitPrice: 21000 },
        { name: "Hand Sanitizer Gel 500ml", unit: "Botol", qty: 2, unitPrice: 28000 },
      ],
      updateStock: false,
    });
  }
}
