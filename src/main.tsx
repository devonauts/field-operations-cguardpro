import React from "react";
import { createRoot } from "react-dom/client";
import { setupIonicReact } from "@ionic/react";

/* Core Ionic CSS (required) */
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/flex-utils.css";

/* App theme + Tailwind */
import "./theme/variables.css";
import "./index.css";

import "./i18n";
import App from "./App";
import { Capacitor } from "@capacitor/core";
import { installGlobalErrorLogging, logInfo } from "./lib/errorLog";

// Capture uncaught errors + unhandled rejections app-wide (viewable in
// Profile → Diagnostics). Install before anything else can throw.
installGlobalErrorLogging();

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

setupIonicReact({ mode: "md" });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* Hide the native splash once the app has painted, with a gentle fade.
   No-op on web. Kept outside React render so a re-render can't re-trigger it. */
if (Capacitor.isNativePlatform()) {
  import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => {
      requestAnimationFrame(() =>
        setTimeout(
          () => SplashScreen.hide({ fadeOutDuration: 350 }).catch(() => {}),
          200
        )
      );
    })
    .catch(() => {});
}
