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
import { apiOrigin, getToken, getTenantId } from "./api";
import type { PlatformEvent } from "./services";

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

  return () => {
    try { socket.removeAllListeners(); } catch { /* ignore */ }
    try { socket.disconnect(); } catch { /* ignore */ }
  };
}
