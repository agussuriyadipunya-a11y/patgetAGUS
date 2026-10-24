import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "kiosk-data")
  : path.join(ROOT, "data");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const WA_AUTH_DIR = path.join(DATA_DIR, "wa-auth");
export const DB_FILE = path.join(DATA_DIR, "payment-gateway.db");

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
