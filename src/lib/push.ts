import { Capacitor } from "@capacitor/core";
import { rondasService } from "./rondas";
import { getDeviceIdentity } from "./device";
import { emitPush } from "./pushEvents";

/**
 * Show a heads-up banner for a push that arrived while the app is in the
 * FOREGROUND. Android's FCM SDK only auto-displays notification messages when
 * the app is backgrounded/killed; in the foreground nothing appears, so a guard
 * with the app open never saw incoming messages/pases. We render it ourselves
 * via LocalNotifications. Best-effort; never throws.
 */
async function showForegroundBanner(data: any): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform() || !data) return;
    const title = data.title || data.notificationTitle;
    const body = data.body || data.notificationBody || data.message;
    if (!title && !body) return; // data-only signal (e.g. badge sync) — no banner
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") await LocalNotifications.requestPermissions();
    } catch { /* fall through — schedule may still work */ }
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Date.now() % 2147483647),
        title: title || "CGuardPro",
        body: body || "",
        channelId: "default",
        // Carry the payload so a tap deep-links exactly like an FCM tap.
        extra: data,
      }],
    });
  } catch (e) {
    console.warn("foreground banner skipped", e);
  }
}

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

    const register = async (token?: string | null) => {
      if (!token) return;
      // Send the stable install id so the backend attaches the token to the
      // guard's real device row (same key as reportDevice) instead of a
      // duplicate token-keyed row. Surface failures (don't swallow silently).
      let deviceId: string | null = null;
      try { deviceId = (await getDeviceIdentity())?.deviceId ?? null; } catch { /* optional */ }
      try {
        await rondasService.registerDeviceToken(token, deviceId);
      } catch (e) {
        console.warn("registerDeviceToken failed", e);
      }
    };

    await FirebaseMessaging.removeAllListeners();
    // The FCM registration token (re-issued over time → keep the backend in sync).
    FirebaseMessaging.addListener("tokenReceived", (e: any) => register(e?.token));
    // Foreground arrival → fan the payload out so screens can react immediately,
    // AND show a heads-up banner (Android doesn't display FCM notifications while
    // the app is foregrounded — the guard would otherwise see nothing).
    FirebaseMessaging.addListener("notificationReceived", (e: any) => {
      const n = e?.notification || {};
      const data = n.data || {};
      emitPush(data);
      // Prefer the FCM notification's own title/body; fall back to data fields.
      showForegroundBanner({ ...data, title: data.title || n.title, body: data.body || n.body });
    });
    // A tap on a LOCAL notification (our foreground banner) must deep-link the
    // same way as an FCM tap.
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.removeAllListeners();
      LocalNotifications.addListener("localNotificationActionPerformed", (e: any) =>
        emitPush({ ...(e?.notification?.extra || {}), _tapped: "1" }));
    } catch { /* plugin unavailable */ }
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
