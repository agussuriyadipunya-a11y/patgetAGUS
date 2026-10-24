import { api } from "./api.js";

export const state = {
  user: null,
  settings: null,
  categories: [],
  paymentMethods: [],
  accents: [],
  simulation: false,
  meta: null,
  wa: null,
};

export const ACCENT_LIST = ["indigo", "emerald", "blue", "violet", "amber", "rose"];

export function applyTheme(settings = state.settings) {
  if (!settings) return;
  const root = document.documentElement;
  root.dataset.theme = settings.theme === "dark" ? "dark" : "light";
  root.dataset.accent = ACCENT_LIST.includes(settings.accent) ? settings.accent : "indigo";
  const scale = Number(settings.fontScale) || 100;
  root.style.setProperty("--font-scale", String(scale / 100));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", settings.theme === "dark" ? "#0b1220" : "#f6f7fb");
}

export function updateSettings(patch) {
  state.settings = { ...(state.settings || {}), ...patch };
  applyTheme(state.settings);
  window.dispatchEvent(new CustomEvent("settings:updated", { detail: state.settings }));
}

export async function loadCatalog(force = false) {
  if (state.categories.length && !force) return state.categories;
  const data = await api.get("/catalog");
  state.categories = data.categories;
  state.paymentMethods = data.paymentMethods;
  state.accents = data.accents || ACCENT_LIST;
  state.simulation = data.simulation;
  return state.categories;
}

export function findCategory(categoryId) {
  return state.categories.find((c) => c.id === categoryId) || null;
}

export function findType(category, typeId) {
  return category?.types.find((t) => t.id === typeId) || null;
}

export function categoryColor(categoryId) {
  const map = { pln: "#f59e0b", telkomsel: "#e11d48", xl: "#2563eb", internet: "#0d9488", bpjs: "#059669" };
  return map[categoryId] || "#6366f1";
}
