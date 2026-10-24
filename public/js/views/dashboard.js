import { api } from "../api.js";
import { icon, categoryIcon } from "../icons.js";
import { categoryColor, state } from "../store.js";
import {
  compactRupiah,
  escapeHtml,
  fmtDate,
  fmtDateTime,
  fmtWeekday,
  greeting,
  num,
  percent,
  rp,
  statusBadge,
} from "../ui.js";
import { openTransactionDetail } from "../receipt-modal.js";

function deltaBadge(value, suffix = "%") {
  const n = Number(value) || 0;
  const tone = n > 0 ? "" : n < 0 ? "down" : "flat";
  const arrow = n > 0 ? "trendUp" : n < 0 ? "trendDown" : "dot";
  return `<span class="delta ${tone}">${icon(arrow, 12)}${n > 0 ? "+" : ""}${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}${suffix}</span>`;
}

function drawRevenueChart(canvas, series) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  const width = Math.max(parent.clientWidth, 280);
  const height = Math.max(parent.clientHeight, 200);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue("--primary").trim() || "#4f46e5";
  const muted = styles.getPropertyValue("--muted-2").trim() || "#94a3b8";
  const text = styles.getPropertyValue("--text").trim() || "#0f172a";
  const border = styles.getPropertyValue("--border").trim() || "#e7eaf3";

  const pad = { top: 28, right: 10, bottom: 30, left: 54 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...series.map((s) => Number(s.revenue) || 0), 1);
  const step = innerW / series.length;
  const barW = Math.min(step * 0.5, 46);

  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 3; i += 1) {
    const y = pad.top + (innerH * i) / 3;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.fillText(compactRupiah(max * (1 - i / 3)), pad.left - 9, y);
  }

  series.forEach((item, index) => {
    const revenue = Number(item.revenue) || 0;
    const x = pad.left + step * index + step / 2;
    const barH = (revenue / max) * innerH;
    const y = pad.top + innerH - barH;
    const isToday = index === series.length - 1;

    const gradient = ctx.createLinearGradient(0, y, 0, pad.top + innerH);
    gradient.addColorStop(0, primary);
    gradient.addColorStop(1, `${primary}33`);

    ctx.fillStyle = gradient;
    ctx.globalAlpha = isToday ? 1 : 0.72;
    const radius = Math.min(barW / 2, 7);
    const left = x - barW / 2;
    const top = Math.max(y, pad.top);
    const h = Math.max(barH, revenue > 0 ? 3 : 0);
    ctx.beginPath();
    ctx.moveTo(left, pad.top + innerH);
    ctx.lineTo(left, top + radius);
    ctx.quadraticCurveTo(left, top, left + radius, top);
    ctx.lineTo(left + barW - radius, top);
    ctx.quadraticCurveTo(left + barW, top, left + barW, top + radius);
    ctx.lineTo(left + barW, pad.top + innerH);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    if (revenue > 0) {
      ctx.fillStyle = text;
      ctx.font = '600 9.5px "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(compactRupiah(revenue).replace("Rp ", ""), x, Math.max(top - 9, 10));
    }

    ctx.fillStyle = muted;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`${fmtWeekday(item.date)} ${String(item.date).slice(8)}`, x, height - 12);
  });
}

