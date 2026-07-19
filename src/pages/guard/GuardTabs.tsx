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
import { Home, MessageSquare, User, GraduationCap, Calendar, Footprints } from "lucide-react";
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
import GuardTasks from "./GuardTasks";
import GuardPermissions from "./GuardPermissions";
import Profile from "../shared/Profile";
import { messageService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { pushBackHandler } from "@/lib/backButton";
import { getDuty, subscribeDuty, setDuty } from "@/lib/dutyState";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/lib/appBranding";
import fb from "@/lib/feedback";

/** Disabled tenant modules land back on the dashboard (deep links included). */
const RedirectHome = () => <Redirect to="/guard/dashboard" />;

/**
 * Notification type → guard screen. Every push the backend sends a guard should
 * land them somewhere sensible when tapped. The backend may also send an explicit
 * `route` (preferred); this map is the fallback so EVERY known type deep-links.
 */
const ROUTE_FOR_TYPE: Record<string, string> = {
  "radio.check_request": "/guard/radio",
  "task.assigned": "/guard/tasks",
  "consigna.due": "/guard/dashboard",
  "consigna.completed": "/guard/dashboard",
  "patrol_start": "/guard/patrol",
  "patrol_complete": "/guard/patrol",
  "message.new": "/guard/messages",
  "schedule_updated": "/guard/schedule",
  "guard.forced_clockout": "/guard/dashboard",
  "memo.created": "/guard/notices",
  "incident_reported": "/guard/incidents",
  "incident_escalated": "/guard/incidents",
  "visitor.arrival": "/guard/visitors",
  "alarm_escalated": "/guard/dashboard",
};

/** Resolve the destination for a push payload (explicit route wins; then type). */
function routeForPush(d: any): string | null {
  if (!d) return null;
  if (typeof d.route === "string" && d.route.startsWith("/guard/")) return d.route;
  const type = d.type as string | undefined;
  if (!type) return null;
  if (type === "message.new") {
    const cid = d.conversationId || d.threadId;
    return cid ? `/guard/messages/${cid}` : "/guard/messages";
  }
  return ROUTE_FOR_TYPE[type] || null;
}

export default function GuardTabs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const history = useHistory();
  const location = useLocation();

  // Hardware back on a NON-home tab root: hop to the home tab (Android
  // bottom-nav convention) instead of letting the router pop across tab
  // stacks. Detail pages (message thread, course, …) fall through to Ionic's
  // router, which pops within the current stack (thread → list).
  useEffect(() => {
    return pushBackHandler(() => {
      const p = history.location.pathname;
      const OTHER_TAB_ROOTS = [
        "/guard/patrol",
        "/guard/training",
        "/guard/schedule",
        "/guard/messages",
        "/guard/profile",
      ];
      if (OTHER_TAB_ROOTS.includes(p)) {
        history.push("/guard/dashboard");
        return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link on notification TAP: tapping ANY push should land the guard on the
  // relevant screen (radio pase, a new task, a message thread, an incident, …).
  useEffect(() => {
    return onPush((d: any) => {
      if (!d || d._tapped !== "1") return;
      const route = routeForPush(d);
      // Don't push the route we're already on: same-route pushes STACK a
      // duplicate Ionic view, and the unbalanced enter/leave events that
      // follow are what used to strand the floating radio button hidden.
      if (route && history.location.pathname !== route) {
        try { fb.tap(); } catch { /* ignore */ }
        history.push(route);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Off duty the app is purely informative: hide operational UI (Radio, Patrol).
  const [onDuty, setOnDuty] = useState(getDuty());
  // Tenant module toggles (Hub móvil) — reactive so a post-login config fetch
  // updates the tab bar/routes without a restart.
  const branding = useBranding();
  const isModuleEnabled = (k: string) => branding.modules?.[k] !== false;
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
      // Skip our own outgoing messages (echoed back by socket/push) — they were
      // inflating the unread badge the moment the guard sent something.
      if (d?.type === "message.new" && String(d?.senderId || "") !== String(userId || "")) {
        setUnread((n) => n + 1);
      }
      // A radio-check request: jump the guard straight to the Radio screen.
      // Only for DATA pushes (foreground) — a tapped notification already
      // navigates via the deep-link handler above; doing both stacked two
      // radio views for the same pase. Skip too if already on the screen.
      if (d?.type === "radio.check_request" && d?._tapped !== "1" && history.location.pathname !== "/guard/radio") {
        history.push("/guard/radio");
      }
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
        {/* Tenant-toggleable convenience modules (Hub móvil in the CRM):
            disabled ones redirect home so deep links/cards can't reach them. */}
        <Route exact path="/guard/time-off" component={isModuleEnabled("timeOff") ? GuardTimeOff : RedirectHome} />
        <Route exact path="/guard/quiz" component={GuardQuiz} />
        {/* Entrenamiento (professional training). Specific routes before the
            :enrollmentId param route so /certificate isn't captured as an id. */}
        <Route exact path="/guard/training" component={isModuleEnabled("training") ? GuardTraining : RedirectHome} />
        <Route exact path="/guard/training/certificate/:certificateId" component={isModuleEnabled("training") ? GuardCertificate : RedirectHome} />
        <Route exact path="/guard/training/:enrollmentId/lesson/:lessonId" component={isModuleEnabled("training") ? GuardLesson : RedirectHome} />
        <Route exact path="/guard/training/:enrollmentId/quiz" component={isModuleEnabled("training") ? GuardCourseQuiz : RedirectHome} />
        <Route exact path="/guard/training/:enrollmentId" component={isModuleEnabled("training") ? GuardCourseDetail : RedirectHome} />
        <Route exact path="/guard/backup" component={isModuleEnabled("backup") ? GuardBackup : RedirectHome} />
        <Route exact path="/guard/performance" component={isModuleEnabled("performance") ? GuardPerformance : RedirectHome} />
        <Route exact path="/guard/profile" component={Profile} />
        {/* Tab destinations + the detail screens reached from dashboard cards */}
        {/* Patrol as a TAB root (no back) vs. pushed from the Inicio "Ronda activa"
            card as a detail (its own path so Ionic doesn't reuse the cached tab
            instance) → the detail shows a native back button. */}
        <Route exact path="/guard/patrol/active" component={GuardPatrol} />
        <Route exact path="/guard/patrol" component={GuardPatrol} />
        <Route exact path="/guard/incidents" component={GuardIncidents} />
        <Route exact path="/guard/shift" component={GuardShiftDetail} />
        <Route exact path="/guard/map" component={isModuleEnabled("map") ? GuardMap : RedirectHome} />
        <Route exact path="/guard/radio" component={GuardRadio} />
        <Route exact path="/guard/visitors" component={isModuleEnabled("visitors") ? GuardVisitors : RedirectHome} />
        <Route exact path="/guard/tasks" component={GuardTasks} />
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

      {/* NAV STABILITY (fix #6): previously the WHOLE operational/info set swapped
          on duty change, so Horario and Mensajes silently vanished and became
          unreachable. Choice: keep a STABLE primary set — Inicio, Horario,
          Mensajes, Perfil are ALWAYS present (no destination disappears). Only a
          single slot is duty-variant: Ronda while on duty (operational),
          Entrenamiento while off duty. Visitantes (on-duty only) stays reachable
          from the on-duty home, so nothing is lost. Least invasive, no coachmark. */}
      <IonTabBar slot="bottom">
        <IonTabButton tab="dashboard" href="/guard/dashboard">
          <Home size={22} />
          <IonLabel>{t("nav.home", "Inicio")}</IonLabel>
        </IonTabButton>

        {/* Duty-variant slot: operational Ronda on duty, Entrenamiento off duty
            (Ronda if the tenant disabled the training module in the Hub móvil). */}
        {onDuty || !isModuleEnabled("training") ? (
          <IonTabButton tab="patrol" href="/guard/patrol">
            <Footprints size={22} />
            <IonLabel>{t("nav.patrol", "Ronda")}</IonLabel>
          </IonTabButton>
        ) : (
          <IonTabButton tab="training" href="/guard/training">
            <GraduationCap size={22} />
            <IonLabel>{t("nav.training", "Entrenamiento")}</IonLabel>
          </IonTabButton>
        )}

        {/* Always present — never vanishes on duty change. */}
        <IonTabButton tab="schedule" href="/guard/schedule">
          <Calendar size={22} />
          <IonLabel>{t("nav.schedule", "Horario")}</IonLabel>
        </IonTabButton>

        {/* Always present — never vanishes on duty change. */}
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

        <IonTabButton tab="profile" href="/guard/profile">
          <User size={22} />
          <IonLabel>{t("nav.you", "Perfil")}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>

    </>
  );
}
