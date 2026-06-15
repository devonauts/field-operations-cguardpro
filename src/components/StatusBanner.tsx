import { WifiOff, BatteryWarning } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";

/**
 * App-wide resilience banner: a thin strip pinned to the top that warns the guard
 * when the device is offline or the battery is critically low. Renders nothing in
 * the normal (online, healthy battery) case.
 */
export function StatusBanner() {
  const { t } = useTranslation();
  const { online, batteryLevel, charging } = useDeviceStatus();

  const pct = batteryLevel != null ? Math.round(batteryLevel * 100) : null;
  const lowBattery = batteryLevel != null && batteryLevel <= 0.15 && !charging;

  if (online && !lowBattery) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[2000] flex flex-col"
      style={{ top: 0, paddingTop: "env(safe-area-inset-top)" }}
    >
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-critical px-3 py-1.5 text-[11px] font-bold text-white">
          <WifiOff size={13} />
          {t("net.offline", "Sin conexión — los cambios se guardarán y se enviarán al reconectar.")}
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
