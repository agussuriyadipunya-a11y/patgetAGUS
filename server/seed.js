import { db, countTransactions } from "./db.js";
import { CATEGORIES, buildPrepaidOrder, findType, runInquiry } from "./catalog.js";
import { businessDate } from "./util.js";

const CUSTOMER_POOL = [
  { categoryId: "pln", typeId: "prepaid", productId: "pln-20" },
  { categoryId: "pln", typeId: "prepaid", productId: "pln-100" },
  { categoryId: "pln", typeId: "postpaid" },
  { categoryId: "pln", typeId: "postpaid" },
  { categoryId: "telkomsel", typeId: "prepaid", productId: "tsel-25" },
  { categoryId: "telkomsel", typeId: "prepaid", productId: "tsel-50" },
  { categoryId: "telkomsel", typeId: "prepaid", productId: "tsel-100" },
  { categoryId: "telkomsel", typeId: "postpaid" },
  { categoryId: "xl", typeId: "prepaid", productId: "xl-50" },
  { categoryId: "xl", typeId: "prepaid", productId: "xl-100" },
  { categoryId: "xl", typeId: "postpaid" },
  { categoryId: "internet", typeId: "postpaid", productId: "indihome" },
  { categoryId: "internet", typeId: "postpaid", productId: "biznet" },
  { categoryId: "internet", typeId: "postpaid", productId: "myrepublic" },
  { categoryId: "bpjs", typeId: "ketenagakerjaan", productId: "bpjs-bpu" },
  { categoryId: "bpjs", typeId: "ketenagakerjaan", productId: "bpjs-pu" },
  { categoryId: "bpjs", typeId: "kesehatan" },
];

const FAIL_NOTES = [
  "Gagal di provider, dana dikembalikan ke pelanggan.",
  "Timeout saat menghubungi provider, transaksi dibatalkan.",
  "Nomor tujuan sedang dalam pemeliharaan.",
];

const METHODS = ["tunai", "tunai", "tunai", "qris", "qris", "transfer"];

function randomDigits(length) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 10);
  return out;
}

function makeCustomerId(categoryId, typeId) {
  if (categoryId === "pln") {
    return typeId === "prepaid" ? `51${randomDigits(9)}` : `51${randomDigits(10)}`;
  }
  if (categoryId === "telkomsel") {
    return typeId === "prepaid" ? `0812${randomDigits(8)}` : `0813${randomDigits(8)}`;
  }
  if (categoryId === "xl") {
    return typeId === "prepaid" ? `0817${randomDigits(8)}` : `0819${randomDigits(8)}`;
  }
  if (categoryId === "internet") return `12${randomDigits(10)}`;
  if (categoryId === "bpjs" && typeId === "ketenagakerjaan") return `210${randomDigits(8)}`;
  return `000${randomDigits(10)}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateTimeForOffset(dayOffset, todayOnly = false) {
  const base = new Date();
  base.setDate(base.getDate() - dayOffset);
  const date = businessDate(base);
  let hour = 8 + Math.floor(Math.random() * 12);
  let minute = Math.floor(Math.random() * 60);

  if (todayOnly) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const [nh, nm] = parts.split(":").map(Number);
    const maxMinutes = nh * 60 + nm - 8 * 60;
    if (maxMinutes <= 30) {
      hour = Math.max(nh, 8);
      minute = Math.max(nm - Math.floor(Math.random() * 15), 0);
    } else {
      const picked = 8 * 60 + Math.floor(Math.random() * (maxMinutes - 10));
      hour = Math.floor(picked / 60);
      minute = picked % 60;
    }
  }

  const iso = `${date}T${pad(hour)}:${pad(minute)}:00+07:00`;
  return { iso, date };
}

function buildDemoOrder(entry) {
  const customerId = makeCustomerId(entry.categoryId, entry.typeId);
  const type = findType(entry.categoryId, entry.typeId);
  const productId = entry.productId || type.products[0].id;
  const input = { categoryId: entry.categoryId, typeId: entry.typeId, productId, customerId };
  if (type.kind === "prepaid") return buildPrepaidOrder(input);
  return runInquiry(input);
}

export function seedDemoTransactions() {
  if (countTransactions() > 0) return 0;

  const insert = db.prepare(
    `INSERT INTO transactions
      (ref, category_id, category_name, type_id, type_name, product_id, product_label,
       customer_id, customer_name, amount, admin_fee, total, status, payment_method,
       note, payload, wa_sent_at, business_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const totalRows = 96;
  let inserted = 0;

  for (let i = 0; i < totalRows; i += 1) {
    const entry = CUSTOMER_POOL[Math.floor(Math.random() * CUSTOMER_POOL.length)];
    const order = buildDemoOrder(entry);
    if (!order.ok) continue;

    const isToday = i < 14;
    const dayOffset = isToday ? 0 : 1 + Math.floor(Math.random() * 20);
    const { iso, date } = dateTimeForOffset(dayOffset, isToday);
    const success = Math.random() > 0.085;
    const status = success ? "sukses" : "gagal";
    const note = success ? null : FAIL_NOTES[Math.floor(Math.random() * FAIL_NOTES.length)];
    const method = METHODS[Math.floor(Math.random() * METHODS.length)];
    const waSent = success && Math.random() > 0.62
      ? new Date(new Date(iso).getTime() + 60000 * (1 + Math.floor(Math.random() * 5))).toISOString()
      : null;

    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const ref = `PG-${date.replaceAll("-", "")}-${rand}`;
    const payload = {
      kind: order.kind,
      period: order.period,
      items: order.items,
      meta: order.meta,
      token: order.token || null,
      serial: order.serial || null,
    };

    try {
      insert.run(
        ref,
        order.categoryId,
        order.categoryName,
        order.typeId,
        order.typeName,
        order.productId,
        order.productLabel,
        order.customerId,
        order.customerName,
        order.amount,
        order.adminFee,
        order.total,
        status,
        method,
        note,
        JSON.stringify(payload),
        waSent,
        date,
        iso,
      );
      inserted += 1;
    } catch {
      // lewati duplikat referensi
    }
  }

  return inserted;
}

export function catalogSummary() {
  return CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    types: c.types.map((t) => ({ id: t.id, name: t.name, products: t.products.length })),
  }));
}
