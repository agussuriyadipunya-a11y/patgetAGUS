import { hashString, monthName, pick } from "./util.js";

const NAMES = [
  "BUDI SANTOSO",
  "SITI AMINAH",
  "AGUS PRATAMA",
  "DEWI LESTARI",
  "RIZKY RAMADHAN",
  "NUR HIDAYAH",
  "FAJAR NUGROHO",
  "RINA WULANDARI",
  "HENDRA GUNAWAN",
  "MAYA PUTRI",
  "ANDI SAPUTRA",
  "LILIS SURYANI",
  "DIMAS ARDIANSYAH",
  "PUTRI AYU",
  "WAHYU SETIAWAN",
  "EKA RAHAYU",
  "TEGUH FIRMANSYAH",
  "INDAH PERMATASARI",
  "BAYU KURNIAWAN",
  "RATNA DEWI",
];

const PLN_TARIFFS = ["R1 / 1300 VA", "R1 / 2200 VA", "B1 / 4500 VA", "R2 / 3500 VA"];

const INTERNET_PACKAGES = {
  indihome: ["IndiHome 30 Mbps", "IndiHome 50 Mbps", "IndiHome 100 Mbps"],
  biznet: ["Biznet Home 50 Mbps", "Biznet Home 100 Mbps", "Biznet Home 300 Mbps"],
  myrepublic: ["MyRepublic 50 Mbps", "MyRepublic 100 Mbps", "MyRepublic 300 Mbps"],
  firstmedia: ["First Media 75 Mbps", "First Media 150 Mbps", "First Media 300 Mbps"],
};

const PREPAID_FIELD = {
  key: "customerId",
  label: "Nomor Tujuan",
  placeholder: "Contoh: 081234567890",
  hint: "Masukkan nomor HP aktif yang akan diisi.",
  inputMode: "tel",
  maxlength: 16,
};

