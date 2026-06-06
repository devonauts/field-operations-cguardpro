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
      // We hide it from JS once the app has painted (see src/main.tsx) for a
      // smooth fade with no white flash — so autoHide stays off.
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: "#0A0E16",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
