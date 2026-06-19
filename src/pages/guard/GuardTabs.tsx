import { useCallback, useEffect, useState } from "react";
import { Redirect, Route, useHistory, useLocation } from "react-router-dom";
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonRouterOutlet,
  IonLabel,
} from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Home, MessageSquare, User, UserCheck, GraduationCap, Calendar, Footprints } from "lucide-react";
import GuardDashboard from "./GuardDashboard";
import GuardSchedule from "./GuardSchedule";
import GuardPatrol from "./GuardPatrol";
import GuardIncidents from "./GuardIncidents";
import GuardNotices from "./GuardNotices";
import GuardTimeOff from "./GuardTimeOff";
import GuardQuiz from "./GuardQuiz";
import GuardTraining from "./GuardTraining";
import GuardCourseDetail from "./GuardCourseDetail";
import GuardLesson from "./GuardLesson";
import GuardCourseQuiz from "./GuardCourseQuiz";
import GuardCertificate from "./GuardCertificate";
import GuardBackup from "./GuardBackup";
import GuardPerformance from "./GuardPerformance";
import GuardShiftDetail from "./GuardShiftDetail";
import GuardMap from "./GuardMap";
import GuardRadio from "./GuardRadio";
import GuardMessages from "./GuardMessages";
import GuardThread from "./GuardThread";
import GuardVisitors from "./GuardVisitors";
import GuardPermissions from "./GuardPermissions";
import Profile from "../shared/Profile";
import { messageService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { getDuty, subscribeDuty, setDuty } from "@/lib/dutyState";
import { useAuth } from "@/context/AuthContext";
import fb from "@/lib/feedback";

export default function GuardTabs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const history = useHistory();
  const location = useLocation();

  // Off duty the app is purely informative: hide operational UI (Radio, Patrol).
  const [onDuty, setOnDuty] = useState(getDuty());
  useEffect(() => subscribeDuty(setOnDuty), []);

  // Unread badge on the Messages tab. Seeded from the inbox, bumped by push,
  // reconciled (not hard-zeroed) when the guard opens Messages. (emitPush only
  // reaches mounted handlers, so this shell-level subscriber keeps it live.)
  const [unread, setUnread] = useState(0);

  // Fetch the true unread total from the inbox. Guarded so a stale response
  // can't write after the effect that issued it is torn down.
  const seedUnread = useCallback((alive: () => boolean) => {
    messageService.listThreads({ limit: 50 })
      .then((r: any) => {
        if (alive()) setUnread((r?.rows || []).reduce((s: number, c: any) => s + (c.unreadCount || 0), 0));
      })
      .catch(() => {});
  }, []);

  // Re-seed whenever the signed-in guard changes (Gate keeps GuardTabs mounted
  // across a same-role re-auth, so this must key on the user id, not just mount).
  useEffect(() => {
    let alive = true;
    setUnread(0);
    seedUnread(() => alive);
    return () => { alive = false; };
  }, [userId, seedUnread]);

  // Push-driven updates: live badge increments + navigation side effects.
  useEffect(() => {
    const off = onPush((d: any) => {
      if (d?.type === "message.new") setUnread((n) => n + 1);
      // A radio-check request: jump the guard straight to the Radio screen.
      if (d?.type === "radio.check_request") history.push("/guard/radio");
      // Shift ended → forced clock-out: flip off-duty and return to dashboard.
      if (d?.type === "guard.forced_clockout") {
        setDuty(false);
        history.push("/guard/dashboard");
      }
    });
    return () => { off(); };
  }, [history]);

  // Returning to the Messages tab: reconcile against the inbox (it may have been
  // read elsewhere, and push deltas can drift) rather than blindly zeroing.
  useEffect(() => {
    if (!location.pathname.startsWith("/guard/messages")) return;
    let alive = true;
    seedUnread(() => alive);
    return () => { alive = false; };
  }, [location.pathname, seedUnread]);

  return (
    <>
    <IonTabs onIonTabsDidChange={() => fb.select()}>
      <IonRouterOutlet animated>
        <Route exact path="/guard/dashboard" component={GuardDashboard} />
        <Route exact path="/guard/schedule" component={GuardSchedule} />
        <Route exact path="/guard/notices" component={GuardNotices} />
        <Route exact path="/guard/time-off" component={GuardTimeOff} />
        <Route exact path="/guard/quiz" component={GuardQuiz} />
        {/* Entrenamiento (professional training). Specific routes before the
            :enrollmentId param route so /certificate isn't captured as an id. */}
        <Route exact path="/guard/training" component={GuardTraining} />
        <Route exact path="/guard/training/certificate/:certificateId" component={GuardCertificate} />
        <Route exact path="/guard/training/:enrollmentId/lesson/:lessonId" component={GuardLesson} />
        <Route exact path="/guard/training/:enrollmentId/quiz" component={GuardCourseQuiz} />
        <Route exact path="/guard/training/:enrollmentId" component={GuardCourseDetail} />
        <Route exact path="/guard/backup" component={GuardBackup} />
        <Route exact path="/guard/performance" component={GuardPerformance} />
        <Route exact path="/guard/profile" component={Profile} />
        {/* Tab destinations + the detail screens reached from dashboard cards */}
        <Route exact path="/guard/patrol" component={GuardPatrol} />
        <Route exact path="/guard/incidents" component={GuardIncidents} />
        <Route exact path="/guard/shift" component={GuardShiftDetail} />
        <Route exact path="/guard/map" component={GuardMap} />
        <Route exact path="/guard/radio" component={GuardRadio} />
        <Route exact path="/guard/visitors" component={GuardVisitors} />
        <Route exact path="/guard/messages" component={GuardMessages} />
        <Route exact path="/guard/messages/:conversationId" component={GuardThread} />
        <Route exact path="/guard/permissions" component={GuardPermissions} />
        <Route exact path="/guard">
          <Redirect to="/guard/dashboard" />
        </Route>
        <Route>
          <Redirect to="/guard/dashboard" />
        </Route>
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        <IonTabButton tab="dashboard" href="/guard/dashboard">
          <Home size={22} />
          <IonLabel>{t("nav.home", "Inicio")}</IonLabel>
        </IonTabButton>

        {/* ON DUTY (clocked in): Ronda + Visitantes + Mensajes. */}
        {onDuty && (
          <IonTabButton tab="patrol" href="/guard/patrol">
            <Footprints size={22} />
            <IonLabel>{t("nav.patrol", "Ronda")}</IonLabel>
          </IonTabButton>
        )}
        {onDuty && (
          <IonTabButton tab="visitors" href="/guard/visitors">
            <UserCheck size={22} />
            <IonLabel>{t("nav.visitors", "Visitantes")}</IonLabel>
          </IonTabButton>
        )}
        {onDuty && (
          <IonTabButton tab="messages" href="/guard/messages">
            <span style={{ position: "relative", display: "inline-flex" }}>
              <MessageSquare size={22} />
              {unread > 0 && (
                <span style={{ position: "absolute", top: -5, right: -8, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 9999, background: "var(--critical)", color: "#fff", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center" }}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <IonLabel>{t("nav.messages", "Mensajes")}</IonLabel>
          </IonTabButton>
        )}

        {/* OFF DUTY (not clocked in): Entrenamiento + Horario. */}
        {!onDuty && (
          <IonTabButton tab="training" href="/guard/training">
            <GraduationCap size={22} />
            <IonLabel>{t("nav.training", "Entrenamiento")}</IonLabel>
          </IonTabButton>
        )}
        {!onDuty && (
          <IonTabButton tab="schedule" href="/guard/schedule">
            <Calendar size={22} />
            <IonLabel>{t("nav.schedule", "Horario")}</IonLabel>
          </IonTabButton>
        )}

        <IonTabButton tab="profile" href="/guard/profile">
          <User size={22} />
          <IonLabel>{t("nav.you", "Perfil")}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>

    </>
  );
}