export const CATEGORIES = [
  {
    id: "pln",
    name: "PLN",
    fullName: "Perusahaan Listrik Negara",
    tagline: "Token listrik & tagihan bulanan",
    icon: "bolt",
    color: "#f59e0b",
    types: [
      {
        id: "prepaid",
        name: "Prabayar",
        label: "Token Listrik",
        kind: "prepaid",
        description: "Isi ulang token listrik prabayar secara instan.",
        field: {
          key: "customerId",
          label: "ID Meter / Nomor Pelanggan",
          placeholder: "Contoh: 51234567890",
          hint: "11–12 digit ID meter yang tertera pada kWh meter.",
          inputMode: "numeric",
          maxlength: 14,
        },
        products: [
          { id: "pln-20", name: "Token 20.000", price: 20000, adminFee: 1600, desc: "± 13,7 kWh" },
          { id: "pln-50", name: "Token 50.000", price: 50000, adminFee: 1600, desc: "± 34,3 kWh" },
          { id: "pln-100", name: "Token 100.000", price: 100000, adminFee: 1600, desc: "± 68,6 kWh" },
          { id: "pln-200", name: "Token 200.000", price: 200000, adminFee: 1600, desc: "± 137,3 kWh" },
          { id: "pln-500", name: "Token 500.000", price: 500000, adminFee: 1600, desc: "± 343,2 kWh" },
          { id: "pln-1000", name: "Token 1.000.000", price: 1000000, adminFee: 1600, desc: "± 686,5 kWh" },
        ],
      },
      {
        id: "postpaid",
        name: "Pascabayar",
        label: "Tagihan Listrik",
        kind: "postpaid",
        description: "Cek dan bayar tagihan listrik bulanan.",
        field: {
          key: "customerId",
          label: "ID Pelanggan (12 digit)",
          placeholder: "Contoh: 512345678901",
          hint: "ID pelanggan dapat dilihat pada struk PLN sebelumnya.",
          inputMode: "numeric",
          maxlength: 14,
        },
        products: [{ id: "pln-bill", name: "Tagihan Listrik PLN", adminFee: 2500 }],
      },
    ],
  },
  {
    id: "telkomsel",
    name: "Telkomsel",
    fullName: "Telkomsel",
    tagline: "Pulsa Simpati / AS & kartuHalo",
    icon: "signal",
    color: "#e11d48",
    types: [
      {
        id: "prepaid",
        name: "Prabayar",
        label: "Simpati / As",
        kind: "prepaid",
        description: "Isi pulsa Telkomsel prabayar untuk semua nomor.",
        field: { ...PREPAID_FIELD },
        products: [
          { id: "tsel-10", name: "Pulsa 10.000", price: 10000, adminFee: 1200, desc: "Masa aktif +7 hari" },
          { id: "tsel-15", name: "Pulsa 15.000", price: 15000, adminFee: 1200, desc: "Masa aktif +7 hari" },
          { id: "tsel-25", name: "Pulsa 25.000", price: 25000, adminFee: 1200, desc: "Masa aktif +15 hari" },
          { id: "tsel-50", name: "Pulsa 50.000", price: 50000, adminFee: 1200, desc: "Masa aktif +30 hari" },
          { id: "tsel-100", name: "Pulsa 100.000", price: 100000, adminFee: 1200, desc: "Masa aktif +60 hari" },
          { id: "tsel-150", name: "Pulsa 150.000", price: 150000, adminFee: 1200, desc: "Masa aktif +90 hari" },
          { id: "tsel-200", name: "Pulsa 200.000", price: 200000, adminFee: 1200, desc: "Masa aktif +90 hari" },
          { id: "tsel-300", name: "Pulsa 300.000", price: 300000, adminFee: 1200, desc: "Masa aktif +120 hari" },
        ],
      },
      {
        id: "postpaid",
        name: "Pascabayar",
        label: "KartuHalo",
        kind: "postpaid",
        description: "Cek dan bayar tagihan kartuHalo Telkomsel.",
        field: {
          key: "customerId",
          label: "Nomor KartuHalo",
          placeholder: "Contoh: 081234567890",
          hint: "Gunakan nomor kartuHalo yang terdaftar.",
          inputMode: "tel",
          maxlength: 16,
        },
        products: [{ id: "tsel-halo", name: "Tagihan Telkomsel Halo", adminFee: 2000 }],
      },
    ],
  },
  {
    id: "xl",
    name: "XL",
    fullName: "XL Axiata",
    tagline: "Pulsa XL & kartu Prioritas",
    icon: "grid",
    color: "#2563eb",
    types: [
      {
        id: "prepaid",
        name: "Prabayar",
        label: "XL Prabayar",
        kind: "prepaid",
        description: "Isi pulsa XL prabayar dengan nominal bebas.",
        field: { ...PREPAID_FIELD },
        products: [
          { id: "xl-10", name: "Pulsa 10.000", price: 10000, adminFee: 1200, desc: "Masa aktif +7 hari" },
          { id: "xl-25", name: "Pulsa 25.000", price: 25000, adminFee: 1200, desc: "Masa aktif +15 hari" },
          { id: "xl-50", name: "Pulsa 50.000", price: 50000, adminFee: 1200, desc: "Masa aktif +30 hari" },
          { id: "xl-100", name: "Pulsa 100.000", price: 100000, adminFee: 1200, desc: "Masa aktif +60 hari" },
          { id: "xl-150", name: "Pulsa 150.000", price: 150000, adminFee: 1200, desc: "Masa aktif +90 hari" },
          { id: "xl-200", name: "Pulsa 200.000", price: 200000, adminFee: 1200, desc: "Masa aktif +90 hari" },
        ],
      },
      {
        id: "postpaid",
        name: "Pascabayar",
        label: "XL Prioritas",
        kind: "postpaid",
        description: "Cek dan bayar tagihan XL Prioritas.",
        field: {
          key: "customerId",
          label: "Nomor XL Prioritas",
          placeholder: "Contoh: 081234567890",
          hint: "Gunakan nomor yang terdaftar pada kartu Prioritas.",
          inputMode: "tel",
          maxlength: 16,
        },
        products: [{ id: "xl-priority", name: "Tagihan XL Prioritas", adminFee: 2000 }],
      },
    ],
  },
  {
    id: "internet",
    name: "Internet",
    fullName: "Internet Rumah",
    tagline: "IndiHome, Biznet, MyRepublic & First Media",
    icon: "wifi",
    color: "#0d9488",
    types: [
      {
        id: "postpaid",
        name: "Pascabayar",
        label: "Tagihan Internet",
        kind: "postpaid",
        description: "Bayar tagihan internet rumah dari berbagai penyedia.",
        field: {
          key: "customerId",
          label: "Nomor Pelanggan / ID Internet",
          placeholder: "Contoh: 122345678901",
          hint: "Nomor pelanggan tertera pada invoice bulanan.",
          inputMode: "numeric",
          maxlength: 20,
        },
        products: [
          { id: "indihome", name: "IndiHome", adminFee: 2500, desc: "Telkom Indonesia" },
          { id: "biznet", name: "Biznet Home", adminFee: 2500, desc: "Biznet Networks" },
          { id: "myrepublic", name: "MyRepublic", adminFee: 2500, desc: "MyRepublic ID" },
          { id: "firstmedia", name: "First Media", adminFee: 2500, desc: "Link Net" },
        ],
      },
    ],
  },
  {
    id: "bpjs",
    name: "BPJS",
    fullName: "BPJS Ketenagakerjaan & Kesehatan",
    tagline: "Iuran BPU, PU & BPJS Kesehatan",
    icon: "shield",
    color: "#059669",
    types: [
      {
        id: "ketenagakerjaan",
        name: "Ketenagakerjaan",
        label: "BPU / PU",
        kind: "postpaid",
        description: "Bayar iuran BPJS Ketenagakerjaan BPU atau PU.",
        field: {
          key: "customerId",
          label: "Nomor Kartu / VA (11 digit)",
          placeholder: "Contoh: 21012345678",
          hint: "Masukkan nomor kartu peserta atau virtual account.",
          inputMode: "numeric",
          maxlength: 16,
        },
        products: [
          { id: "bpjs-bpu", name: "BPU (Bukan Penerima Upah)", adminFee: 2500, desc: "Iuran per bulan" },
          { id: "bpjs-pu", name: "PU (Penerima Upah)", adminFee: 2500, desc: "Iuran pekerja" },
        ],
      },
      {
        id: "kesehatan",
        name: "Kesehatan",
        label: "BPJS Kesehatan",
        kind: "postpaid",
        description: "Bayar iuran BPJS Kesehatan keluarga.",
        field: {
          key: "customerId",
          label: "Nomor Kartu / VA (13 digit)",
          placeholder: "Contoh: 0001234567890",
          hint: "Gunakan nomor kartu BPJS Kesehatan atau VA.",
          inputMode: "numeric",
          maxlength: 18,
        },
        products: [{ id: "bpjs-kes", name: "Iuran BPJS Kesehatan", adminFee: 2500 }],
      },
    ],
  },
];

