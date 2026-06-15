// Shared helpers for resolving displayable URLs for stored files.
//
// Private files (clock-in selfies, visitor IDs, message attachments, station /
// ronda photos) are served by the backend `/file/download` endpoint. That
// endpoint now prefers an opaque `?fileToken=<AES-GCM>` over a raw, guessable
// `?privateUrl=` (an IDOR being closed). A kill-switch will later reject raw
// `?privateUrl=` URLs, so the app must always display private files via a
// token-based `downloadUrl` — either the one the backend already attached to a
// serialized file object, or one fetched on demand from `/file/token`.

import { useEffect, useState } from "react";
import { api, tenantPath, getTenantId } from "./api";

const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://api.cguardpro.com/api"
).replace(/\/+$/, "");

/** A `downloadUrl` is token-based unless it carries a raw `?privateUrl=`. */
const isTokenUrl = (u: string) => !/[?&]privateUrl=/.test(u);

/** True for an already-usable absolute URL we can hand straight to <img>/<video>. */
const isAbsolute = (u: string) => /^https?:\/\//i.test(u);

/**
 * Resolve a displayable URL from a serialized file object, preferring the
 * backend's token-based `downloadUrl`. Falls back to other absolute fields.
 * Returns `null` when only a raw private path is available (use `useFileUrl`
 * to exchange that for a token URL).
 */
export function fileUrlFromFile(obj: any): string | null {
  if (!obj) return null;
  const file = Array.isArray(obj) ? obj[0] : obj;
  if (!file) return null;
  // Token-based downloadUrl is preferred; only trust it if it isn't a raw
  // ?privateUrl= URL.
  if (typeof file.downloadUrl === "string" && file.downloadUrl && isTokenUrl(file.downloadUrl))
    return file.downloadUrl;
  // Public assets (e.g. logos) are safe to use directly.
  if (typeof file.publicUrl === "string" && file.publicUrl) return file.publicUrl;
  if (typeof file.url === "string" && file.url && isAbsolute(file.url)) return file.url;
  return null;
}

// Module-level cache: a given raw privateUrl always maps to the same token
// downloadUrl, so we fetch it at most once per session. Keyed by tenant so a
// tenant switch can't leak another tenant's token URL.
const tokenCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(privateUrl: string): string {
  let tenant = "";
  try { tenant = getTenantId(); } catch { /* no tenant yet */ }
  return `${tenant}::${privateUrl}`;
}

/**
 * Exchange a raw private path for a token-based `downloadUrl` via the
 * tenant-scoped `/file/token` endpoint. Cached + de-duped. Resolves to `null`
 * on error so callers can fall back gracefully.
 */
export async function fetchTokenUrl(privateUrl: string): Promise<string | null> {
  const key = cacheKey(privateUrl);
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    try {
      const resp = await api.get(
        tenantPath(`/file/token?privateUrl=${encodeURIComponent(privateUrl)}`)
      );
      const url = resp?.downloadUrl as string | undefined;
      if (url) {
        tokenCache.set(key, url);
        return url;
      }
    } catch { /* graceful fallback below */ }
    return null;
  })().finally(() => { inflight.delete(key); });

  inflight.set(key, p);
  return p;
}

/**
 * Resolve a displayable URL for a file `source`, which may be:
 *  - a serialized file object (with `downloadUrl`/`publicUrl`/`url`), or
 *  - a raw string (absolute URL, or a stored private path).
 *
 * If a token URL is already available it's returned synchronously on first
 * render. Otherwise a token is fetched once (cached) and applied when ready.
 * Returns "" until something usable is known, so an <img src=""> stays blank
 * rather than hitting a raw, soon-to-be-rejected `?privateUrl=` URL.
 */
export function useFileUrl(source: any): string {
  const initial = resolveSync(source);
  const [url, setUrl] = useState<string>(initial);

  // Stable identity for the effect dependency: the raw private path (string).
  const raw = rawPrivateUrl(source);

  useEffect(() => {
    const sync = resolveSync(source);
    if (sync) { setUrl(sync); return; }
    if (!raw) { setUrl(""); return; }
    let alive = true;
    fetchTokenUrl(raw).then((u) => {
      if (!alive) return;
      setUrl(u || rawDownloadUrl(raw));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  return url;
}

/** Synchronously usable URL (token downloadUrl / public / absolute), else "". */
function resolveSync(source: any): string {
  if (!source) return "";
  if (typeof source === "string") {
    if (isAbsolute(source)) return source;
    return "";
  }
  const fromFile = fileUrlFromFile(source);
  return fromFile || "";
}

/** Extract the raw private path string from a file object or string. */
function rawPrivateUrl(source: any): string {
  if (!source) return "";
  if (typeof source === "string") return isAbsolute(source) ? "" : source;
  const file = Array.isArray(source) ? source[0] : source;
  if (!file) return "";
  if (typeof file.privateUrl === "string" && file.privateUrl) return file.privateUrl;
  if (typeof file.url === "string" && file.url && !isAbsolute(file.url)) return file.url;
  return "";
}

/** Last-resort raw `/file/download` URL (used only if token fetch fails). */
function rawDownloadUrl(privateUrl: string): string {
  return `${API_BASE}/file/download?privateUrl=${encodeURIComponent(privateUrl)}`;
}
