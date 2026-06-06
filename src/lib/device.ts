import { Device } from "@capacitor/device";
import { App as CapacitorApp } from "@capacitor/app";

export interface DeviceIdentity {
  deviceId: string;
  platform: string;
  model: string | null;
  manufacturer: string | null;
  osVersion: string | null;
  appVersion: string | null;
}

/**
 * Stable device identity for device management. `deviceId` comes from
 * @capacitor/device getId() (persisted per-install UUID on Android,
 * identifierForVendor on iOS); the rest is best-effort device/app metadata.
 * Returns null only if no identifier can be obtained at all.
 */
export async function getDeviceIdentity(): Promise<DeviceIdentity | null> {
  try {
    const { identifier } = await Device.getId();
    if (!identifier) return null;
    let model: string | null = null;
    let manufacturer: string | null = null;
    let osVersion: string | null = null;
    let platform = "web";
    try {
      const info = await Device.getInfo();
      platform = info.platform || "web";
      model = info.model || null;
      manufacturer = info.manufacturer || null;
      osVersion = info.osVersion || null;
    } catch {
      /* metadata is optional */
    }
    let appVersion: string | null = null;
    try {
      const a = await CapacitorApp.getInfo();
      appVersion = a.version || null;
    } catch {
      /* web build has no native app info */
    }
    return { deviceId: identifier, platform, model, manufacturer, osVersion, appVersion };
  } catch {
    return null;
  }
}

/**
 * Battery status for the start-shift checklist. Uses the web Battery API
 * (available in Android WebView / Chrome). When unavailable (e.g. iOS WebView),
 * returns supported:false so the UI shows a manual confirmation instead.
 */
export interface BatteryStatus {
  supported: boolean;
  level: number | null; // 0–100
  charging: boolean;
}

export async function getBatteryStatus(): Promise<BatteryStatus> {
  try {
    const nav: any = navigator;
    if (typeof nav.getBattery === "function") {
      const b = await nav.getBattery();
      return {
        supported: true,
        level: Math.round((b.level ?? 0) * 100),
        charging: !!b.charging,
      };
    }
  } catch {
    /* ignore */
  }
  return { supported: false, level: null, charging: false };
}