export function getCatalog() {
  return CATEGORIES;
}

export function findCategory(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId) || null;
}

export function findType(categoryId, typeId) {
  const cat = findCategory(categoryId);
  if (!cat) return null;
  return cat.types.find((t) => t.id === typeId) || null;
}

export function findProduct(categoryId, typeId, productId) {
  const type = findType(categoryId, typeId);
  if (!type) return null;
  return type.products.find((p) => p.id === productId) || null;
}

export function validateCustomerId(type, rawValue) {
  const value = String(rawValue || "").replace(/\s|-/g, "");
  if (!value) {
    return { ok: false, message: `${type.field.label} wajib diisi.` };
  }
  if (value.length < 4 || value.length > 24) {
    return { ok: false, message: `${type.field.label} tidak valid.` };
  }
  const digitsOnly = /^\d+$/.test(value);

  if (type.id === "prepaid") {
    if (!digitsOnly) return { ok: false, message: "Nomor tujuan hanya boleh berisi angka." };
    if (type.field.inputMode === "tel") {
      if (!/^(08|628)\d{7,12}$/.test(value)) {
        return { ok: false, message: "Nomor HP harus diawali 08 atau 628 (10–14 digit)." };
      }
    }
    return { ok: true, value };
  }

  if (type.id === "postpaid") {
    if (!digitsOnly) return { ok: false, message: `${type.field.label} hanya boleh berisi angka.` };
    if (type.field.inputMode === "tel") {
      if (!/^(08|628)\d{7,12}$/.test(value)) {
        return { ok: false, message: "Nomor pelanggan harus diawali 08 atau 628." };
      }
    }
    return { ok: true, value };
  }

  if (type.id === "ketenagakerjaan" && !/^\d{11,16}$/.test(value)) {
    return { ok: false, message: "Nomor kartu/VA BPJS Ketenagakerjaan harus 11–16 digit." };
  }
  if (type.id === "kesehatan" && !/^\d{13,16}$/.test(value)) {
    return { ok: false, message: "Nomor kartu/VA BPJS Kesehatan harus 13–16 digit." };
  }
  if (type.field.inputMode === "numeric" && !digitsOnly) {
    return { ok: false, message: `${type.field.label} hanya boleh berisi angka.` };
  }
  return { ok: true, value };
}

