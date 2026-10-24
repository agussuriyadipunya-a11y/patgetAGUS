import fs from "node:fs";
import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { WA_AUTH_DIR, ensureDataDir } from "./paths.js";
import { AppError } from "./transactions.js";

const logger = pino({ level: "silent" });

function normalizeNumber(raw) {
  let digits = String(raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!digits.startsWith("62")) {
    if (digits.startsWith("08")) digits = `62${digits.slice(1)}`;
    else digits = `62${digits}`;
  }
  if (digits.length < 10 || digits.length > 16) {
    throw new AppError(400, "Nomor WhatsApp tidak valid. Masukkan nomor HP aktif (contoh: 08123456789 atau 628123456789).");
  }
  return digits;
}

class WhatsAppManager {
  constructor() {
    this.sock = null;
    this.status = "disconnected";
    this.qrDataUrl = null;
    this.qrIssuedAt = null;
    this.me = null;
    this.error = null;
    this.connectingPromise = null;
    this.manualStop = false;
    this.attempts = 0;
    this.reconnectTimer = null;
    this.connectedAt = null;
    this.updatedAt = new Date().toISOString();
  }

  hasSession() {
    try {
      return fs.existsSync(path.join(WA_AUTH_DIR, "creds.json"));
    } catch {
      return false;
    }
  }

