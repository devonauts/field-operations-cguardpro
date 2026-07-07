// Live-telemetry reporter. While the guard is on duty (dutyState), this pings
// the backend with the current GPS / speed / heading / battery every INTERVAL so
// the supervisor's Guard Detail shows LIVE data (not just the clock-in snapshot).
// Foreground-only (no background geolocation) — good enough while the app is
// open, which is when a supervisor is actively watching.
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { guardService } from "./services";
import { getDeviceStatus } from "./deviceStatus";
import { subscribeDuty, getDuty } from "./dutyState";

const INTERVAL_MS = 45_000;

interface FullCoords {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
}

async function readPosition(): Promise<FullCoords | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      // maximumAge lets the OS reuse a recent fix (matching the web path) instead
      // of re-acquiring GPS on every interval — meaningful battery savings.
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 });
      const c = pos.coords;
      return {
        latitude: c.latitude,
        longitude: c.longitude,
        speed: typeof c.speed === "number" ? c.speed : null,
        heading: typeof c.heading === "number" ? c.heading : null,
        accuracy: typeof c.accuracy === "number" ? c.accuracy : null,
      };
    }
    return await new Promise<FullCoords | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          speed: typeof p.coords.speed === "number" ? p.coords.speed : null,
          heading: typeof p.coords.heading === "number" ? p.coords.heading : null,
          accuracy: typeof p.coords.accuracy === "number" ? p.coords.accuracy : null,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
      );
    });
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function tick() {
  if (inFlight || !getDuty()) return;
  inFlight = true;
  try {
    const pos = await readPosition();
    if (!pos) return;
    const bl = getDeviceStatus().batteryLevel; // 0..1 or null
    await guardService.pingLocation({
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: pos.speed,
      heading: pos.heading,
      accuracy: pos.accuracy,
      battery: bl == null ? null : Math.round(bl * 100),
    });
  } catch {
    /* best-effort — a dropped ping is fine */
  } finally {
    inFlight = false;
  }
}

function run() {
  if (timer) return;
  void tick(); // report immediately on going on duty
  timer = setInterval(tick, INTERVAL_MS);
}
function halt() {
  if (timer) { clearInterval(timer); timer = null; }
}

let started = false;
/** Init once at app startup; self-manages start/stop on duty changes. */
export function startLocationReporter() {
  if (started) return;
  started = true;
  if (getDuty()) run();
  subscribeDuty((onDuty) => { if (onDuty) run(); else halt(); });
}
