// Centralised device resilience signals for the field app: network connectivity
// (online/offline + connection type) and battery (level + charging). Screens read
// it via the useDeviceStatus hook; the API layer reads isOnline()/onReconnect to
// retry and flush queued work when the connection returns.

import { Network } from "@capacitor/network";
import { Device } from "@capacitor/device";

export interface DeviceStatus {
  online: boolean;
  connectionType: string; // wifi | cellular | none | unknown
  batteryLevel: number | null; // 0..1, null when unknown (e.g. web)
  charging: boolean;
}

let status: DeviceStatus = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  connectionType: "unknown",
  batteryLevel: null,
  charging: false,
};

const listeners = new Set<(s: DeviceStatus) => void>();
const reconnectListeners = new Set<() => void>();
let started = false;
let batteryTimer: ReturnType<typeof setInterval> | null = null;

function emit() {
  const snap = { ...status };
  listeners.forEach((l) => { try { l(snap); } catch { /* ignore */ } });
}

function setOnline(connected: boolean, connectionType?: string) {
  const wasOffline = !status.online;
  status = { ...status, online: connected, connectionType: connectionType ?? status.connectionType };
  emit();
  // Fire reconnect listeners on an offline→online transition (flush queued work).
  if (wasOffline && connected) {
    reconnectListeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
  }
}

export function getDeviceStatus(): DeviceStatus { return { ...status }; }
export function isOnline(): boolean { return status.online; }

export function subscribeDeviceStatus(cb: (s: DeviceStatus) => void): () => void {
  listeners.add(cb);
  cb({ ...status });
  return () => { listeners.delete(cb); };
}

/** Run a callback whenever the device transitions from offline → online. */
export function onReconnect(cb: () => void): () => void {
  reconnectListeners.add(cb);
  return () => { reconnectListeners.delete(cb); };
}

async function refreshNetwork() {
  try {
    const s = await Network.getStatus();
    setOnline(s.connected, s.connectionType);
  } catch {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
  }
}

async function refreshBattery() {
  try {
    const b = await Device.getBatteryInfo();
    status = {
      ...status,
      batteryLevel: typeof b.batteryLevel === "number" ? b.batteryLevel : status.batteryLevel,
      charging: !!b.isCharging,
    };
    emit();
  } catch { /* battery not available (e.g. web) */ }
}

// Track whether the window online/offline listeners are attached so we can
// remove exactly what we added (and so an HMR re-eval that re-runs start after a
// stop doesn't stack duplicate listeners).
let windowListenersAttached = false;

/** Begin monitoring. Idempotent — safe to call once at app start. */
export function startDeviceStatus() {
  if (started) return;
  started = true;

  Network.addListener("networkStatusChange", (s) => setOnline(s.connected, s.connectionType))
    .catch?.(() => { /* ignore */ });
  refreshNetwork();

  // Belt-and-suspenders: the webview's own events as a fallback signal.
  if (typeof window !== "undefined" && !windowListenersAttached) {
    window.addEventListener("online", refreshNetwork);
    window.addEventListener("offline", refreshNetwork);
    windowListenersAttached = true;
  }

  // @capacitor/device has no battery event, so poll. Cheap (every 60s) and the
  // low-battery banner only needs coarse resolution.
  refreshBattery();
  batteryTimer = setInterval(refreshBattery, 60_000);
}

export function stopDeviceStatus() {
  if (batteryTimer) { clearInterval(batteryTimer); batteryTimer = null; }
  Network.removeAllListeners().catch?.(() => { /* ignore */ });
  // Symmetry: remove the window listeners we added (named refs, so removable).
  if (typeof window !== "undefined" && windowListenersAttached) {
    window.removeEventListener("online", refreshNetwork);
    window.removeEventListener("offline", refreshNetwork);
    windowListenersAttached = false;
  }
  started = false;
}
