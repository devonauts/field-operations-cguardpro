import { Capacitor } from "@capacitor/core";

export interface Coords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/** Distance in meters between two lat/lng points (haversine). */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Get the current GPS position. Uses the Capacitor Geolocation plugin when
 * running natively (iOS/Android) and falls back to the Web Geolocation API
 * in the browser / dev server.
 *
 * Hard-bounded: the platform `timeout` does NOT cover the time a user spends on
 * the permission prompt, so a stuck/ignored dialog could hang forever. We race
 * against a hard ceiling so the caller's `await` always settles — clock-in can
 * then proceed without GPS (the photo just lacks an address).
 */
/**
 * Pre-warm the location permission WITHOUT fetching a fix. Call this early in a
 * flow that will need GPS (e.g. when the clock-in checklist opens) so the system
 * dialog appears on a calm screen — NOT concurrently with a live camera stream,
 * which crashes the WebView renderer on some Android devices (MediaTek). By the
 * time the selfie's getCurrentPosition() runs, the permission is already granted
 * and no dialog collides with the camera. Fire-and-forget; never throws.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return true;
    const { Geolocation } = await import("@capacitor/geolocation");
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      perm = await Geolocation.requestPermissions({ permissions: ["location"] });
    }
    return perm.location === "granted" || perm.coarseLocation === "granted";
  } catch {
    return false;
  }
}

/** True if location is already granted — checked WITHOUT showing a dialog. */
export async function isLocationGranted(): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return !!navigator.geolocation;
    const { Geolocation } = await import("@capacitor/geolocation");
    const p = await Geolocation.checkPermissions();
    return p.location === "granted" || p.coarseLocation === "granted";
  } catch {
    return false;
  }
}

export async function getCurrentPosition(): Promise<Coords> {
  return Promise.race([
    getCurrentPositionRaw(),
    new Promise<Coords>((_, reject) =>
      setTimeout(() => reject(new Error("location.timeout")), 20000)
    ),
  ]);
}

async function getCurrentPositionRaw(): Promise<Coords> {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      const req = await Geolocation.requestPermissions();
      if (req.location !== "granted") {
        throw new Error("location.denied");
      }
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  }

  return new Promise<Coords>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("location.unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (err) => reject(new Error(err.message || "location.error")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/**
 * Reverse-geocode coordinates into a human-readable address via Google Geocoding.
 * Falls back to a formatted lat/lng string if the key is missing or the call fails.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key) return fallback;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=es`,
      { signal: ctrl.signal }
    );
    clearTimeout(to);
    const json = await res.json();
    const first = json?.results?.[0]?.formatted_address;
    return first || fallback;
  } catch {
    return fallback;
  }
}
