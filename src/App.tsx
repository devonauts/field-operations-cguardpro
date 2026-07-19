import { useEffect, useState } from "react";
import { IonApp, IonSpinner } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ThemeProvider } from "./context/ThemeContext";
import { registerPush, reportDevice } from "./lib/push";
import AnimatedSplash from "./components/AnimatedSplash";
import { StatusBanner } from "./components/StatusBanner";
import { startDeviceStatus } from "./lib/deviceStatus";
import { runBackChain } from "./lib/backButton";
import { subscribeDuty } from "./lib/dutyState";
import { startLocationReporter } from "./lib/locationReporter";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import GuardTabs from "./pages/guard/GuardTabs";
import { RadioProvider } from "./context/RadioContext";
import FloatingRadioButton from "./components/FloatingRadioButton";
import RadioCheckAlert from "./components/RadioCheckAlert";

/**
 * Extract a password-reset token from a deep link. Handles both the custom
 * scheme (cguardpro://reset-password?token=…) and the universal/web link
 * (https://app.cguardpro.com/guard-reset?token=…).
 */
function parseResetToken(url?: string | null): string | null {
  if (!url) return null;
  if (!/reset-password|guard-reset/i.test(url)) return null;
  try {
    const u = new URL(url);
    const token = u.searchParams.get("token");
    if (token) return token;
  } catch {
    /* custom-scheme URLs may not parse in all engines — fall through */
  }
  const m = /[?&]token=([^&#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

function Gate() {
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    // Report the device identity FIRST so the stable device row exists, THEN
    // register the push token onto it (keyed by the same stable deviceId) — this
    // avoids the race that created two device rows and lost the FCM token.
    (async () => {
      await reportDevice();
      await registerPush();
    })();
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <IonSpinner name="crescent" className="text-gold" />
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  // Guards only — supervisors are rejected at login (see lib/roles.ts).
  // Live radio stays connected app-wide while on duty (floating PTT),
  // so the channel works across screens without opening the radio page.
  return (
    <RadioProvider>
      <GuardTabs />
      <FloatingRadioButton />
      {/* Global pase-de-novedades popup (push + poll fallback) — see RadioCheckAlert. */}
      <RadioCheckAlert />
    </RadioProvider>
  );
}

export default function App() {
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Start network + battery monitoring once for the whole app.
  useEffect(() => { startDeviceStatus(); startLocationReporter(); }, []);

  // Clock-out invalidates any locally-persisted round session. Without this the
  // Rondas tab resurrects a PREVIOUS shift's in-progress round from localStorage
  // while the backend (per-shift by design) no longer reports it — so the tab
  // showed "Ronda en curso" next to a home card saying "Sin ruta".
  useEffect(
    () =>
      subscribeDuty((onDuty) => {
        if (onDuty) return;
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (k.startsWith("ronda.session.") || k.startsWith("ronda.scanned."))) {
              localStorage.removeItem(k);
            }
          }
        } catch { /* ignore */ }
      }),
    [],
  );

  // Android hardware back. Capacitor fires BOTH the App-plugin listener AND a
  // document 'backbutton' event that Ionic core turns into 'ionBackButton' and
  // routes (IonRouterOutlet pops a view at priority 0). A previous version
  // ALSO navigated from the plugin listener, so every press navigated twice
  // (back from a message thread skipped the list and landed on the prior tab).
  // Correct wiring: keep an EMPTY plugin listener — its existence is what
  // stops Capacitor's raw webview.goBack() default — and do all custom
  // handling via 'ionBackButton' at priority 90 (below Ionic overlays at 100,
  // above the router at 0): app handlers (pushBackHandler) get first refusal,
  // then minimize at the home root, else let Ionic's router pop one view.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        sub = await CapApp.addListener("backButton", () => { /* handled via ionBackButton */ });
      } catch { /* not native */ }
    })();
    const onIonBack = (ev: any) => {
      ev.detail?.register?.(90, (processNextHandler: () => void) => {
        runBackChain(true, () => {
          const p = window.location.pathname;
          // Home root (or pre-auth screens): minimize instead of exiting.
          if (p === "/guard/dashboard" || !p.startsWith("/guard/")) {
            CapApp.minimizeApp?.();
            return;
          }
          processNextHandler(); // Ionic's router pops one view
        });
      });
    };
    document.addEventListener("ionBackButton", onIonBack);
    return () => {
      document.removeEventListener("ionBackButton", onIonBack);
      try { sub?.remove(); } catch { /* ignore */ }
    };
  }, []);

  // Listen for reset deep links (cold start + while running) and the web URL.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        const launch = await CapApp.getLaunchUrl();
        const tk = parseResetToken(launch?.url);
        if (tk) setResetToken(tk);
      } catch {
        /* not native / no launch url */
      }
      try {
        sub = await CapApp.addListener("appUrlOpen", (data: { url: string }) => {
          const tk = parseResetToken(data?.url);
          if (tk) setResetToken(tk);
        });
      } catch {
        /* listener unavailable on web */
      }
    })();
    // Web/PWA fallback (opened in a browser with ?token=).
    try {
      const tk = parseResetToken(window.location.href);
      if (tk) setResetToken(tk);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        sub?.remove();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <ThemeProvider>
      <IonApp>
        <AnimatedSplash />
        <StatusBanner />
        <AuthProvider>
          <NotificationProvider>
            <IonReactRouter>
              {resetToken ? (
                <ResetPassword token={resetToken} onDone={() => setResetToken(null)} />
              ) : (
                <Gate />
              )}
            </IonReactRouter>
          </NotificationProvider>
        </AuthProvider>
      </IonApp>
    </ThemeProvider>
  );
}
