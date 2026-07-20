import { useEffect, useState } from "react";
import { WifiOff, BatteryWarning, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { subscribePending } from "@/lib/offlineQueue";

/**
 * App-wide resilience banner: a thin strip pinned to the top that warns the guard
 * when the device is offline, the battery is critically low, or there are actions
 * queued offline waiting to send. Renders nothing in the normal healthy case.
 */
export function StatusBanner() {
  const { t } = useTranslation();
  const { online, batteryLevel, charging } = useDeviceStatus();
  const [pending, setPending] = useState(0);
  useEffect(() => subscribePending(setPending), []);

  const pct = batteryLevel != null ? Math.round(batteryLevel * 100) : null;
  const lowBattery = batteryLevel != null && batteryLevel <= 0.15 && !charging;

  if (online && !lowBattery && pending === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[25000] flex flex-col sm:mx-auto sm:max-w-[430px]"
      style={{ top: 0, paddingTop: "env(safe-area-inset-top)" }}
    >
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-critical px-3 py-1.5 text-[11px] font-bold text-white">
          <WifiOff size={13} />
          {t("net.offline", "Sin conexión — algunas acciones no estarán disponibles hasta que se restablezca.")}
        </div>
      )}
      {pending > 0 && (
        <div className="flex items-center justify-center gap-2 bg-info px-3 py-1.5 text-[11px] font-bold text-white">
          <RefreshCw size={13} className={online ? "animate-spin" : ""} />
          {online
            ? t("net.syncing", "Enviando acciones pendientes…")
            : `${pending} ${pending === 1 ? t("net.pendingOne", "acción pendiente por enviar") : t("net.pendingMany", "acciones pendientes por enviar")}`}
        </div>
      )}
      {online && lowBattery && (
        <div className="flex items-center justify-center gap-2 bg-high px-3 py-1.5 text-[11px] font-bold text-on-accent">
          <BatteryWarning size={13} />
          {`${t("net.lowBattery", "Batería baja")}${pct != null ? ` (${pct}%)` : ""} — ${t("net.charge", "conecta un cargador.")}`}
        </div>
      )}
    </div>
  );
}
