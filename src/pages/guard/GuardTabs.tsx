import { useEffect, useRef, useState } from "react";
import { Redirect, Route, useHistory, useLocation } from "react-router-dom";
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonRouterOutlet,
  IonLabel,
} from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Home, Radio, MessageSquare, User, UserCheck } from "lucide-react";
import GuardDashboard from "./GuardDashboard";
import GuardSchedule from "./GuardSchedule";
import GuardPatrol from "./GuardPatrol";
import GuardIncidents from "./GuardIncidents";
import GuardNotices from "./GuardNotices";
import GuardTimeOff from "./GuardTimeOff";
import GuardQuiz from "./GuardQuiz";
import GuardBackup from "./GuardBackup";
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
import { getDuty, subscribeDuty } from "@/lib/dutyState";

export default function GuardTabs() {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const radioActive = location.pathname === "/guard/radio";

  // Off duty the app is purely informative: hide operational UI (Radio, Patrol).
  const [onDuty, setOnDuty] = useState(getDuty());
  useEffect(() => subscribeDuty(setOnDuty), []);

  // Unread badge on the Messages tab. Seeded from the inbox, bumped by push,
  // cleared when the guard opens Messages. (emitPush only reaches mounted
  // handlers, so this shell-level subscriber is what keeps the badge live.)
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    messageService.listThreads({ limit: 50 })
      .then((r: any) => { if (active) setUnread((r?.rows || []).reduce((s: number, c: any) => s + (c.unreadCount || 0), 0)); })
      .catch(() => {});
    const off = onPush((d: any) => { if (d?.type === "message.new") setUnread((n) => n + 1); });
    return () => { active = false; off(); };
  }, []);
  useEffect(() => { if (location.pathname.startsWith("/guard/messages")) setUnread(0); }, [location.pathname]);

  // Draggable radio FAB — the guard can place it anywhere; position persists in
  // localStorage (native app storage). A press that doesn't move opens the radio.
  const FAB = 58;
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("radioFabPos") || "null");
      return s && typeof s.x === "number" && typeof s.y === "number" ? s : null;
    } catch { return null; }
  });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onFabDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const r = el.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
  };
  const onFabMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    if (Math.abs(e.clientX - d.sx) > 4 || Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    const x = Math.max(8, Math.min(window.innerWidth - FAB - 8, e.clientX - d.ox));
    const y = Math.max(8, Math.min(window.innerHeight - FAB - 8, e.clientY - d.oy));
    setFabPos({ x, y });
  };
  const onFabUp = () => {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    if (!d.moved) { history.push("/guard/radio"); return; }      // tap → open radio
    setFabPos((p) => { try { if (p) localStorage.setItem("radioFabPos", JSON.stringify(p)); } catch { /* ignore */ } return p; });
  };

  return (
    <>
    <IonTabs>
      <IonRouterOutlet>
        <Route exact path="/guard/dashboard" component={GuardDashboard} />
        <Route exact path="/guard/schedule" component={GuardSchedule} />
        <Route exact path="/guard/notices" component={GuardNotices} />
        <Route exact path="/guard/time-off" component={GuardTimeOff} />
        <Route exact path="/guard/quiz" component={GuardQuiz} />
        <Route exact path="/guard/backup" component={GuardBackup} />
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
        {/* Visit control — ON DUTY only (off duty the app is informative). */}
        {onDuty && (
          <IonTabButton tab="visitors" href="/guard/visitors">
            <UserCheck size={22} />
            <IonLabel>{t("nav.visitors", "Visitantes")}</IonLabel>
          </IonTabButton>
        )}

        <IonTabButton tab="messages" href="/guard/messages">
          <span style={{ position: "relative", display: "inline-flex" }}>
            <MessageSquare size={22} />
            {unread > 0 && (
              <span style={{ position: "absolute", top: -5, right: -8, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 9999, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center" }}>
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

    {/* Floating push-to-talk — ON DUTY only; draggable, sits ON TOP of the tab bar. */}
    {onDuty && (
      <button
        type="button"
        aria-label={t("nav.radio", "Radio")}
        onPointerDown={onFabDown}
        onPointerMove={onFabMove}
        onPointerUp={onFabUp}
        onPointerCancel={onFabUp}
        style={fabPos
          ? { left: fabPos.x, top: fabPos.y, bottom: "auto", transform: "none", touchAction: "none" }
          : { touchAction: "none" }}
        className={`radio-fab-float${radioActive ? " is-active" : ""}`}
      >
        <Radio size={26} strokeWidth={2.2} />
      </button>
    )}
    </>
  );
}
