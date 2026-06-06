import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import en from "./locales/en.json";
import es from "./locales/es.json";

// "appLangChoice" holds ONLY an explicit in-app language choice (es/en). When
// it's absent the app is in AUTO mode and follows the device language, fresh on
// every launch. Purge the legacy "appLanguage" key: the old detector cached the
// auto-detected language there as if it were a choice, which permanently pinned
// the app to whatever language it first launched in (so changing the phone
// language did nothing).
const CHOICE_KEY = "appLangChoice";
try {
  localStorage.removeItem("appLanguage");
} catch {
  /* ignore */
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    // Auto-detect from device/browser; fall back to Spanish.
    fallbackLng: "es",
    supportedLngs: ["es", "en"],
    nonExplicitSupportedLngs: true, // es-MX -> es, en-US -> en
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      // Explicit choice wins; otherwise follow the device language every launch.
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: CHOICE_KEY,
      // NEVER auto-persist the detected language — that's what pinned it before.
      // Explicit choices are saved by the Profile screen under CHOICE_KEY.
      caches: [],
    },
  });

// Best-effort dynamic follow: when the app returns to the foreground in AUTO
// mode, re-sync to the current device language. Most OSes restart the app on a
// language change (so per-launch detection already covers it); this catches the
// cases where the WebView's navigator.language updated without a full restart.
if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener("resume", () => {
    if (localStorage.getItem(CHOICE_KEY)) return; // explicit choice — leave it
    const nav = (navigator.language || "es").slice(0, 2);
    const want = nav === "en" ? "en" : "es";
    if (i18n.language !== want) void i18n.changeLanguage(want);
  }).catch(() => {
    /* listener registration is best-effort */
  });
}

export default i18n;