function nameFor(seed) {
  return pick(NAMES, seed);
}

function round500(n) {
  return Math.round(n / 500) * 500;
}

function makeToken(seed) {
  let value = seed || 987654321;
  let token = "";
  for (let i = 0; i < 20; i += 1) {
    value = (Math.imul(value, 1103515245) + 12345) >>> 0;
    token += String(value % 10);
  }
  return token;
}

function makeSerial(seed) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = seed || 123456789;
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    out += chars[value % chars.length];
  }
  return out;
}

function dueDate(days = 10) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Simulasi inquiry tagihan pascabayar.
 * Semua data dihasilkan deterministik dari ID pelanggan sehingga hasil
 * pengecekan dan pembayaran selalu konsisten.
 */
export function runInquiry({ categoryId, typeId, productId, customerId }) {
  const category = findCategory(categoryId);
  const type = findType(categoryId, typeId);
  if (!category || !type) {
    return { ok: false, message: "Produk tidak ditemukan." };
  }
  if (!type.kind || type.kind !== "postpaid") {
    return { ok: false, message: "Produk ini tidak memerlukan pengecekan tagihan." };
  }
  const validation = validateCustomerId(type, customerId);
  if (!validation.ok) return validation;

  const product = type.products.find((p) => p.id === productId) || type.products[0];
  if (!product) return { ok: false, message: "Produk tidak ditemukan." };

  const value = validation.value;
  const seed = hashString(`${categoryId}:${typeId}:${product.id}:${value}`);
  const customerName = nameFor(seed);
  const period = monthName();
  const meta = [];
  const items = [];
  let amount = 0;

  if (categoryId === "pln") {
    amount = round500(120000 + (seed % 420) * 1000);
    items.push({ label: `Tagihan listrik ${period}`, amount });
    meta.push({ label: "Tarif / Daya", value: pick(PLN_TARIFFS, seed) });
    meta.push({
      label: "Stand Meter",
      value: `${String(10000 + (seed % 8000)).padStart(6, "0")} - ${String(10200 + (seed % 8000)).padStart(6, "0")}`,
    });
    meta.push({ label: "Periode", value: period });
    meta.push({ label: "Jatuh Tempo", value: dueDate(12) });
  } else if (categoryId === "telkomsel") {
    amount = round500(95000 + (seed % 240) * 1000);
    items.push({ label: `Tagihan kartuHalo ${period}`, amount });
    meta.push({ label: "Paket", value: pick(["Halo Platinum", "Halo Gold", "Halo Silver"], seed) });
    meta.push({ label: "Periode", value: period });
    meta.push({ label: "Jatuh Tempo", value: dueDate(10) });
  } else if (categoryId === "xl") {
    amount = round500(70000 + (seed % 220) * 1000);
    items.push({ label: `Tagihan XL Prioritas ${period}`, amount });
    meta.push({ label: "Paket", value: pick(["Prioritas Platinum", "Prioritas Gold", "Prioritas Silver"], seed) });
    meta.push({ label: "Periode", value: period });
    meta.push({ label: "Jatuh Tempo", value: dueDate(10) });
  } else if (categoryId === "internet") {
    const packages = INTERNET_PACKAGES[product.id] || ["Paket Internet Rumah"];
    const pkg = pick(packages, seed);
    amount = round500(280000 + (seed % 380) * 1000);
    items.push({ label: `Tagihan internet ${period}`, amount });
    meta.push({ label: "Penyedia", value: product.name });
    meta.push({ label: "Paket", value: pkg });
    meta.push({ label: "Periode", value: period });
    meta.push({ label: "Jatuh Tempo", value: dueDate(10) });
  } else if (categoryId === "bpjs" && typeId === "ketenagakerjaan") {
    if (product.id === "bpjs-bpu") {
      amount = 50000;
      items.push({ label: `Iuran BPU ${period}`, amount });
      meta.push({ label: "Program", value: "BPU (Bukan Penerima Upah)" });
      meta.push({ label: "Iuran / bulan", value: "Rp 50.000" });
    } else {
      amount = 116800;
      items.push({ label: `Iuran PU ${period}`, amount });
      meta.push({ label: "Program", value: "PU (Penerima Upah)" });
      meta.push({ label: "Iuran / bulan", value: "Rp 116.800" });
    }
    meta.push({ label: "Periode", value: period });
  } else if (categoryId === "bpjs" && typeId === "kesehatan") {
    const members = 1 + (seed % 4);
    const cls = pick(
      [
        { name: "Kelas 3", rate: 35000 },
        { name: "Kelas 2", rate: 100000 },
        { name: "Kelas 1", rate: 150000 },
      ],
      seed,
    );
    amount = cls.rate * members;
    items.push({ label: `Iuran ${cls.name} — ${members} peserta`, amount });
    meta.push({ label: "Kelas", value: cls.name });
    meta.push({ label: "Jumlah Peserta", value: `${members} orang` });
    meta.push({ label: "Periode", value: period });
    meta.push({ label: "Jatuh Tempo", value: dueDate(15) });
  } else {
    return { ok: false, message: "Jenis tagihan tidak dikenali." };
  }

  const adminFee = product.adminFee || 0;
  return {
    ok: true,
    categoryId,
    categoryName: category.name,
    typeId,
    typeName: type.label,
    kind: "postpaid",
    productId: product.id,
    productLabel: product.name,
    customerId: value,
    customerName,
    amount,
    adminFee,
    total: amount + adminFee,
    items,
    meta,
    period,
  };
}

