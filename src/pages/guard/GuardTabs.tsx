import { Redirect, Route } from "react-router-dom";
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonRouterOutlet,
  IonLabel,
} from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Home, CalendarDays, Bell, CalendarOff, User } from "lucide-react";
import GuardDashboard from "./GuardDashboard";
import GuardSchedule from "./GuardSchedule";
import GuardPatrol from "./GuardPatrol";
import GuardIncidents from "./GuardIncidents";
import GuardNotices from "./GuardNotices";
import GuardTimeOff from "./GuardTimeOff";
import GuardQuiz from "./GuardQuiz";
import GuardBackup from "./GuardBackup";
import Profile from "../shared/Profile";

export default function GuardTabs() {
  const { t } = useTranslation();
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route exact path="/guard/dashboard" component={GuardDashboard} />
        <Route exact path="/guard/schedule" component={GuardSchedule} />
        <Route exact path="/guard/notices" component={GuardNotices} />
        <Route exact path="/guard/time-off" component={GuardTimeOff} />
        <Route exact path="/guard/quiz" component={GuardQuiz} />
        <Route exact path="/guard/backup" component={GuardBackup} />
        <Route exact path="/guard/profile" component={Profile} />
        {/* Station-scoped — reachable only from the on-duty view, not the tab bar */}
        <Route exact path="/guard/patrol" component={GuardPatrol} />
        <Route exact path="/guard/incidents" component={GuardIncidents} />
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
          <IonLabel>{t("nav.dashboard")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="schedule" href="/guard/schedule">
          <CalendarDays size={22} />
          <IonLabel>{t("nav.schedule")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="notices" href="/guard/notices">
          <Bell size={22} />
          <IonLabel>{t("nav.notices")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="timeoff" href="/guard/time-off">
          <CalendarOff size={22} />
          <IonLabel>{t("nav.timeOff")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="profile" href="/guard/profile">
          <User size={22} />
          <IonLabel>{t("nav.profile")}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}
