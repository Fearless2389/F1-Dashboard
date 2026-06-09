/**
 * Thin fetch wrapper around the FastAPI backend.
 *
 * Base URL resolution:
 *   - VITE_API_URL when set (production / deployed)
 *   - "" otherwise — Vite dev proxy forwards /api/* to localhost:8000.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new ApiError(r.status, `${r.status} ${r.statusText} on ${path}`, text);
  }
  if (r.status === 204) return undefined as unknown as T;
  return r.json() as Promise<T>;
}

export const api = {
  get:  <T,>(p: string)              => request<T>(p),
  post: <T,>(p: string, body: any)   => request<T>(p, { method: "POST", body: JSON.stringify(body) }),
};

export const wsUrl = (path: string) => {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = API_BASE
    ? new URL(API_BASE).host
    : window.location.host;
  return `${proto}//${host}${path}`;
};
