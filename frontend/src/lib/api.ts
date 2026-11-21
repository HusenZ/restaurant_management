"use client";

import { authStore } from "./auth";

/** API origin: NEXT_PUBLIC_API_URL, else same host as the page on :8000 (so phones on the LAN work). */
export function apiOrigin(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export function wsOrigin(): string {
  return apiOrigin().replace(/^http/, "ws");
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  guestToken?: string | null;
  auth?: boolean; // attach staff token (default true when a staff session exists and no guest token)
  form?: FormData;
  signal?: AbortSignal;
};

function errorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: string[] };
    const field = first.loc?.slice(-1)[0];
    return `${field ? `${field}: ` : ""}${first.msg ?? fallback}`.replace("Value error, ", "");
  }
  return fallback;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const { refreshToken } = authStore.getState();
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${apiOrigin()}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      authStore.getState().setSession(data);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.guestToken) headers["X-Guest-Token"] = opts.guestToken;
  const staffToken = authStore.getState().accessToken;
  const useAuth = opts.auth ?? !opts.guestToken;
  if (useAuth && staffToken) headers["Authorization"] = `Bearer ${staffToken}`;

  let res: Response;
  try {
    res = await fetch(`${apiOrigin()}/api/v1${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server — check your connection");
  }

  if (res.status === 401 && useAuth && staffToken && !retried && (await tryRefresh())) {
    return api<T>(path, opts, true);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && useAuth && staffToken) authStore.getState().logout();
    throw new ApiError(res.status, errorMessage(data, `Request failed (${res.status})`));
  }
  return data as T;
}

/** SWR fetcher for staff endpoints. Key: path string. */
export const staffFetcher = <T,>(path: string) => api<T>(path);

/** SWR fetcher for guest endpoints. Key: [path, guestToken]. */
export const guestFetcher = <T,>([path, token]: [string, string | null]) =>
  api<T>(path, { guestToken: token, auth: false });

export const publicFetcher = <T,>(path: string) => api<T>(path, { auth: false });

/** Open an authenticated file (PDF/PNG) from a staff endpoint in a new tab. */
export async function openStaffFile(path: string, filename?: string, download = false) {
  const token = authStore.getState().accessToken;
  const res = await fetch(`${apiOrigin()}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(res.status, "Could not open file");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? "download";
    a.click();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
