/**
 * Realtime notification listener — one socket.io connection for the bell.
 *
 * Opens a single socket against the backend (same transport/auth pattern as the
 * voice channel: WebSocket over the Cloudflare Tunnel, JWT + tenantId in auth)
 * and surfaces the server's `notification` event to a handler. socket.io handles
 * reconnection automatically; this module just wires the listener and returns a
 * disconnect cleanup fn. Framework-agnostic — React state lives in the provider.
 */
import { io, Socket } from "socket.io-client";
import { api, apiOrigin, getToken, getTenantId } from "./api";
import type { PlatformEvent } from "./services";

/** This app's session channel (the supervisor app's copy says "supervisor"). */
const SESSION_CHANNEL = "worker";

const noop = () => {};

/**
 * Open the notifications socket and invoke `onNotification` for every incoming
 * `notification` event. Returns a cleanup fn that tears the socket down.
 *
 * No-ops (returns a noop cleanup) when there is no token/tenant — i.e. the user
 * is not authenticated yet. The socket payload has no deliveryStatus, so the
 * provider treats every delivered event as unread/new.
 */
export function connectNotifications(
  onNotification: (ev: PlatformEvent) => void,
): () => void {
  const token = getToken();
  let tenantId: string;
  try {
    tenantId = getTenantId();
  } catch {
    // No tenant configured (not signed in yet) — nothing to connect.
    return noop;
  }
  if (!token || !tenantId) return noop;

  let socket: Socket;
  try {
    socket = io(apiOrigin, {
      path: "/api/socket.io",
      transports: ["websocket"],
      auth: { token, tenantId },
      reconnection: true,
    });
  } catch {
    return noop;
  }

  socket.on("notification", (ev: PlatformEvent) => {
    try {
      if (ev && ev.id) onNotification(ev);
    } catch (e) {
      console.warn("notification handler failed", e);
    }
  });

  // Single active session: this account just signed in on ANOTHER device of
  // the same channel. Verify against the server (never trust the event alone):
  // an authenticated request with a superseded token gets 401, which trips the
  // api module's unauthorized handler → AuthContext signs out → login screen.
  // If the request succeeds, this device holds the new session — ignore.
  socket.on("session:superseded", (p: { channel?: string } | undefined) => {
    if (!p || p.channel !== SESSION_CHANNEL) return;
    api.get("/auth/me").catch(() => { /* 401 path handled globally */ });
  });

  return () => {
    try { socket.removeAllListeners(); } catch { /* ignore */ }
    try { socket.disconnect(); } catch { /* ignore */ }
  };
}
