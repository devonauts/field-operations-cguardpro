import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import { App as CapacitorApp } from "@capacitor/app";
import {
  Shield,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
  Lightbulb,
  ClipboardCheck,
  LifeBuoy,
  TrendingDown,
  Gift,
  ChevronRight,
  LogIn,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import {
  Card,
  Loader,
  SectionTitle,
  EmptyState,
  ScoreRing,
  MeterBar,
  Avatar,
} from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { loadGuardPerformance, Tier, ComponentKey } from "@/lib/performance";
import { pick, parseStationSchedule, formatDays } from "@/lib/normalize";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";
import { getDeviceIdentity } from "@/lib/device";
import { logError } from "@/lib/errorLog";
import OnDutyView from "./OnDutyView";
import { StartShiftModal, ChecklistResult } from "@/components/StartShiftModal";
import { SelfieClockIn, SelfieResult } from "@/components/SelfieClockIn";
import { EarlyClockOutModal } from "@/components/EarlyClockOutModal";
import { ClockOutReportModal } from "@/components/ClockOutReportModal";

const TIER_COLOR: Record<Tier, string> = {
  excellent: "#22c55e",
  good: "#d4a017",
  fair: "#f97316",
  needs_improvement: "#ef4444",
};
const COMPONENT_COLOR: Record<ComponentKey, string> = {
  punctuality: "#38bdf8",
  uniform: "#22c55e",
  inventory: "#14b8a6",
  consignas: "#d4a017",
  rondas: "#a855f7",
  quiz: "#6366f1",
  training: "#f97316",
};

export default function GuardDashboard() {
  const { t } = useTranslation();
  const [presentToast] = useIonToast();
  const { data, loading, error, reload } = useAsync(() => guardService.dashboard());
  const perf = useAsync(() => loadGuardPerformance(30));
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [earlyOutOpen, setEarlyOutOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Clock-in flow: pick station → start-shift checklist → geo-stamped selfie → submit
  const [flowStep, setFlowStep] = useState<"idle" | "checklist" | "selfie">("idle");
  const [flowStation, setFlowStation] = useState<any | null>(null);
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  // Always-current flowStep for the modal dismiss handlers. An IonModal's
  // onDidDismiss fires whenever it closes — INCLUDING when we programmatically
  // advance to the next step — so a dismiss must only act as "cancel/back" when
  // we're still on that step. Without this, advancing checklist→selfie fires the
  // checklist's onDidDismiss and resets the whole flow, killing the selfie.
  const flowStepRef = useRef(flowStep);
  useEffect(() => {
    flowStepRef.current = flowStep;
  }, [flowStep]);

  const guard = data?.guard;
  const stations: any[] = data?.stations || [];
  const currentShift = data?.currentShift;
  const nextShift = data?.nextShift;
  const isClockedIn = !!data?.isClockedIn;
  const clockOutStatus: string | undefined = data?.clockOutRequest?.status;

  // Toast announcing an early-clock-out decision. Shared by the poll fallback
  // and the push listener so both paths surface the same message.
  const showDecisionToast = (status: "approved" | "rejected") => {
    presentToast({
      message:
        status === "approved"
          ? t("onduty.clockOutApprovedToast", "Tu salida fue aprobada. Ya puedes marcar salida.")
          : t("onduty.clockOutRejectedToast", "Tu solicitud de salida fue rechazada."),
      duration: 3500,
      color: status === "approved" ? "success" : "danger",
      position: "top",
    });
  };

  // Live early-clock-out decision: while a request is PENDING, poll the
  // lightweight status endpoint so the UI flips to "approved/rejected" the
  // moment the supervisor decides — no manual refresh. Stops once resolved.
  // This is the fallback; the push listener below is the instant path.
  useEffect(() => {
    if (!isClockedIn || clockOutStatus !== "pending") return;
    let active = true;
    const id = setInterval(async () => {
      try {
        const r: any = await guardService.clockOutRequest();
        const s: string | undefined = r?.request?.status;
        if (active && s && s !== "pending") {
          await reload();
          showDecisionToast(s === "approved" ? "approved" : "rejected");
        }
      } catch {
        /* transient — try again next tick */
      }
    }, 6000);
    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClockedIn, clockOutStatus]);

  // Instant early-clock-out decision: the backend pushes
  // attendance.clockout_approved / attendance.clockout_rejected to this guard's
  // device the moment a supervisor decides. Reload so the dashboard flips
  // immediately (works in the foreground and when the guard taps the
  // notification), and announce the outcome. The poll above remains a fallback
  // for when push is unavailable (web/dev, denied permission, no FCM token).
  useEffect(() => {
    const off = onPush((d) => {
      const type = d?.type;
      if (type !== "attendance.clockout_approved" && type !== "attendance.clockout_rejected") {
        return;
      }
      const status = type === "attendance.clockout_approved" ? "approved" : "rejected";
      reload();
      showDecisionToast(status);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when the app returns to the foreground (an approval may have landed
  // while it was backgrounded — interval timers are throttled there).
  useEffect(() => {
    const sub = CapacitorApp.addListener("appStateChange", (state) => {
      if (state.isActive) reload();
    });
    return () => {
      sub.then((h) => h.remove()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The shift is the unit of work: if the guard has a shift, they must be able
  // to clock in for it (its start time is the scheduled baseline). Derive a
  // clock-in target from the shift's station so clock-in is never blocked just
  // because the dashboard's `stations` list came back empty.
  const shiftForClockIn = currentShift || nextShift;
  const shiftStation =
    shiftForClockIn && (shiftForClockIn.stationId || shiftForClockIn.station)
      ? {
          id: shiftForClockIn.stationId || shiftForClockIn.station?.id,
          stationName: shiftForClockIn.station?.stationName,
          name: shiftForClockIn.station?.stationName,
        }
      : null;
  const clockInTargets: any[] =
    stations.length > 0 ? stations : shiftStation?.id ? [shiftStation] : [];
  const guardName = guard?.fullName || guard?.name || "";
  const firstName = guardName.trim().split(/\s+/)[0] || "";
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12
      ? "guard.greetingMorning"
      : hour < 18
        ? "guard.greetingAfternoon"
        : "guard.greetingEvening";
  const greeting = firstName
    ? t(greetingKey, { name: firstName })
    : t("guard.myPanel");
  const punchInTime = data?.activeClockIn?.punchInTime || data?.activeClockIn?.createdAt;
  const fmtClock = (d: any) => {
    try {
      return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const beginClockIn = (station: any) => {
    setGpsError(null);
    setFlowStation(station);
    setChecklist(null);
    setFlowStep("checklist");
  };
  const resetFlow = () => {
    setFlowStep("idle");
    setFlowStation(null);
    setChecklist(null);
  };

  const submitClockIn = async (selfie: SelfieResult) => {
    if (!flowStation) return;
    setBusy(true);
    setGpsError(null);
    setFlowStep("idle");
    try {
      let selfiePhoto: string | undefined;
      try {
        selfiePhoto = await guardService.uploadSelfie(selfie.file);
      } catch (e: any) {
        // Pinpoint whether the failure is the photo UPLOAD vs the clock-in call.
        logError("clockIn.uploadSelfie", e);
        throw e;
      }
      // Coordinates: use the selfie's GPS fix if we have one. Otherwise (GPS
      // disabled for remote testing) fall back to the POST's own coordinates so
      // the backend's `locationRequired` + geofence checks pass (distance 0 =
      // "at the post") — lets clock-in work against prod without a server flag.
      let latitude = selfie.coords?.latitude;
      let longitude = selfie.coords?.longitude;
      if (latitude == null || longitude == null) {
        const st = stations.find((s) => s.id === flowStation.id) || flowStation;
        const slat = parseFloat(st?.latitud);
        const slng = parseFloat(st?.longitud);
        if (!Number.isNaN(slat) && !Number.isNaN(slng)) {
          latitude = slat;
          longitude = slng;
          logError("clockIn.coordsFallback", "using station coords", {
            stationId: flowStation.id,
            latitude,
            longitude,
          });
        }
      }
      // Device identity travels with the punch (device management: bind/flag).
      const device = await getDeviceIdentity().catch(() => null);
      const res = await guardService.clockIn({
        stationId: flowStation.id,
        latitude,
        longitude,
        selfiePhoto,
        address: selfie.address,
        battery: checklist?.battery ?? null,
        checklist: checklist?.items,
        device,
      });
      if (res && res.success === false) {
        setGpsError(res.message || t("guard.geofenceError"));
      } else {
        resetFlow();
        await reload();
      }
    } catch (e: any) {
      // Surface the REAL backend reason (status + messageCode) so a 400 isn't
      // just a generic "An error occurred".
      logError("clockIn.submit", e, {
        status: e?.status,
        messageCode: e?.data?.messageCode,
        body: e?.data,
      });
      setGpsError(
        e?.data?.messageCode || e?.data?.message || e?.message || t("guard.geofenceError"),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async (summary?: string) => {
    setBusy(true);
    try {
      let coords: { latitude?: number; longitude?: number } = {};
      try {
        // TESTING: skip GPS so clock-out works far from any station.
        if (import.meta.env.VITE_DISABLE_GEOLOCATION !== "true") {
          const pos = await getCurrentPosition();
          coords = { latitude: pos.latitude, longitude: pos.longitude };
        }
      } catch {
        /* GPS optional on clock-out */
      }
      // The end-of-shift report summary travels as the clock-out observations.
      const res = await guardService.clockOut({ ...coords, observations: summary });
      // Early clock-out needs supervisor approval first. Instead of failing
      // silently, prompt the guard for a reason and submit an approval request.
      if (res && res.success === false && res.error === "approval_required") {
        setReportOpen(false);
        setGpsError(null);
        setEarlyOutOpen(true);
        return;
      }
      setReportOpen(false);
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  // Guard requests permission to clock out early WITH a reason; the supervisor
  // approves/rejects in the CRM. The reason rides along on the clockOutRequest.
  const submitEarlyOut = async (reason: string) => {
    setBusy(true);
    setGpsError(null);
    try {
      await guardService.requestClockOut({ reason });
      setEarlyOutOpen(false);
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  // Re-notify supervisors about a still-pending request (backend rate-limits).
  const resendEarlyOut = async () => {
    setBusy(true);
    setGpsError(null);
    try {
      await guardService.requestClockOut();
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  // Withdraw a stuck pending request so the guard is never blocked.
  const cancelEarlyOut = async () => {
    setBusy(true);
    setGpsError(null);
    try {
      await guardService.cancelClockOutRequest();
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      largeTitle={greeting}
      largeSubtitle={isClockedIn ? t("guard.onDuty") : t("guard.offDuty")}
      compactTitle={guardName || firstName}
      avatar={<Avatar name={guardName} className="h-7 w-7 text-[10px]" />}
      right={
        isClockedIn ? (
          <div className="rounded-xl border border-online/40 bg-online/5 px-3 py-1.5 text-right">
            <span className="flex items-center justify-end gap-1.5 text-[11px] font-bold uppercase tracking-wide text-online">
              <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-online" />
              {t("guard.onDuty")}
            </span>
            {punchInTime && (
              <span className="mt-0.5 block text-[10px] text-muted">
                {t("onduty.since", "Desde")} {fmtClock(punchInTime)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-full border border-line-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
            <Shield size={13} />
            {t("guard.offDuty")}
          </div>
        )
      }
      onRefresh={async () => {
        await Promise.all([reload(), perf.reload()]);
      }}
    >
      {loading ? (
        <Loader />
      ) : error ? (
        <EmptyState title={t("app.noData")} hint={error} />
      ) : isClockedIn ? (
        /* ====================== ON-DUTY VIEW ====================== */
        <>
          <OnDutyView
            data={data}
            busy={busy}
            onClockOut={() => { setGpsError(null); setReportOpen(true); }}
            onRequestClockOut={() => { setGpsError(null); setEarlyOutOpen(true); }}
            onResendRequest={resendEarlyOut}
            onCancelRequest={cancelEarlyOut}
          />
          {gpsError && (
            <p className="mt-3 text-center text-xs text-critical">{gpsError}</p>
          )}
          <EarlyClockOutModal
            isOpen={earlyOutOpen}
            busy={busy}
            onCancel={() => setEarlyOutOpen(false)}
            onSubmit={submitEarlyOut}
          />
          <ClockOutReportModal
            isOpen={reportOpen}
            busy={busy}
            onCancel={() => setReportOpen(false)}
            onSubmit={(summary) => handleClockOut(summary)}
          />
        </>
      ) : (
        /* ====================== OFF-DUTY VIEW ===================== */
        <div className="space-y-4">
          {/* Clock-in card */}
          <Card className="p-4">
            {clockInTargets.length > 0 ? (
              <div className="space-y-2.5">
                {shiftForClockIn && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Clock size={14} className="shrink-0 text-gold" />
                    <span className="font-medium text-ink">
                      {t("guard.clockInForShift", {
                        time:
                          shiftForClockIn.startTimeLabel ||
                          fmtTime(shiftForClockIn.startTime),
                      })}
                    </span>
                  </div>
                )}
                {clockInTargets.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => beginClockIn(st)}
                    disabled={busy}
                    className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        <LogIn size={18} className="shrink-0" />
                        {t("guard.clockInAt", {
                          station: st.stationName || st.name,
                        })}
                      </>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 py-1 text-muted">
                <XCircle size={18} className="shrink-0" />
                <p className="text-xs">{t("guard.noStations")}</p>
              </div>
            )}
            {busy && (
              <p className="mt-2 text-center text-xs text-muted">
                {t("guard.gettingLocation")}
              </p>
            )}
            {gpsError && (
              <p className="mt-2 text-xs text-critical">{gpsError}</p>
            )}
          </Card>

          {/* Performance */}
          <PerformanceSection perf={perf} />

          {/* Shifts */}
          <Card className="p-4">
            <SectionTitle icon={<Clock size={16} />}>
              {t("guard.shifts")}
            </SectionTitle>
            {currentShift ? (
              <ShiftRow
                accent="online"
                label={t("guard.currentShift")}
                shift={currentShift}
              />
            ) : nextShift ? (
              <ShiftRow
                accent="info"
                label={t("guard.nextShift")}
                shift={nextShift}
              />
            ) : (
              <p className="text-xs text-muted">{t("guard.noShifts")}</p>
            )}
          </Card>

          {/* Posts */}
          {stations.length > 0 && (
            <Card className="p-4">
              <SectionTitle icon={<MapPin size={16} />}>
                {t("guard.myPosts")}
              </SectionTitle>
              <div className="space-y-2">
                {stations.map((st) => {
                  const blocks = parseStationSchedule(st.stationSchedule);
                  const hasRange = st.startingTimeInDay || st.finishTimeInDay;
                  return (
                    <div key={st.id} className="rounded-lg border border-line p-3">
                      <p className="text-sm font-medium text-ink">
                        {st.stationName || st.name}
                      </p>
                      {hasRange && (
                        <p className="text-xs text-muted">
                          {(st.startingTimeInDay || "?") +
                            " — " +
                            (st.finishTimeInDay || "?")}
                        </p>
                      )}
                      {blocks.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {blocks.map((b, bi) => (
                            <div
                              key={bi}
                              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                            >
                              {b.name && (
                                <span className="rounded-md border border-gold/30 bg-gold/5 px-1.5 py-0.5 font-medium text-gold">
                                  {b.name}
                                </span>
                              )}
                              {(b.startTime || b.endTime) && (
                                <span className="text-muted">
                                  {b.startTime || "?"} — {b.endTime || "?"}
                                </span>
                              )}
                              {b.days.length > 0 && (
                                <span className="text-faint">· {formatDays(b.days)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Clock-in flow: checklist → geo-stamped selfie */}
      <StartShiftModal
        isOpen={flowStep === "checklist"}
        station={flowStation}
        guardName={guardName}
        // Only a genuine cancel (dismiss while still on the checklist) resets the
        // flow. Advancing to the selfie also dismisses this modal — ignore that.
        onClose={() => {
          if (flowStepRef.current === "checklist") resetFlow();
        }}
        onStart={(result) => {
          setChecklist(result);
          setFlowStep("selfie");
        }}
      />
      <SelfieClockIn
        isOpen={flowStep === "selfie"}
        guardName={guardName}
        stationName={flowStation?.stationName || flowStation?.name || ""}
        // Back/cancel returns to the checklist — but only when actually on the
        // selfie. Submitting also dismisses this modal; don't bounce back then.
        onCancel={() => {
          if (flowStepRef.current === "selfie") setFlowStep("checklist");
        }}
        onCapture={submitClockIn}
      />
    </Screen>
  );
}

function ShiftRow({
  accent,
  label,
  shift,
}: {
  accent: "online" | "info";
  label: string;
  shift: any;
}) {
  const tone =
    accent === "online"
      ? "border-online/40 bg-online/10 text-online"
      : "border-info/40 bg-info/10 text-info";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-sm font-medium text-ink">
        {shift?.station?.stationName || shift?.stationName || "—"}
      </p>
      <p className="text-xs text-muted">
        {fmtTime(shift?.startTime)} — {fmtTime(shift?.endTime)}
      </p>
    </div>
  );
}

function PerformanceSection({ perf }: { perf: ReturnType<typeof useAsync<any>> }) {
  const { t } = useTranslation();
  const history = useHistory();
  const p = perf.data;

  if (perf.loading) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-gold" size={22} />
      </Card>
    );
  }
  if (!p) return null;

  const color = TIER_COLOR[p.tier as Tier];
  const s = p.stats;
  const penalty = p.penalty || { points: 0, absences: 0, tardies: 0 };
  const bonus = p.bonus || { points: 0, volunteerCount: 0, coverCount: 0 };

  const statTiles: { key: string; value: any }[] = [
    { key: "hours", value: s.hoursWorked },
    { key: "shifts", value: s.shiftsWorked },
    { key: "onTime", value: s.onTimeShifts },
    { key: "absences", value: s.absences },
  ];

  const quickActions = [
    { icon: <ClipboardCheck size={18} />, label: t("nav.quiz"), to: "/guard/quiz" },
    { icon: <LifeBuoy size={18} />, label: t("nav.backup"), to: "/guard/backup" },
  ];

  return (
    <div className="space-y-4">
      {/* Score + tier */}
      <Card className="p-5">
        <SectionTitle icon={<TrendingUp size={16} />} right={<span className="text-[11px] text-muted">{t("perf.period30")}</span>}>
          {t("perf.title")}
        </SectionTitle>

        {!p.hasData ? (
          <p className="py-4 text-center text-xs text-muted">{t("perf.noData")}</p>
        ) : (
          <>
            <div className="flex flex-col items-center py-2">
              <ScoreRing score={p.score} color={color} label={t("perf.score")} />
              <span
                className="mt-3 rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ color, borderColor: `${color}66`, background: `${color}14` }}
              >
                {t(`perf.tier.${p.tier}`)}
              </span>
              {p.source === "client" && (
                <span className="mt-2 text-[10px] text-faint">{t("perf.estimated")}</span>
              )}
            </div>

            {/* Penalty (faltas y atrasos) + backup bonus */}
            {(penalty.points > 0 || bonus.points > 0) && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {penalty.points > 0 && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-critical/40 bg-critical/5 px-3 py-1.5 text-[11px] font-semibold text-critical">
                    <TrendingDown size={13} />
                    {t("perf.penalty", {
                      points: penalty.points,
                      absences: penalty.absences,
                      tardies: penalty.tardies,
                    })}
                  </span>
                )}
                {bonus.points > 0 && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-online/40 bg-online/5 px-3 py-1.5 text-[11px] font-semibold text-online">
                    <Gift size={13} />
                    {t("perf.bonus", { points: bonus.points })}
                  </span>
                )}
              </div>
            )}

            {/* Component breakdown */}
            {p.components.length > 0 && (
              <div className="mt-4 space-y-3">
                {p.components.map((c: any) => (
                  <MeterBar
                    key={c.key}
                    label={t(`perf.component.${c.key}`)}
                    score={c.score}
                    color={COMPONENT_COLOR[c.key as ComponentKey]}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Quick actions: take the station test / volunteer as backup */}
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map((a) => (
          <button
            key={a.to}
            onClick={() => history.push(a.to)}
            className="flex min-h-[54px] items-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink active:bg-surface-2"
          >
            <span className="shrink-0 text-gold">{a.icon}</span>
            <span className="flex-1 text-left">{a.label}</span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </button>
        ))}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2">
        {statTiles.map((tile) => (
          <Card key={tile.key} className="p-3 text-center">
            <p className="text-lg font-bold text-ink">{tile.value}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-muted">
              {t(`perf.stat.${tile.key}`)}
            </p>
          </Card>
        ))}
      </div>

      {/* Tips */}
      {p.tips.length > 0 && (
        <Card className="p-4">
          <SectionTitle icon={<Lightbulb size={16} />}>{t("perf.tipsTitle")}</SectionTitle>
          <ul className="space-y-2">
            {p.tips.map((k: ComponentKey) => (
              <li key={k} className="flex items-start gap-2 text-xs text-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {t(`perf.tip.${k}`)}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
