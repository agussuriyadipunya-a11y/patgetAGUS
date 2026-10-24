export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const type = response.headers.get("content-type") || "";
  let data = null;
  if (type.includes("application/json")) {
    data = await response.json().catch(() => null);
  }

  if (response.status === 401 && !path.startsWith("/auth/login")) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  if (!response.ok) {
    throw new ApiError(data?.error || `Permintaan gagal (HTTP ${response.status}).`, response.status);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
};

export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function downloadFile(path, fallbackName = "download") {
  const response = await fetch(`/api${path}`, { credentials: "same-origin" });
  if (!response.ok) {
    let message = `Unduhan gagal (HTTP ${response.status}).`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // abaikan
    }
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}

export function fileUrl(path) {
  return `/api${path}`;
}
