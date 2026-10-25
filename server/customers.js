import { db } from "./db.js";
import { AppError } from "./transactions.js";
import { nowIso } from "./util.js";
import { saveCloudRecord, deleteCloudRecord } from "./firebase.js";

function normalizeCustomerPhone(phone) {
  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!digits.startsWith("62")) digits = `62${digits}`;
  return digits;
}

export function listCustomers(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (query.q) {
    const term = `%${String(query.q).trim()}%`;
    clauses.push("(name LIKE ? OR phone LIKE ? OR customer_no LIKE ? OR address LIKE ?)");
    params.push(term, term, term, term);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers ${where}`).get(...params).n;

  const items = db
    .prepare(`SELECT * FROM customers ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}

export function getAllCustomers() {
  return db.prepare("SELECT * FROM customers ORDER BY name ASC").all();
}

export function getCustomerById(id) {
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
  if (!row) throw new AppError(404, "Data pelanggan tidak ditemukan.");
  return row;
}

export function createCustomer(input = {}) {
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  if (!name) throw new AppError(400, "Nama pelanggan wajib diisi.");
  if (!phone) throw new AppError(400, "Nomor telepon / WhatsApp wajib diisi.");

  const normalizedPhone = normalizeCustomerPhone(phone);
  if (normalizedPhone.length < 10 || normalizedPhone.length > 16) {
    throw new AppError(400, "Nomor telepon tidak valid. Gunakan format 08xx atau 62xx.");
  }

  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO customers (name, phone, email, address, customer_no, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      normalizedPhone,
      input.email ? String(input.email).trim() : null,
      input.address ? String(input.address).trim() : null,
      input.customerNo ? String(input.customerNo).trim() : (input.customer_no ? String(input.customer_no).trim() : null),
      input.notes ? String(input.notes).trim() : null,
      now,
      now,
    );

  const cust = getCustomerById(Number(info.lastInsertRowid));
  if (cust) saveCloudRecord("customers", cust.id, cust);
  return cust;
}

export function updateCustomer(id, input = {}) {
  const existing = getCustomerById(id);
  const name = input.name !== undefined ? String(input.name).trim() : existing.name;
  const rawPhone = input.phone !== undefined ? String(input.phone).trim() : existing.phone;
  if (!name) throw new AppError(400, "Nama pelanggan wajib diisi.");
  if (!rawPhone) throw new AppError(400, "Nomor telepon / WhatsApp wajib diisi.");

  const phone = normalizeCustomerPhone(rawPhone);
  const now = nowIso();

  db.prepare(
    `UPDATE customers
     SET name = ?, phone = ?, email = ?, address = ?, customer_no = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    name,
    phone,
    input.email !== undefined ? (input.email ? String(input.email).trim() : null) : existing.email,
    input.address !== undefined ? (input.address ? String(input.address).trim() : null) : existing.address,
    input.customerNo !== undefined
      ? (input.customerNo ? String(input.customerNo).trim() : null)
      : (input.customer_no !== undefined ? (input.customer_no ? String(input.customer_no).trim() : null) : existing.customer_no),
    input.notes !== undefined ? (input.notes ? String(input.notes).trim() : null) : existing.notes,
    now,
    id,
  );

  const updated = getCustomerById(id);
  if (updated) saveCloudRecord("customers", updated.id, updated);
  return updated;
}

export function deleteCustomer(id) {
  getCustomerById(id);
  db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  deleteCloudRecord("customers", id);
  return { ok: true, message: "Pelanggan berhasil dihapus." };
}

export function seedDefaultCustomers() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
  if (count > 0) return 0;

  const samples = [
    { name: "Budi Santoso", phone: "081234567890", email: "budi.santoso@email.com", address: "Jl. Diponegoro No. 12, Bandung", customer_no: "51234567890", notes: "Pelanggan tetap token PLN" },
    { name: "Siti Aminah", phone: "081298765432", email: "siti.aminah@email.com", address: "Jl. Cihampelas No. 45, Bandung", customer_no: "126461645343", notes: "Langganan internet IndiHome" },
    { name: "Agus Pratama", phone: "082328814478", email: "agus.pratama@email.com", address: "Jl. Asia Afrika No. 88, Bandung", customer_no: "0007890323608", notes: "Peserta BPJS Kesehatan" },
    { name: "Dewi Lestari", phone: "081921814663", email: "dewi.lestari@email.com", address: "Jl. Buah Batu No. 101, Bandung", customer_no: "081921814663", notes: "Pelanggan XL Prioritas" },
    { name: "Rizky Ramadhan", phone: "081260759851", email: "rizky.r@email.com", address: "Jl. Dago Atas No. 23, Bandung", customer_no: "51659563705", notes: "Sering beli pulsa Telkomsel" },
  ];

  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO customers (name, phone, email, address, customer_no, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const s of samples) {
    insert.run(s.name, normalizeCustomerPhone(s.phone), s.email, s.address, s.customer_no, s.notes, now, now);
  }

  return samples.length;
}