/** Susun order prabayar (harga produk dihitung di server). */
export function buildPrepaidOrder({ categoryId, typeId, productId, customerId }) {
  const category = findCategory(categoryId);
  const type = findType(categoryId, typeId);
  if (!category || !type) return { ok: false, message: "Produk tidak ditemukan." };
  if (type.kind !== "prepaid") {
    return { ok: false, message: "Produk ini bukan produk prabayar." };
  }
  const validation = validateCustomerId(type, customerId);
  if (!validation.ok) return validation;
  const product = type.products.find((p) => p.id === productId);
  if (!product) return { ok: false, message: "Nominal pulsa/token tidak ditemukan." };

  const value = validation.value;
  const seed = hashString(`${categoryId}:${typeId}:${product.id}:${value}`);
  const isPhone = type.field.inputMode === "tel";
  const items = [{ label: product.name, amount: product.price }];
  const meta = [];

  if (isPhone) {
    const prefix = value.slice(0, 4);
    meta.push({ label: "Operator", value: category.name });
    meta.push({ label: "Nomor Tujuan", value });
    meta.push({ label: "Prefix", value: prefix });
  } else {
    meta.push({ label: "ID Meter", value });
    meta.push({ label: "Estimasi kWh", value: product.desc?.replace("± ", "") || "-" });
  }

  const result = {
    ok: true,
    categoryId,
    categoryName: category.name,
    typeId,
    typeName: type.label,
    kind: "prepaid",
    productId: product.id,
    productLabel: product.name,
    customerId: value,
    customerName: isPhone ? "Nomor Prabayar" : nameFor(seed),
    amount: product.price,
    adminFee: product.adminFee || 0,
    total: product.price + (product.adminFee || 0),
    items,
    meta,
    period: monthName(),
  };

  if (categoryId === "pln") {
    result.token = makeToken(seed);
    meta.unshift({ label: "Token", value: result.token });
  } else {
    result.serial = makeSerial(seed);
    meta.unshift({ label: "Serial Number", value: result.serial });
  }

  return result;
}
