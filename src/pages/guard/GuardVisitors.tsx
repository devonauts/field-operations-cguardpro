import { IonPage } from "@ionic/react";
import { VisitorFlow } from "@/components/VisitorModal";
import { guardService } from "@/lib/services";
import { useAsync } from "@/lib/useAsync";

/**
 * Visitantes tab — visit control for the guard, scoped to their on-duty station.
 * Reuses the full visitor flow (list / register with ID scan + photo / check-out).
 */
export default function GuardVisitors() {
  const { data } = useAsync(() => guardService.dashboard().catch(() => null));
  const station = (data as any)?.stations?.[0] || null;
  return (
    <IonPage>
      <VisitorFlow station={station} embedded onClose={() => {}} />
    </IonPage>
  );
}
