import { useEffect } from "react";
import { IonApp, IonSpinner } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { registerPush, reportDevice } from "./lib/push";
import AnimatedSplash from "./components/AnimatedSplash";
import Login from "./pages/Login";
import GuardTabs from "./pages/guard/GuardTabs";
import SupervisorTabs from "./pages/supervisor/SupervisorTabs";
import { SUPERVISOR_ROLE } from "./lib/roles";

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
      <div className="flex min-h-screen items-center justify-center bg-navy">
        <IonSpinner name="crescent" style={{ color: "#d4a017" }} />
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  return role === SUPERVISOR_ROLE ? <SupervisorTabs /> : <GuardTabs />;
}

export default function App() {
  return (
    <IonApp>
      <AnimatedSplash />
      <AuthProvider>
        <IonReactRouter>
          <Gate />
        </IonReactRouter>
      </AuthProvider>
    </IonApp>
  );
}