  snapshot() {
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      qrIssuedAt: this.qrIssuedAt,
      me: this.me,
      error: this.error,
      connectedAt: this.connectedAt,
      hasSession: this.hasSession(),
      updatedAt: this.updatedAt,
    };
  }

  setStatus(status, patch = {}) {
    this.status = status;
    this.updatedAt = new Date().toISOString();
    Object.assign(this, patch);
  }

  async init() {
    if (this.hasSession()) {
      this.connect().catch((error) => {
        this.setStatus("error", { error: error.message });
      });
    }
  }

  async connect() {
    if (this.connectingPromise) return this.connectingPromise;
    if (this.status === "connected" && this.sock) return this.snapshot();

    this.manualStop = false;
    this.error = null;
    this.setStatus("connecting", { qrDataUrl: null, me: null });

    this.connectingPromise = (async () => {
      ensureDataDir();
      fs.mkdirSync(WA_AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
      let version;
      try {
        const info = await fetchLatestBaileysVersion();
        version = info.version;
      } catch {
        version = undefined;
      }

      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        browser: ["Payment Gateway", "Chrome", "1.0.0"],
      });

      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        try {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            const dataUrl = await QRCode.toDataURL(qr, {
              width: 320,
              margin: 1,
              errorCorrectionLevel: "M",
              color: { dark: "#0f172a", light: "#ffffff" },
            });
            if (this.sock === sock) {
              this.setStatus("qr", {
                qrDataUrl: dataUrl,
                qrIssuedAt: new Date().toISOString(),
                error: null,
                me: null,
              });
            }
          }

          if (connection === "open") {
            const user = sock.user || {};
            const rawId = user.id || "";
            const number = rawId.split(":")[0].split("@")[0];
            if (this.sock === sock) {
              this.attempts = 0;
              this.setStatus("connected", {
                qrDataUrl: null,
                qrIssuedAt: null,
                error: null,
                me: {
                  id: rawId,
                  number,
                  name: user.name || user.verifiedName || number,
                },
                connectedAt: new Date().toISOString(),
              });
            }
          }

          if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = statusCode === DisconnectReason.loggedOut;
            const reasonText = lastDisconnect?.error?.message || "Koneksi terputus";

            if (this.sock !== sock) return;
            this.sock = null;

            if (loggedOut || this.manualStop) {
              this.setStatus("disconnected", {
                qrDataUrl: null,
                me: null,
                error: loggedOut ? "Sesi WhatsApp telah diakhiri." : null,
              });
              if (loggedOut) this.clearAuth();
              return;
            }

            this.attempts += 1;
            if (this.attempts > 6) {
              this.setStatus("error", {
                error: `${reasonText}. Silakan hubungkan ulang.`,
                qrDataUrl: null,
              });
              return;
            }

            this.setStatus("connecting", {
              qrDataUrl: null,
              me: null,
              error: reasonText,
            });
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              this.connect().catch((error) => this.setStatus("error", { error: error.message }));
            }, Math.min(2000 * this.attempts, 8000));
          }
        } catch (error) {
          this.setStatus("error", { error: error.message });
        }
      });

      return this.snapshot();
    })().finally(() => {
      this.connectingPromise = null;
    });

    return this.connectingPromise;
  }

  clearAuth() {
    try {
      fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true });
    } catch {
      // abaikan
    }
  }

  async logout() {
    this.manualStop = true;
    clearTimeout(this.reconnectTimer);
    const sock = this.sock;
    this.sock = null;
    try {
      if (sock) {
        await Promise.race([
          sock.logout(),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
    } catch {
      // sesi mungkin sudah tidak valid
    }
    try {
      sock?.end?.(undefined);
    } catch {
      // abaikan
    }
    this.clearAuth();
    this.attempts = 0;
    this.setStatus("disconnected", {
      qrDataUrl: null,
      me: null,
      error: null,
      connectedAt: null,
    });
    return this.snapshot();
  }

  async shutdown() {
    this.manualStop = true;
    clearTimeout(this.reconnectTimer);
    try {
      this.sock?.end?.(undefined);
    } catch {
      // abaikan
    }
    this.sock = null;
  }

  async sendText(number, text) {
    if (this.status !== "connected" || !this.sock) {
      throw new AppError(400, "WhatsApp kasir belum terhubung. Silakan buka menu WhatsApp untuk menautkan perangkat.");
    }
    const digits = normalizeNumber(number);
    let targetJid = `${digits}@s.whatsapp.net`;

    try {
      const results = await Promise.race([
        this.sock.onWhatsApp(digits),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
      ]);
      if (Array.isArray(results) && results.length > 0) {
        const item = results[0];
        if (item && item.exists === false) {
          throw new AppError(400, `Nomor ${digits} tidak terdaftar di WhatsApp.`);
        }
        if (item?.jid) targetJid = item.jid;
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // abaikan timeout cek onWhatsApp dan tetap coba kirim ke targetJid
    }

    try {
      await this.sock.sendMessage(targetJid, { text: String(text) });
      return { jid: targetJid, number: digits };
    } catch (err) {
      console.error("[WA] sendText error:", err);
      throw new AppError(500, `Gagal mengirim pesan WhatsApp: ${err.message}`);
    }
  }

  async sendDocument(number, buffer, fileName, caption) {
    if (this.status !== "connected" || !this.sock) {
      throw new AppError(400, "WhatsApp kasir belum terhubung. Silakan buka menu WhatsApp untuk menautkan perangkat.");
    }
    const digits = normalizeNumber(number);
    let targetJid = `${digits}@s.whatsapp.net`;

    try {
      const results = await Promise.race([
        this.sock.onWhatsApp(digits),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
      ]);
      if (Array.isArray(results) && results.length > 0) {
        const item = results[0];
        if (item && item.exists === false) {
          throw new AppError(400, `Nomor ${digits} tidak terdaftar di WhatsApp.`);
        }
        if (item?.jid) targetJid = item.jid;
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // abaikan timeout cek onWhatsApp dan tetap coba kirim ke targetJid
    }

    try {
      const docBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      await this.sock.sendMessage(targetJid, {
        document: docBuffer,
        mimetype: "application/pdf",
        fileName: fileName || "Resi-Pembayaran.pdf",
        caption: caption || "",
      });
      return { jid: targetJid, number: digits };
    } catch (err) {
      console.error("[WA] sendDocument error:", err);
      throw new AppError(500, `Gagal mengirim dokumen WhatsApp: ${err.message}`);
    }
  }
}

export const whatsapp = new WhatsAppManager();
export { normalizeNumber };
