import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cguardpro.operaciones",
  appName: "CGuardPro",
  webDir: "dist",
  backgroundColor: "#0A0E16",
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0A0E16",
    },
    SplashScreen: {
      // NATIVE auto-hide as the safety net: when the app launches with the
      // screen off (push/Doze), the JS hide() call can no-op and the native
      // splash stayed up FOREVER (app looked dead on the logo). The JS hide in
      // main.tsx still fires earlier for the smooth fade in the normal case;
      // this timer guarantees the splash always clears. The in-app
      // AnimatedSplash covers the visual handoff either way.
      launchAutoHide: true,
      launchShowDuration: 2500,
      backgroundColor: "#0A0E16",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
