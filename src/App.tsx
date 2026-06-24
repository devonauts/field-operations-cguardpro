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
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import GuardTabs from "./pages/guard/GuardTabs";
import SupervisorTabs from "./pages/supervisor/SupervisorTabs";
import { SUPERVISOR_ROLE } from "./lib/roles";
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
  const { loading, isAuthenticated, role } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      registerPush();
      // Guards report their device identity (device management). Other roles'
      // calls are ignored server-side; reportDevice swallows the error.
      if (role !== SUPERVISOR_ROLE) reportDevice();
    }
  }, [isAuthenticated, role]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <IonSpinner name="crescent" className="text-gold" />
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  if (role === SUPERVISOR_ROLE) return <SupervisorTabs />;

  // Guards: live radio stays connected app-wide while on duty (floating PTT),
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
  useEffect(() => { startDeviceStatus(); }, []);

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
