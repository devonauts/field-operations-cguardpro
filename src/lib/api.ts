// Lightweight fetch-based API client for the worker app.
// Mirrors the conventions of the main frontend: JWT bearer in localStorage
// ("authToken"), credentials included, JSON in/out, and graceful error shape.

const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://api.cguardpro.com/api"
).replace(/\/+$/, "");

/** Origin for socket.io (the REST base minus its trailing /api path). */
export const apiOrigin = (() => {
  try { return new URL(API_BASE_URL).origin; } catch { return API_BASE_URL.replace(/\/api$/, ""); }
})();

export const TOKEN_KEY = "authToken";
export const TENANT_KEY = "tenantId";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// Sentinel status for client-side configuration errors (e.g. no tenant). Kept
// distinct from 0 (connectivity) so it is never misread as a retryable network
// failure or surfaced as an "offline" message.
export const CONFIG_ERROR_STATUS = -1;

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

// Called when an authenticated request is rejected (401) — e.g. this device's
// session was ended by a login elsewhere (single active session). The auth
// context registers a handler that signs the user out → app returns to login.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

export const getTenantId = (): string => {
  const t = localStorage.getItem(TENANT_KEY);
  // Distinct CONFIG_ERROR_STATUS (not 0) so this non-transient config problem is
  // not retried or labeled as a connectivity error.
  if (!t) throw new ApiError("Tenant not configured", CONFIG_ERROR_STATUS, null);
  return t;
};
export const setTenantId = (t: string | null) =>
  t ? localStorage.setItem(TENANT_KEY, t) : localStorage.removeItem(TENANT_KEY);

interface RequestOptions extends Omit<RequestInit, "body"> {
  skipAuth?: boolean;
  body?: unknown;
}

/** True when the failure was a connectivity error (no response reached us). */
export const isNetworkError = (e: unknown): boolean =>
  e instanceof ApiError && e.status === 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(2500, 250 * 2 ** (attempt - 1));

// De-dup identical concurrent GETs: while one is in flight, other callers for
// the same URL share its promise instead of firing a duplicate request. Cleared
// the moment the request settles, so this is in-flight de-dup, not a cache.
const inflightGets = new Map<string, Promise<any>>();

async function request<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  // Auto-retry only idempotent reads — retrying a POST/PUT/PATCH/DELETE on a flaky
  // connection risks a double submit (e.g. two clock-ins). Mutations bubble the
  // network error up so the caller / offline queue can decide.
  const idempotent = method === "GET" || method === "HEAD";
  const maxAttempts = idempotent ? 3 : 1;

  // Only de-dup plain GETs with no custom headers/body — a request whose options
  // could change the response (auth override etc.) must not be shared.
  const dedupable =
    method === "GET" && !options.body && !options.headers && !options.skipAuth;
  if (dedupable) {
    const existing = inflightGets.get(endpoint);
    if (existing) return existing as Promise<T>;
  }

  const exec = (async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await doRequest<T>(endpoint, options);
      } catch (e) {
        lastErr = e;
        const transient =
          e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);
        if (!transient || attempt >= maxAttempts) throw e;
        await sleep(backoff(attempt)); // 250ms, 500ms, …
      }
    }
    throw lastErr;
  })();

  if (!dedupable) return exec;

  inflightGets.set(endpoint, exec);
  try {
    return await exec;
  } finally {
    inflightGets.delete(endpoint);
  }
}

async function doRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth, body, headers: extraHeaders, ...rest } = options;
  const token = getToken();

  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...((extraHeaders as Record<string, string>) || {}),
  };
  if (token && !skipAuth) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers,
      credentials: "include",
      cache: "no-store",
      body: isForm ? (body as FormData) : body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Sin conexión. Verifica tu red e inténtalo de nuevo.", 0, null);
  }

  const contentType = res.headers.get("content-type") || "";
  let data: any = null;
  try {
    if (res.status === 204 || res.status === 304) data = null;
    else if (contentType.includes("application/json")) {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } else {
      data = await res.text().catch(() => null);
    }
  } catch {
    data = null;
  }

  if (!res.ok && res.status !== 304) {
    // An authenticated request rejected with 401 → the token is no longer valid
    // (e.g. signed out by a login on another device). Sign out so the app returns
    // to the login screen instead of erroring on every action.
    if (res.status === 401 && token && !skipAuth) {
      try { onUnauthorized?.(); } catch { /* ignore */ }
    }
    const msg =
      (data && (data.message || data.error)) ||
      (typeof data === "string" && !/<\s*!?doctype|<html/i.test(data) && data) ||
      `Error ${res.status}`;
    throw new ApiError(String(msg), res.status, data);
  }

  // Backend either returns the payload directly, or { rows, count } for lists,
  // or occasionally { data: ... }. Callers normalize as needed.
  return data as T;
}

export const api = {
  get: <T = any>(e: string, o: RequestOptions = {}) =>
    request<T>(e, { ...o, method: "GET" }),
  post: <T = any>(e: string, body?: unknown, o: RequestOptions = {}) =>
    request<T>(e, { ...o, method: "POST", body }),
  put: <T = any>(e: string, body?: unknown, o: RequestOptions = {}) =>
    request<T>(e, { ...o, method: "PUT", body }),
  patch: <T = any>(e: string, body?: unknown, o: RequestOptions = {}) =>
    request<T>(e, { ...o, method: "PATCH", body }),
  delete: <T = any>(e: string, o: RequestOptions = {}) =>
    request<T>(e, { ...o, method: "DELETE" }),
};

/** Build a tenant-scoped path: tenantPath("/guard/me") -> /tenant/<id>/guard/me */
export const tenantPath = (suffix: string) =>
  `/tenant/${getTenantId()}${suffix.startsWith("/") ? "" : "/"}${suffix}`;

/** Normalize list responses ({rows} | {data} | array) into an array. */
export function asRows<T = any>(resp: any): T[] {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.rows)) return resp.rows;
  if (resp && Array.isArray(resp.data)) return resp.data;
  if (resp && resp.data && Array.isArray(resp.data.rows)) return resp.data.rows;
  return [];
}

/** Unwrap a possible { data: payload } envelope. */
export function unwrap<T = any>(resp: any): T {
  return resp && resp.data !== undefined ? resp.data : resp;
}