export async function renderDashboard(container) {
  container.innerHTML = `<div class="loading-block"><span class="spinner"></span><span>Memuat ringkasan…</span></div>`;

  let data;
  let wa;
  try {
    [data, wa] = await Promise.all([
      api.get("/dashboard"),
      api.get("/wa/status").catch(() => null),
    ]);
  } catch (error) {
    container.innerHTML = `
      <div class="page">
        <div class="card card-pad">
          <div class="empty-state">
            <div class="empty-icon">${icon("alert", 26)}</div>
            <h3>Gagal memuat dashboard</h3>
            <p>${escapeHtml(error.message || "Terjadi kesalahan.")}</p>
            <div class="empty-action"><button class="btn btn-primary" id="retryDashboard">Coba lagi</button></div>
          </div>
        </div>
      </div>`;
    container.querySelector("#retryDashboard")?.addEventListener("click", () => renderDashboard(container));
    return;
  }

  state.wa = wa;
  const today = data.today;
  const categories = state.categories.length ? state.categories : [];
  const maxCategoryRevenue = Math.max(...data.categories.map((c) => c.revenue), 1);
  const recent = data.recent || [];

  const waConnected = wa?.status === "connected";
  const waLabel = waConnected ? `Terhubung · ${wa.me?.number || ""}` : "WhatsApp belum terhubung";
  const waNumber = waConnected ? (wa.me?.name && wa.me.name !== wa.me.number ? wa.me.name : "Perangkat aktif") : "Hubungkan untuk kirim resi otomatis";

  const categoryRows = data.categories.length
    ? data.categories.map((cat) => {
        const color = categoryColor(cat.categoryId);
        const width = Math.max((cat.revenue / maxCategoryRevenue) * 100, cat.revenue ? 4 : 0);
        return `
          <div class="cat-row" style="--cat-color:${color}">
            <div class="cat-row-top">
              <strong><i class="cat-dot"></i>${escapeHtml(cat.categoryName)}</strong>
              <span>${num(cat.count)} trx · ${rp(cat.revenue)}</span>
            </div>
            <div class="progress"><i style="width:${width}%"></i></div>
          </div>`;
      }).join("")
    : `<div class="empty-state" style="padding:24px 8px"><p>Belum ada transaksi dalam 30 hari terakhir.</p></div>`;

  const recentRows = recent.length
    ? recent.map((trx) => `
        <tr data-trx="${escapeHtml(trx.ref)}">
          <td>
            <span class="cell-ref">${escapeHtml(trx.ref)}</span>
            <span class="cell-sub">${escapeHtml(fmtDateTime(trx.createdAt))}</span>
          </td>
          <td>
            <span class="cell-customer"><strong>${escapeHtml(trx.productLabel)}</strong><span>${escapeHtml(trx.categoryName)} · ${escapeHtml(trx.customerId)}</span></span>
          </td>
          <td class="cell-total">${rp(trx.total)}</td>
          <td>${statusBadge(trx.status)}</td>
        </tr>`).join("")
    : `<tr><td colspan="4"><div class="empty-state" style="padding:30px 10px"><p>Belum ada transaksi hari ini.</p></div></td></tr>`;

  const quickButtons = categories.map((cat) => `
    <a class="quick-btn" href="#/menu/${cat.id}" style="--cat-color:${categoryColor(cat.id)}">
      ${icon(categoryIcon[cat.id] || "grid", 17)}<span>${escapeHtml(cat.name)}</span>
    </a>`).join("");

  const total7 = data.series.reduce((sum, item) => sum + item.revenue, 0);

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h2>${greeting()}, ${escapeHtml(state.user?.username || "Admin")} 👋</h2>
          <p>${escapeHtml(fmtDate(new Date(), { weekday: true, long: true }))} · Pantau performa kios pembayaran Anda secara realtime.</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-ghost" href="#/riwayat">${icon("history", 17)} Riwayat</a>
          <a class="btn btn-primary" href="#/menu/pln">${icon("plus", 17)} Transaksi Baru</a>
        </div>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-icon tone-success">${icon("wallet", 19)}</span>
            ${deltaBadge(today.revenueDelta)}
          </div>
          <div class="stat-label">Pendapatan hari ini</div>
          <div class="stat-value">${rp(today.revenue)}</div>
          <div class="stat-foot">Rata-rata ${rp(today.avg)} / transaksi</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-icon">${icon("receipt", 19)}</span>
            ${deltaBadge(today.countDelta)}
          </div>
          <div class="stat-label">Transaksi hari ini</div>
          <div class="stat-value">${num(today.count)}</div>
          <div class="stat-foot">${num(today.success)} sukses · ${num(today.count - today.success)} gagal</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-icon tone-warning">${icon("creditCard", 19)}</span>
            <span class="delta flat">${icon("info", 12)} Hari ini</span>
          </div>
          <div class="stat-label">Biaya admin terkumpul</div>
          <div class="stat-value">${rp(today.fee)}</div>
          <div class="stat-foot">Pendapatan bersih kios</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-icon tone-info">${icon("shieldCheck", 19)}</span>
            ${deltaBadge(today.successDelta, " pts")}
          </div>
          <div class="stat-label">Tingkat keberhasilan</div>
          <div class="stat-value">${today.successRate.toLocaleString("id-ID")}%</div>
          <div class="stat-foot">${num(today.success)} dari ${num(today.count)} transaksi</div>
        </article>
      </div>

      <div class="dash-grid">
        <section class="card chart-card">
          <div class="card-head">
            <div>
              <h3>Pendapatan 7 hari terakhir</h3>
              <p>Akumulasi transaksi sukses per hari</p>
            </div>
            <span class="badge badge-info">${icon("trendUp", 12)} ${rp(total7)}</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap"><canvas id="revenueChart" aria-label="Grafik pendapatan 7 hari"></canvas></div>
            <div class="chart-legend">
              <span class="legend-item"><i class="legend-swatch"></i> Pendapatan sukses</span>
              <span class="legend-item"><i class="legend-swatch muted"></i> Total ${num(data.total.count)} transaksi tercatat</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>Kategori terpopuler</h3>
              <p>30 hari terakhir</p>
            </div>
            <a class="btn-link" href="#/riwayat">Detail</a>
          </div>
          <div class="card-body">
            <div class="category-list">${categoryRows}</div>
          </div>
        </section>
      </div>

      <div class="dash-grid dash-grid-2">
        <section class="card">
          <div class="card-head">
            <div>
              <h3>Transaksi terbaru</h3>
              <p>6 transaksi terakhir di kios Anda</p>
            </div>
            <a class="btn-link" href="#/riwayat">Lihat semua</a>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Transaksi</th><th>Produk</th><th class="right">Total</th><th>Status</th></tr></thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
        </section>

        <div class="stack-16">
          <section class="card">
            <div class="card-head">
              <div><h3>Akses cepat</h3><p>Mulai transaksi baru</p></div>
            </div>
            <div class="card-body">
              <div class="quick-grid">${quickButtons || `<span class="hint">Katalog belum dimuat.</span>`}</div>
            </div>
          </section>

          <section class="card card-pad">
            <div class="wa-mini">
              <span class="wa-mini-icon">${icon("whatsapp", 18)}</span>
              <div class="wa-mini-text">
                <strong>${waConnected ? "WhatsApp terhubung" : "WhatsApp belum terhubung"}</strong>
                <span>${escapeHtml(waConnected ? waNumber : waLabel)}</span>
              </div>
              <a class="btn btn-soft" href="#/whatsapp">${waConnected ? "Kelola" : "Hubungkan"}</a>
            </div>
          </section>
        </div>
      </div>
    </div>`;

  const canvas = container.querySelector("#revenueChart");
  drawRevenueChart(canvas, data.series);

  let raf = null;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawRevenueChart(canvas, data.series));
  });
  if (canvas) observer.observe(canvas.parentElement);

  container.querySelectorAll("[data-trx]").forEach((row) => {
    row.addEventListener("click", () => openTransactionDetail(row.dataset.trx));
  });

  return () => {
    observer.disconnect();
    cancelAnimationFrame(raf);
  };
}
