import { db } from "./db.js";
import { buildPrepaidOrder, findCategory, findType, runInquiry } from "./catalog.js";
import { businessDate, nowIso, randomRef } from "./util.js";

export const PAYMENT_METHODS = [
  { id: "tunai", label: "Tunai" },
  { id: "qris", label: "QRIS" },
  { id: "transfer", label: "Transfer Bank" },
];

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function safeJson(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function rowToTransaction(row) {
  if (!row) return null;
  const payload = safeJson(row.payload, {});
  return {
    id: row.id,
    ref: row.ref,
    categoryId: row.category_id,
    categoryName: row.category_name,
    typeId: row.type_id,
    typeName: row.type_name,
    productId: row.product_id,
    productLabel: row.product_label,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone || null,
    amount: row.amount,
    adminFee: row.admin_fee,
    total: row.total,
    status: row.status,
    paymentMethod: row.payment_method,
    note: row.note,
    waSentAt: row.wa_sent_at,
    businessDate: row.business_date,
    createdAt: row.created_at,
    kind: payload.kind || null,
    items: payload.items || [],
    meta: payload.meta || [],
    period: payload.period || null,
    token: payload.token || null,
    serial: payload.serial || null,
  };
}

export function getTransactionByRef(ref) {
  return rowToTransaction(db.prepare("SELECT * FROM transactions WHERE ref = ?").get(ref));
}

export function getTransactionById(id) {
  return rowToTransaction(db.prepare("SELECT * FROM transactions WHERE id = ?").get(id));
}

export function getPaymentMethodLabel(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || id;
}

export function buildOrder(input) {
  const type = findType(input.categoryId, input.typeId);
  if (!type) throw new AppError(400, "Kategori atau jenis produk tidak ditemukan.");
  if (type.kind === "prepaid") return buildPrepaidOrder(input);
  return runInquiry(input);
}

function uniqueRef(date) {
  for (let i = 0; i < 10; i += 1) {
    const ref = randomRef(date);
    const exists = db.prepare("SELECT 1 FROM transactions WHERE ref = ?").get(ref);
    if (!exists) return ref;
  }
  return `PG-${Date.now()}`;
}

export function createTransaction(input) {
  const order = buildOrder(input);
  if (!order.ok) throw new AppError(400, order.message);

  const method = String(input.paymentMethod || "tunai").toLowerCase();
  if (!PAYMENT_METHODS.some((m) => m.id === method)) {
    throw new AppError(400, "Metode pembayaran tidak valid.");
  }

  const category = findCategory(order.categoryId);
  const now = new Date();
  const createdAt = now.toISOString();
  const payload = {
    kind: order.kind,
    period: order.period,
    items: order.items,
    meta: order.meta,
    token: order.token || null,
    serial: order.serial || null,
  };

  const customerPhone = input.customerPhone ? String(input.customerPhone).trim() : null;

  const info = db
    .prepare(
      `INSERT INTO transactions
        (ref, category_id, category_name, type_id, type_name, product_id, product_label,
         customer_id, customer_name, customer_phone, amount, admin_fee, total, status, payment_method,
         note, payload, business_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uniqueRef(now),
      order.categoryId,
      order.categoryName,
      order.typeId,
      order.typeName,
      order.productId,
      order.productLabel,
      order.customerId,
      order.customerName,
      customerPhone,
      order.amount,
      order.adminFee,
      order.total,
      "sukses",
      method,
      input.note ? String(input.note).slice(0, 200) : null,
      JSON.stringify(payload),
      businessDate(now),
      createdAt,
    );

  return getTransactionById(Number(info.lastInsertRowid));
}

export function markWaSent(ref) {
  const sentAt = nowIso();
  const info = db.prepare("UPDATE transactions SET wa_sent_at = ? WHERE ref = ?").run(sentAt, ref);
  if (info.changes === 0) throw new AppError(404, "Transaksi tidak ditemukan.");
  return sentAt;
}

export function buildFilters(query = {}) {
  const clauses = [];
  const params = [];

  if (query.q) {
    const term = `%${String(query.q).trim()}%`;
    clauses.push("(ref LIKE ? OR customer_id LIKE ? OR customer_name LIKE ? OR product_label LIKE ?)");
    params.push(term, term, term, term);
  }
  if (query.category && query.category !== "all") {
    clauses.push("category_id = ?");
    params.push(query.category);
  }
  if (query.type && query.type !== "all") {
    clauses.push("type_id = ?");
    params.push(query.type);
  }
  if (query.status && query.status !== "all") {
    clauses.push("status = ?");
    params.push(query.status);
  }
  if (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
    clauses.push("business_date >= ?");
    params.push(query.from);
  }
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    clauses.push("business_date <= ?");
    params.push(query.to);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export function listTransactions(query = {}) {
  const { where, params } = buildFilters(query);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 500);
  const page = Math.max(Number(query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM transactions ${where}`).get(...params).n;
  const summary = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN total ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN admin_fee ELSE 0 END), 0) AS fee,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN 1 ELSE 0 END), 0) AS success
       FROM transactions ${where}`,
    )
    .get(...params);

  const rows = db
    .prepare(`SELECT * FROM transactions ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return {
    items: rows.map(rowToTransaction),
    total,
    page,
    limit,
    pages: Math.max(Math.ceil(total / limit), 1),
    summary: {
      count: summary.count,
      revenue: summary.revenue,
      fee: summary.fee,
      success: summary.success,
      successRate: summary.count ? Math.round((summary.success / summary.count) * 1000) / 10 : 0,
    },
  };
}

