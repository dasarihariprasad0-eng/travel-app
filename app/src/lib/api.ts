const API_BASE = (
  import.meta.env["VITE_API_URL"] ??
  (import.meta.env.DEV ? "/api" : "https://direct-travel-api.onrender.com")
).replace(/\/+$/, "");
const SESSION_TOKEN_KEY = "direct_session_token";

export type AuthSession = { user: { id: string }; access_token: string };

export function setSessionToken(token: string): void {
  window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export function notifyAuthChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("direct-auth-change"));
}

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  const token =
    options.auth === false || typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) {
      clearSessionToken();
      if (path !== "/me") notifyAuthChange();
    }
    const message =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? String(payload.detail)
        : `API request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}
