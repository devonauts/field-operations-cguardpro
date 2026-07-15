import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, MapPin, Navigation, Wifi, ShieldCheck } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Loader, EmptyState } from "@/components/ui";
import { StatusChip } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { getCurrentPosition } from "@/lib/geo";
import { onPush } from "@/lib/pushEvents";
import { ClockOutFlow } from "@/components/ClockOutFlow";

function useElapsed(since: any): { clock: string; label: string } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = new Date(since).getTime();
  if (!since || Number.isNaN(start)) return { clock: "00:00:00", label: "0h 00m" };
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { clock: `${pad(h)}:${pad(m)}:${pad(s % 60)}`, label: `${h}h ${pad(m)}m` };
}

const fmtClock = (d: any) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "—";
  }
};

export default function GuardShiftDetail() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(() => guardService.dashboard());

  // Live early-clock-out decision on THIS screen — the one that actually hosts
  // the clock-out button. The dashboard's poll/push only refreshed its own
  // copy of the data, so the button here never flipped to "aprobada" without a
  // manual pull-to-refresh. reload() is silent (no loading flash).
  const pendingClockOut = data?.clockOutRequest?.status === "pending";
  useEffect(() => {
    if (!pendingClockOut) return;
    const id = setInterval(() => { reload(); }, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClockOut]);
  useEffect(() => {
    const off = onPush((d: any) => {
      const type = d?.type || d?.data?.type;
      if (type === "attendance.clockout_approved" || type === "attendance.clockout_rejected") {
        reload();
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const punchInTime = data?.activeClockIn?.punchInTime || data?.activeClockIn?.createdAt;
  const elapsed = useElapsed(punchInTime);
  const station = data?.stations?.[0] || {};
  const schedStart = data?.activeClockIn?.scheduledStart || data?.currentShift?.startTime;
  const schedEnd =
    data?.activeClockIn?.scheduledEnd || data?.scheduledEnd || data?.currentShift?.endTime;
  const minsToEnd =
    data?.minutesToScheduledEnd != null ? Math.max(0, Math.round(Number(data.minutesToScheduledEnd))) : null;
  const remaining =
    minsToEnd != null ? `${Math.floor(minsToEnd / 60)}h ${String(minsToEnd % 60).padStart(2, "0")}m` : null;

  // Live verification chips.
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    let alive = true;
    getCurrentPosition()
      .then(() => { if (alive) setGpsOk(true); })
      .catch(() => { if (alive) setGpsOk(false); });
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      alive = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <Screen back title={t("onduty.currentShift", "Turno actual")} subtitle={station.stationName || station.name}
      onRefresh={async () => { await reload(); }}>
      {loading ? (
        <Loader />
      ) : !data?.isClockedIn ? (
        <EmptyState title={t("shift.noActive", "No tienes un turno activo")} hint={t("shift.clockInFirst", "Marca entrada para iniciar tu turno.")} />
      ) : (
        <div className="space-y-4">
          {/* Live timer */}
          <div className="glow-gold relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-surface to-background p-5 text-center">
            <div className="grid-overlay absolute inset-0 opacity-40" />
            <div className="relative">
              <span className="label-eyebrow">{t("onduty.elapsedTime", "Tiempo en turno")}</span>
              <p className="mt-1 font-mono text-[52px] font-bold leading-none tracking-tight text-gold tabular-nums">
                {elapsed.clock}
              </p>
              <p className="mt-2 text-sm text-muted">
                {schedStart && schedEnd
                  ? `${t("onduty.shiftWord", "Turno")} ${fmtClock(schedStart)} – ${fmtClock(schedEnd)}`
                  : `${t("onduty.started", "Inició")} ${fmtClock(punchInTime)}`}
                {remaining && <> · {t("onduty.remainingShort", "{{r}} restante", { r: remaining })}</>}
              </p>
            </div>
          </div>

          {/* Verification chips */}
          <div className="card-elev flex divide-x divide-line p-3">
            <StatusChip icon={<MapPin size={14} />} label={t("onduty.insideGeofence", "En geocerca")} ok />
            <StatusChip icon={<Navigation size={14} />} label={t("onduty.gpsVerified", "GPS verificado")} ok={gpsOk !== false} />
            <StatusChip icon={<Wifi size={14} />} label={t("onduty.deviceOnline", "En línea")} ok={online} />
          </div>

          {/* Post info */}
          <div className="card-elev p-4">
            <span className="label-eyebrow">{t("guard.myPost", "Mi puesto")}</span>
            <div className="mt-2 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
                <ShieldCheck size={22} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {station.stationName || station.name || t("guard.noStations", "Sin puesto")}
                </p>
                {(station.startingTimeInDay || station.finishTimeInDay) && (
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Clock size={12} />
                    {(station.startingTimeInDay || "?") + " — " + (station.finishTimeInDay || "?")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Clock-out (with early-out approval gate) */}
          <div className="pt-1">
            <ClockOutFlow data={data} reload={reload} />
          </div>
        </div>
      )}
    </Screen>
  );
}
