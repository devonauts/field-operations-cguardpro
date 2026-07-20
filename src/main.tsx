import React from "react";
import { createRoot } from "react-dom/client";
import { setupIonicReact } from "@ionic/react";
import { pageTransition } from "./lib/pageTransition";

/* Core Ionic CSS (required) — imported via ionic.css into the `ionic` cascade
   layer so Tailwind utilities win over Ionic's unlayered button/padding resets. */
import "./ionic.css";

/* App theme + Tailwind */
import "./theme/variables.css";
import "./index.css";

import "./i18n";
import App from "./App";
import { Capacitor } from "@capacitor/core";
import { installGlobalErrorLogging, logInfo } from "./lib/errorLog";
import { initTapFeedback } from "./lib/feedback";
import { initDutyStateListeners } from "./lib/dutyState";
import { initOfflineQueue } from "./lib/offlineQueue";
import "./lib/offlineReplayers";
import { applyThemeClass, getStoredTheme } from "./context/ThemeContext";
import { initBrandingCache } from "./lib/appBranding";

// Tenant branding (Hub móvil): re-apply the cached accent/logo config BEFORE
// first paint (no flash of default gold) and seed the tenant's default theme
// on a true first launch — must run before applyThemeClass reads storage.
initBrandingCache();

// Apply the persisted theme class to <html> BEFORE React renders so there is no
// flash of the wrong theme on cold start. Default is DARK (no class).
applyThemeClass(getStoredTheme());

// Capture uncaught errors + unhandled rejections app-wide (viewable in
// Profile → Diagnostics). Install before anything else can throw.
installGlobalErrorLogging();

// Global tap feedback: every button gets a light haptic + click sound
// (respecting the Profile "Sonidos y vibración" toggle), de-duped against
// components that already emit their own richer feedback.
initTapFeedback();

// Cross-tab/webview on-duty sync listeners (idempotent + abortable).
initDutyStateListeners();

// Replay any mutations queued while offline, and flush on every reconnect.
initOfflineQueue();

// One-time environment snapshot — camera (getUserMedia) and geolocation BOTH
// require a secure context (HTTPS or localhost). If `secureContext` is false
// (e.g. the web build opened over http://<lan-ip>), that's why the selfie and
// location fail. Logged as info so it isn't mistaken for an error.
logInfo("env", "startup", {
  platform: Capacitor.getPlatform(),
  native: Capacitor.isNativePlatform(),
  secureContext: (window as any).isSecureContext,
  mediaDevices: !!navigator.mediaDevices,
  geolocation: !!navigator.geolocation,
  origin: location.origin,
});

// Keep Material component styling, but use the native iOS slide for PAGE
// transitions. The md transition fades the entering page in while the leaving
// page stays fully visible underneath — so pushing a sub-page (e.g. Perfil →
// Avisos) shows the old page bleeding through. The iOS transition slides the
// entering page in opaque from the right with a parallax exit, so there's no
// double-exposure.
// Material component styling, but a real native push/pop page slide (mode-agnostic,
// see pageTransition) + the native edge swipe-back gesture (off by default in md).
setupIonicReact({ mode: "md", navAnimation: pageTransition, swipeBackEnabled: true });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* Hide the native splash once the app has painted, with a gentle fade.
   No-op on web. Kept outside React render so a re-render can't re-trigger it. */
if (Capacitor.isNativePlatform()) {
  const hideSplash = () =>
    import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 350 }))
      .catch(() => {});
  // Do NOT gate this on requestAnimationFrame: rAF freezes when the app is
  // launched with the screen off (push/monkey launches under Doze) — the
  // native splash then never hid and the app looked frozen on the logo while
  // the web app ran underneath. Plain timers + a visibility fallback make the
  // hide unconditional; SplashScreen.hide() is idempotent.
  setTimeout(hideSplash, 250);
  setTimeout(hideSplash, 1500);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") hideSplash();
  });
}
