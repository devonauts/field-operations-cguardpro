import { Redirect, Route } from "react-router-dom";
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonRouterOutlet,
  IonLabel,
} from "@ionic/react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  UserCheck,
  AlertTriangle,
  Map,
  MoreHorizontal,
} from "lucide-react";
import SupervisorDashboard from "./SupervisorDashboard";
import CheckInOut from "./CheckInOut";
import SupervisorIncidents from "./SupervisorIncidents";
import PatrolTracking from "./PatrolTracking";
import ShiftSchedule from "./ShiftSchedule";
import Reports from "./Reports";
import More from "./More";
import UniformInspection from "./UniformInspection";
import BackupConfirm from "./BackupConfirm";
import Profile from "../shared/Profile";
import fb from "@/lib/feedback";

export default function SupervisorTabs() {
  const { t } = useTranslation();
  return (
    <IonTabs onIonTabsDidChange={() => fb.select()}>
      <IonRouterOutlet animated>
        <Route exact path="/supervisor/dashboard" component={SupervisorDashboard} />
        <Route exact path="/supervisor/checkin" component={CheckInOut} />
        <Route exact path="/supervisor/incidents" component={SupervisorIncidents} />
        <Route exact path="/supervisor/patrol" component={PatrolTracking} />
        <Route exact path="/supervisor/more" component={More} />
        <Route exact path="/supervisor/schedule" component={ShiftSchedule} />
        <Route exact path="/supervisor/reports" component={Reports} />
        <Route exact path="/supervisor/uniform" component={UniformInspection} />
        <Route exact path="/supervisor/backup" component={BackupConfirm} />
        <Route exact path="/supervisor/profile" component={Profile} />
        <Route exact path="/supervisor">
          <Redirect to="/supervisor/dashboard" />
        </Route>
        <Route>
          <Redirect to="/supervisor/dashboard" />
        </Route>
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        <IonTabButton tab="dashboard" href="/supervisor/dashboard">
          <LayoutDashboard size={22} />
          <IonLabel>{t("nav.dashboard")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="checkin" href="/supervisor/checkin">
          <UserCheck size={22} />
          <IonLabel>{t("nav.checkInOut")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="incidents" href="/supervisor/incidents">
          <AlertTriangle size={22} />
          <IonLabel>{t("nav.incidents")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="patrol" href="/supervisor/patrol">
          <Map size={22} />
          <IonLabel>{t("nav.patrol")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="more" href="/supervisor/more">
          <MoreHorizontal size={22} />
          <IonLabel>{t("nav.more")}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}
