import { Capacitor } from "@capacitor/core";
import { rondasService } from "./rondas";
import { getDeviceIdentity } from "./device";
import { emitPush } from "./pushEvents";

/**
 * Report this device's identity to the backend (device management: bind/flag).
 * Best-effort and safe to call repeatedly — runs on web too (so the admin can
 * see the device even in browser testing). Guard-only endpoint; silently
 * ignored for other roles.
 */
export async function reportDevice(): Promise<void> {
  try {
    const identity = await getDeviceIdentity();
    if (!identity) return;
    await rondasService.registerDevice(identity);
  } catch (e) {
    console.warn("reportDevice skipped", e);
  }
}

/**
 * Register the device for push and send the FCM token to the backend.
 * Native (iOS/Android) only — no-op on web/dev. Safe to call repeatedly.
 */
export async function registerPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    await PushNotifications.removeAllListeners();
    PushNotifications.addListener("registration", (token) => {
      rondasService.registerDeviceToken(token.value).catch(() => {});
    });
    PushNotifications.addListener("registrationError", (e) => {
      console.warn("push registration error", e);
    });
    // Arrived while the app is in the foreground — fan the payload out to any
    // subscribed screen so the UI can react immediately (e.g. an early-clock-out
    // approval/rejection flipping the dashboard without waiting for the poll).
    PushNotifications.addListener("pushNotificationReceived", (n) => {
      emitPush(n?.data);
    });
    // The user tapped a notification (app was backgrounded/killed) — surface the
    // same payload once we're back in the foreground.
    PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
      emitPush(a?.notification?.data);
    });
    await PushNotifications.register();
  } catch (e) {
    // plugin not installed natively / unsupported platform
    console.warn("registerPush skipped", e);
  }
}
