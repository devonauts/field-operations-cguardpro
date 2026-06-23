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
 *
 * Uses @capacitor-firebase/messaging (NOT @capacitor/push-notifications) because
 * on iOS the latter yields the raw APNs token, which the backend's FCM send
 * (admin.messaging().sendEachForMulticast) cannot deliver to. The Firebase SDK
 * bridges the APNs token to a real FCM registration token on both platforms.
 *
 * Native (iOS/Android) only — no-op on web/dev. Safe to call repeatedly.
 * iOS also requires: the APNs Auth Key uploaded to Firebase → Cloud Messaging,
 * the Push Notifications capability, and a REAL device (never the simulator).
 */
export async function registerPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    const register = (token?: string | null) => {
      if (token) rondasService.registerDeviceToken(token).catch(() => {});
    };

    await FirebaseMessaging.removeAllListeners();
    // The FCM registration token (re-issued over time → keep the backend in sync).
    FirebaseMessaging.addListener("tokenReceived", (e: any) => register(e?.token));
    // Foreground arrival → fan the payload out so screens can react immediately.
    FirebaseMessaging.addListener("notificationReceived", (e: any) => emitPush(e?.notification?.data));
    // User tapped a notification (app backgrounded/killed) → surface the payload
    // flagged as a tap so a listener can deep-link (e.g. open the radio screen).
    FirebaseMessaging.addListener("notificationActionPerformed", (e: any) =>
      emitPush({ ...(e?.notification?.data || {}), _tapped: "1" }));

    // getToken() registers for remote notifications and returns the FCM token
    // (on iOS after the APNs token is bridged). The listener above covers refreshes.
    try {
      const { token } = await FirebaseMessaging.getToken();
      register(token);
    } catch (e) {
      console.warn("getToken pending (will arrive via tokenReceived)", e);
    }
  } catch (e) {
    // plugin not installed natively / unsupported platform
    console.warn("registerPush skipped", e);
  }
}