function dayStats(date) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN total ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN admin_fee ELSE 0 END), 0) AS fee,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN 1 ELSE 0 END), 0) AS success
       FROM transactions WHERE business_date = ?`,
    )
    .get(date);
  return {
    ...row,
    successRate: row.count ? Math.round((row.success / row.count) * 1000) / 10 : 0,
  };
}

export function getDashboard() {
  const today = businessDate();
  const yesterday = businessDate(new Date(Date.now() - 86400000));
  const current = dayStats(today);
  const prev = dayStats(yesterday);

  const series = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = businessDate(new Date(Date.now() - i * 86400000));
    const stat = dayStats(date);
    series.push({ date, count: stat.count, revenue: stat.revenue, fee: stat.fee });
  }

  const categoryRows = db
    .prepare(
      `SELECT category_id AS categoryId, category_name AS categoryName,
              COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN total ELSE 0 END), 0) AS revenue
       FROM transactions
       WHERE business_date >= ?
       GROUP BY category_id, category_name
       ORDER BY revenue DESC`,
    )
    .all(businessDate(new Date(Date.now() - 29 * 86400000)));

  const recentRows = db
    .prepare("SELECT * FROM transactions ORDER BY created_at DESC, id DESC LIMIT 6")
    .all();

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN status = 'sukses' THEN total ELSE 0 END), 0) AS revenue
       FROM transactions`,
    )
    .get();

  const percent = (a, b) => {
    if (!b) return a ? 100 : 0;
    return Math.round(((a - b) / b) * 1000) / 10;
  };

  return {
    today: {
      ...current,
      avg: current.count ? Math.round(current.revenue / current.count) : 0,
      revenueDelta: percent(current.revenue, prev.revenue),
      countDelta: percent(current.count, prev.count),
      successDelta: Math.round((current.successRate - prev.successRate) * 10) / 10,
    },
    yesterday: prev,
    total: totalRow,
    series,
    categories: categoryRows,
    recent: recentRows.map(rowToTransaction),
  };
}

export function getAllTransactions(query = {}) {
  const { where, params } = buildFilters(query);
  const rows = db
    .prepare(`SELECT * FROM transactions ${where} ORDER BY created_at DESC, id DESC`)
    .all(...params);
  return rows.map(rowToTransaction);
}
