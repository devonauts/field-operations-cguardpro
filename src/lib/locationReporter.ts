// Live-telemetry reporter. While the guard is on duty (dutyState), this pings
// the backend with the current GPS / speed / heading / battery so the supervisor's
// Guard Detail + the CRM live map / walked-trail show real movement.
//
// BACKGROUND: on native, uses @capacitor-community/background-geolocation so the
// trail keeps recording when the screen sleeps / the app is backgrounded (the
// whole point of live guard tracking). Falls back to the foreground setInterval
// path on the web, or if the background plugin isn't available in this build.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { guardService } from "./services";
import { getDeviceStatus } from "./deviceStatus";
import { subscribeDuty, getDuty } from "./dutyState";
import i18n from "@/i18n";

// The background-geolocation watcher. registerPlugin always returns a proxy;
// calling addWatcher throws "not implemented" where the native side is absent,
// which we catch and fall back from.
interface BgLocation {
  latitude: number; longitude: number; accuracy?: number | null;
  speed?: number | null; bearing?: number | null;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string; backgroundTitle?: string;
      requestPermissions?: boolean; stale?: boolean; distanceFilter?: number;
    },
    callback: (location?: BgLocation, error?: { code?: string; message?: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

const INTERVAL_MS = 45_000;
// Min gap between backend pings on the background path — the watcher can fire
// far more often than we want to write. Time-throttle to bound the trail volume.
const MIN_SEND_GAP_MS = 30_000;

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
let watcherId: string | null = null;
let lastSentAt = 0;

async function send(pos: FullCoords) {
  if (inFlight) return;
  inFlight = true;
  try {
    const bl = getDeviceStatus().batteryLevel; // 0..1 or null
    await guardService.pingLocation({
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: pos.speed,
      heading: pos.heading,
      accuracy: pos.accuracy,
      battery: bl == null ? null : Math.round(bl * 100),
    });
    lastSentAt = Date.now();
  } catch {
    /* best-effort — a dropped ping is fine */
  } finally {
    inFlight = false;
  }
}

async function tick() {
  if (!getDuty()) return;
  const pos = await readPosition();
  if (pos) await send(pos);
}

// Native background watcher: keeps reporting when backgrounded / screen asleep.
async function startBackgroundWatcher(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || watcherId) return watcherId != null;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: i18n.t("location.bgMessage", "Tu ubicación se comparte con la central mientras estás en turno."),
        backgroundTitle: i18n.t("location.bgTitle", "Turno activo"),
        requestPermissions: true,
        stale: false,
        distanceFilter: 20,
      },
      (location, error) => {
        if (error || !location || !getDuty()) return;
        // Time-throttle: the watcher fires on movement; bound backend writes.
        if (Date.now() - lastSentAt < MIN_SEND_GAP_MS) return;
        void send({
          latitude: location.latitude,
          longitude: location.longitude,
          speed: typeof location.speed === "number" ? location.speed : null,
          heading: typeof location.bearing === "number" ? location.bearing : null,
          accuracy: typeof location.accuracy === "number" ? location.accuracy : null,
        });
      },
    );
    return true;
  } catch {
    // Plugin not present in this build / permission denied → foreground fallback.
    watcherId = null;
    return false;
  }
}

async function stopBackgroundWatcher() {
  if (watcherId) {
    try { await BackgroundGeolocation.removeWatcher({ id: watcherId }); } catch { /* ignore */ }
    watcherId = null;
  }
}

let acquiring = false;
async function run() {
  if (timer || watcherId || acquiring) return;
  acquiring = true;
  try {
    // Prefer the native background watcher; only fall back to the foreground timer.
    const bg = await startBackgroundWatcher();
    // addWatcher can block on a permission prompt; if the guard clocked out
    // meanwhile, halt() already ran as a no-op (watcherId was still null) —
    // tear down now or the GPS + "Turno activo" notification outlive the shift.
    if (!getDuty()) {
      halt();
      return;
    }
    if (bg) {
      void tick(); // one immediate fix so the trail starts at go-on-duty
      return;
    }
    void tick();
    timer = setInterval(tick, INTERVAL_MS);
  } finally {
    acquiring = false;
  }
}
function halt() {
  if (timer) { clearInterval(timer); timer = null; }
  void stopBackgroundWatcher();
}

let started = false;
/** Init once at app startup; self-manages start/stop on duty changes. */
export function startLocationReporter() {
  if (started) return;
  started = true;
  if (getDuty()) run();
  subscribeDuty((onDuty) => { if (onDuty) run(); else halt(); });
}
