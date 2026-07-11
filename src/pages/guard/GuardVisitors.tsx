import { IonPage } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { VisitorFlow } from "@/components/VisitorModal";
import { guardService } from "@/lib/services";
import { useAsync } from "@/lib/useAsync";

/**
 * Visitantes — visit control for the guard, scoped to their on-duty station. A
 * pushed DETAIL screen (reached from the on-duty home), so its embedded header
 * gets a back button that pops back up the stack.
 */
export default function GuardVisitors() {
  const history = useHistory();
  const { data } = useAsync(() => guardService.dashboard().catch(() => null));
  const station = (data as any)?.stations?.[0] || null;
  const goBack = () => { if (history.length > 1) history.goBack(); else history.push("/guard/dashboard"); };
  return (
    <IonPage>
      <VisitorFlow station={station} embedded onClose={goBack} />
    </IonPage>
  );
}
