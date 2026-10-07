const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() || "/api";

const API_BASE = RAW_API_BASE.endsWith("/") ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE;

function normalizePath(path: string): string {
  return path.startsWith("/api/") || path === "/api"
    ? path.slice("/api".length) || "/"
    : path.startsWith("/")
      ? path
      : `/${path}`;
}

export function buildApiUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE}${normalizePath(path)}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return API_BASE.startsWith("http") ? url.toString() : url.pathname + url.search;
}
