import { Redirect, Route } from "react-router-dom";
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonRouterOutlet,
  IonLabel,
} from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Home, Footprints, Radio, Map, User } from "lucide-react";
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
        {/* Tab destinations + the detail screens reached from dashboard cards */}
        <Route exact path="/guard/patrol" component={GuardPatrol} />
        <Route exact path="/guard/incidents" component={GuardIncidents} />
        <Route exact path="/guard/shift" component={GuardShiftDetail} />
        <Route exact path="/guard/map" component={GuardMap} />
        <Route exact path="/guard/radio" component={GuardRadio} />
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
        <IonTabButton tab="patrol" href="/guard/patrol">
          <Footprints size={22} />
          <IonLabel>{t("nav.patrol", "Ronda")}</IonLabel>
        </IonTabButton>

        {/* Center push-to-talk — raised gold control (design signature) */}
        <IonTabButton tab="radio" href="/guard/radio" className="tab-radio">
          <span className="radio-fab">
            <Radio size={24} strokeWidth={2.2} />
          </span>
          <IonLabel className="radio-label">{t("nav.radio", "Radio")}</IonLabel>
        </IonTabButton>

        <IonTabButton tab="map" href="/guard/map">
          <Map size={22} />
          <IonLabel>{t("nav.map", "Mapa")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="profile" href="/guard/profile">
          <User size={22} />
          <IonLabel>{t("nav.you", "Perfil")}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}
