/**
 * Where the browser should call the API.
 * Leave VITE_API_URL unset. Dev proxies /api and /ws, and production does too.
 */
export function apiOrigin(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === "string" && configured.trim() !== "") {
    return configured.trim().replace(/\/$/, "");
  }
  return window.location.origin;
}
