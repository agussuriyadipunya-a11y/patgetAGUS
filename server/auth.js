import {
  createSession,
  db,
  destroySession,
  destroyUserSessions,
  getSession,
  hashPassword,
  verifyPassword,
} from "./db.js";
import { getPublicSettings } from "./settings.js";

export const COOKIE_NAME = "pg_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const attempts = new Map();

export function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getTokenFromRequest(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

export function authRequired(req, res, next) {
  const token = getTokenFromRequest(req);
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: "Sesi berakhir. Silakan login kembali." });
  }
  req.user = { username: session.username, token };
  return next();
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secureFlag = process.env.NODE_ENV === "production" || !!process.env.VERCEL ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureFlag}`,
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function rateLimit(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 8;
}

export function login(req, res) {
  const ip = req.ip || req.socket?.remoteAddress || "local";
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: "Terlalu banyak percobaan login. Coba lagi dalam 10 menit." });
  }

  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan kata sandi wajib diisi." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Username atau kata sandi salah." });
  }

  attempts.delete(ip);
  const token = createSession(user.username, SESSION_TTL_MS);
  setSessionCookie(res, token);
  return res.json({
    user: { username: user.username },
    settings: getPublicSettings(),
  });
}

export function logout(req, res) {
  const token = getTokenFromRequest(req);
  destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
}

export function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Kata sandi lama dan baru wajib diisi." });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "Kata sandi baru minimal 6 karakter." });
  }
  if (String(newPassword).length > 72) {
    return res.status(400).json({ error: "Kata sandi baru maksimal 72 karakter." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(req.user.username);
  if (!user || !verifyPassword(String(currentPassword), user.password_hash)) {
    return res.status(400).json({ error: "Kata sandi lama tidak sesuai." });
  }

  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    hashPassword(String(newPassword)),
    new Date().toISOString(),
    user.id,
  );
  destroyUserSessions(user.username, req.user.token);
  return res.json({ ok: true, message: "Kata sandi berhasil diperbarui." });
}

export function me(req, res) {
  res.json({ user: req.user, settings: getPublicSettings() });
}
