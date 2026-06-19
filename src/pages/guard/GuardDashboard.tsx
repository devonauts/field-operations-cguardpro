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
  Moon,
  Power,
  AlertTriangle,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import NotificationBell from "@/components/NotificationBell";
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
import { setDuty } from "@/lib/dutyState";
import fb from "@/lib/feedback";
import { onPush } from "@/lib/pushEvents";
import { loadGuardPerformance, Tier, ComponentKey } from "@/lib/performance";
import { pick, parseStationSchedule, formatDays } from "@/lib/normalize";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { getDeviceIdentity } from "@/lib/device";
import { logError } from "@/lib/errorLog";
import OnDutyView from "./OnDutyView";
import { StartShiftModal, ChecklistResult } from "@/components/StartShiftModal";
import { SelfieClockIn, SelfieResult } from "@/components/SelfieClockIn";

const TIER_COLOR: Record<Tier, string> = {
  excellent: "var(--online)",
  good: "var(--gold)",
  fair: "var(--high)",
  needs_improvement: "var(--critical)",
};
const COMPONENT_COLOR: Record<ComponentKey, string> = {
  punctuality: "var(--info)",
  uniform: "var(--online)",
  inventory: "var(--teal)",
  consignas: "var(--gold)",
  rondas: "var(--route)",
  quiz: "#6366f1",
  training: "var(--high)",
};

/** The C-Guard Pro shield-and-eye glyph (gold), drawn inline to avoid an asset. */
function BrandMark() {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden className="shrink-0">
      <path
        d="M15 2 L27 6 V16 C27 24 21 30 15 32 C9 30 3 24 3 16 V6 Z"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse cx="15" cy="16" rx="7" ry="4.5" fill="none" stroke="var(--gold)" strokeWidth="2" />
      <circle cx="15" cy="16" r="2.3" fill="var(--gold)" />
    </svg>
  );
}

/** Branded operations header shown while the guard is clocked in (per design). */
function OnDutyHeader({ guardName, sector }: { guardName: string; sector: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="px-4 pb-1 pt-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-[17px] font-extrabold tracking-tight text-ink">
              C-Guard <span className="text-gold">Pro</span>
            </p>
            <p className="label-eyebrow">{t("brand.tagline", "Security Operations")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="relative">
            <Avatar name={guardName} className="h-11 w-11 text-sm ring-2 ring-gold/40" />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-online" />
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-online" />
        <span className="text-online">{t("guard.onDuty", "En servicio")}</span>
        {sector && <span className="text-gold">· {sector}</span>}
      </div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
        {guardName || t("guard.guard", "Guardia")}
      </h1>
    </div>
  );
}

export default function GuardDashboard() {
  const { t } = useTranslation();
  const history = useHistory();
  const [presentToast] = useIonToast();
  const { data, loading, error, reload } = useAsync(() => guardService.dashboard());
  const perf = useAsync(() => loadGuardPerformance(30));
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
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

  // Publish duty state to the shell (tab bar hides operational UI when off duty).
  useEffect(() => {
    if (data) setDuty(isClockedIn);
  }, [data, isClockedIn]);

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
  //
  // The subscription is registered once on mount, but its handler closes over
  // `t`/`presentToast`/`reload`. Keep the live logic in a ref refreshed each
  // render so a mid-session language change (or a no-longer-stable reload)
  // surfaces the toast in the current language instead of the mount-time one.
  const pushHandlerRef = useRef<(d: any) => void>(() => {});
  pushHandlerRef.current = (d: any) => {
    const type = d?.type;
    // Shift ended → the backend force-closed the shift. Reload (flips off-duty)
    // and let the guard know.
    if (type === "guard.forced_clockout") {
      fb.warning();
      reload();
      presentToast({
        message: t("clock.forcedOut", "Tu turno terminó y se registró tu salida automáticamente."),
        duration: 6000,
        color: "warning",
        position: "top",
      });
      return;
    }
    // Shift reminder (2d / 1d / 12h / 1h / 10min before start) — surface it as a
    // toast when the app is already open (the OS shows the notification when it's
    // backgrounded). Tapping the toast jumps to the schedule.
    if (type === "shift.reminder") {
      fb.tap();
      presentToast({
        message: d?.body || t("shift.reminderToast", "Tienes un turno próximo. No olvides marcar tu entrada."),
        duration: 6000,
        color: "primary",
        position: "top",
        buttons: [{ text: t("nav.schedule", "Horario"), handler: () => history.push("/guard/schedule") }],
      });
      return;
    }
    if (type !== "attendance.clockout_approved" && type !== "attendance.clockout_rejected") {
      return;
    }
    const status = type === "attendance.clockout_approved" ? "approved" : "rejected";
    reload();
    showDecisionToast(status);
  };
  useEffect(() => {
    const off = onPush((d) => pushHandlerRef.current(d));
    return off;
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
  // Rest-day gate: the backend says which stations the guard may clock into
  // right now (active assignment OR a shift today). On a rest day this is empty
  // → no clock-in, so the guard never takes a selfie just to be rejected.
  // Older servers omit the field → fall back to the previous behaviour.
  const eligibleIds: string[] | null = Array.isArray(data?.clockInStationIds)
    ? data.clockInStationIds
    : null;
  const canClockIn: boolean = data?.canClockIn !== false;
  const allTargets: any[] =
    stations.length > 0 ? stations : shiftStation?.id ? [shiftStation] : [];
  const clockInTargets: any[] = !canClockIn
    ? []
    : eligibleIds
      ? allTargets.filter((s) => eligibleIds.includes(s.id))
      : allTargets;
  // The hero CLOCK-IN button binds to the station of the shift the guard is
  // about to work (so a multi-post guard taps once for the right post); any
  // other assigned posts fall to secondary buttons below it.
  const primaryTarget: any =
    (shiftStation?.id && clockInTargets.find((s) => s.id === shiftStation.id)) ||
    clockInTargets[0] ||
    null;
  const extraTargets: any[] = clockInTargets.filter((s) => s !== primaryTarget);
  const upcomingShift = currentShift || nextShift;

  // Late-arrival detection. Prefer the backend-computed `lateArrival` (it knows
  // the grace window and authoritative shift times); otherwise derive it
  // client-side: a started shift the guard hasn't clocked into yet, past a small
  // grace, is "late". Recomputed each minute via the now-tick so it stays live.
  const nowTick = useNowTick(30000);
  const FALLBACK_GRACE_MIN = 5;
  const lateInfo = (() => {
    const backend = data?.lateArrival;
    if (backend) return backend.isLate ? backend : null;
    // Fallback: never show when already clocked in.
    if (isClockedIn) return null;
    const start = currentShift?.startTime ? new Date(currentShift.startTime) : null;
    if (!start || Number.isNaN(start.getTime())) return null;
    const lateMinutes = Math.floor((nowTick - start.getTime()) / 60000);
    if (lateMinutes < FALLBACK_GRACE_MIN) return null;
    return {
      isLate: true,
      lateMinutes,
      graceMin: FALLBACK_GRACE_MIN,
      shiftId: currentShift?.id ?? null,
      startTimeLabel:
        currentShift?.startTimeLabel || fmtTime(currentShift?.startTime) || null,
      stationName:
        currentShift?.station?.stationName || currentShift?.stationName || null,
    };
  })();
  // Belt-and-suspenders: clocked-in guards are never late.
  const showLate = !!lateInfo && !isClockedIn;
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
      setGpsError(clockInErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  // Clock-out (incl. the early-out approval gate) now lives on the shift-detail
  // screen via <ClockOutFlow>, reached by tapping the CURRENT SHIFT card.

  const sector = stations[0]?.stationName || stations[0]?.name || null;

  return (
    <Screen
      root
      // On duty: the design's branded operations header. Off duty: the usual
      // collapsing large title.
      header={
        isClockedIn ? (
          <OnDutyHeader guardName={guardName || firstName} sector={sector} />
        ) : undefined
      }
      largeTitle={greeting}
      largeSubtitle={t("guard.offDuty")}
      compactTitle={guardName || firstName}
      avatar={<Avatar name={guardName} className="h-7 w-7 text-[10px]" />}
      right={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-line-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
            <Shield size={13} />
            {t("guard.offDuty")}
          </div>
          <NotificationBell />
        </div>
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
        <OnDutyView data={data} />
      ) : (
        /* ====================== OFF-DUTY VIEW ===================== */
        <div className="space-y-4">
          {/* Late-arrival warning — prominent, above everything else */}
          {showLate && lateInfo && (
            <LateWarning
              info={lateInfo}
              onClockIn={
                primaryTarget && !busy
                  ? () => beginClockIn(primaryTarget)
                  : undefined
              }
            />
          )}

          {/* Current status */}
          <CurrentStatusCard
            postsCount={stations.length}
            hours={perf.data?.stats?.hoursWorked}
          />

          {/* Last completed shift summary */}
          <LastShiftCard />

          {/* Next (or current) shift */}
          {upcomingShift && (
            <NextShiftCard shift={upcomingShift} isCurrent={!!currentShift} />
          )}

          {/* Clock-in hero */}
          <div className="space-y-2.5">
            {clockInTargets.length > 0 ? (
              <>
                {shiftForClockIn && (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted">
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
                <button
                  onClick={() => {
                    if (!primaryTarget) return;
                    fb.press();
                    beginClockIn(primaryTarget);
                  }}
                  disabled={busy || !primaryTarget}
                  className="btn-xl glow-gold w-full bg-gradient-to-b from-gold to-gold-strong text-on-accent active:from-gold-hover active:to-gold-hover disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      <Power size={20} className="shrink-0" strokeWidth={2.5} />
                      <span className="text-base font-bold uppercase tracking-wide">
                        {t("guard.clockInNow", "Marcar entrada")}
                      </span>
                    </>
                  )}
                </button>
                {extraTargets.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => {
                      fb.press();
                      beginClockIn(st);
                    }}
                    disabled={busy}
                    className="btn-xl w-full border border-gold/40 bg-gold/5 text-gold active:bg-gold/10 disabled:opacity-50"
                  >
                    <LogIn size={18} className="shrink-0" />
                    {t("guard.clockInAt", {
                      station: st.stationName || st.name,
                    })}
                  </button>
                ))}
                <p className="text-center text-[11px] text-muted">
                  {t(
                    "guard.clockInHint",
                    "Puedes marcar entrada hasta 15 minutos antes de tu turno.",
                  )}
                </p>
              </>
            ) : !canClockIn ? (
              /* Rest day — not scheduled today, clock-in disabled. */
              <Card className="border border-line p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                    <Moon size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {t("guard.restDayTitle", "Día de descanso")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {nextShift
                        ? t("guard.restDayNext", "No tienes turno hoy. Tu próximo turno aparece abajo.")
                        : t("guard.restDayNone", "No tienes un turno programado hoy. No es necesario marcar entrada.")}
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-4">
                <div className="flex items-center gap-2.5 py-1 text-muted">
                  <XCircle size={18} className="shrink-0" />
                  <p className="text-xs">{t("guard.noStations")}</p>
                </div>
              </Card>
            )}
            {busy && (
              <p className="text-center text-xs text-muted">
                {t("guard.gettingLocation")}
              </p>
            )}
            {gpsError && (
              <p className="text-center text-xs text-critical">{gpsError}</p>
            )}
          </div>

          {/* Performance */}
          <PerformanceSection perf={perf} />

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

/* Ticks once a minute so the "next shift" countdown stays live without a full
   dashboard reload. */
function useNowTick(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const MONTHS_ES = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

function countdownLabel(target: Date, now: number): string {
  const mins = Math.max(0, Math.round((target.getTime() - now) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `EN ${Math.floor(h / 24)}D ${h % 24}H`;
  if (h > 0) return `EN ${h}H ${String(m).padStart(2, "0")}M`;
  return `EN ${m}M`;
}

function dayLabel(target: Date, t: any): string {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(target) - startOfDay(new Date())) / 86400000);
  const weekday = target.toLocaleDateString(undefined, { weekday: "long" });
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  if (diffDays <= 0) return `${t("guard.today", "Hoy")} · ${cap}`;
  if (diffDays === 1) return `${t("guard.tomorrow", "Mañana")} · ${cap}`;
  return cap;
}

/** Turn a clock-in failure into a friendly, localized message — never a raw code. */
function clockInErrorMessage(e: any, t: any): string {
  const code: string | undefined = e?.data?.messageCode;
  const friendly: Record<string, string> = {
    "guard.notAssignedToStation": t(
      "guard.errNotScheduled",
      "No estás programado para este puesto hoy. Si es tu día de descanso, no necesitas marcar entrada.",
    ),
    "guard.locationRequired": t("guard.errLocation", "Activa el GPS para marcar entrada."),
    "guard.stationRequired": t("guard.errStation", "Selecciona un puesto válido."),
    "guard.profileNotFound": t(
      "guard.errProfile",
      "No encontramos tu perfil de guardia. Contacta a tu supervisor.",
    ),
  };
  const generic = t(
    "guard.errGeneric",
    "No se pudo marcar entrada. Verifica tu turno e inténtalo de nuevo.",
  );
  if (code && friendly[code]) return friendly[code];
  if (code) return t(code, { defaultValue: generic });
  return e?.data?.message || e?.message || generic;
}

function fmtDuration(mins?: number): string {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/* Summary of the guard's last completed shift — duration, checkpoints, incidents,
   distance — sourced from GET /guard/me/last-shift. Hidden until there is data. */
function LastShiftCard() {
  const { t } = useTranslation();
  const { data } = useAsync<any>(() => guardService.lastShift().catch(() => null), []);
  if (!data || !data.hasData) return null;

  const cells: { value: string; label: string; tone: "ink" | "online" | "gold" }[] = [
    { value: fmtDuration(data.durationMinutes), label: t("guard.duration", "Duración"), tone: "ink" },
    {
      value: String(data.checkpoints ?? 0),
      label: t("guard.checkpoints", "Puntos"),
      tone: (data.checkpoints ?? 0) > 0 ? "online" : "ink",
    },
    {
      value: String(data.incidents ?? 0).padStart(2, "0"),
      label: t("guard.incidents", "Incidentes"),
      tone: (data.incidents ?? 0) > 0 ? "gold" : "ink",
    },
    { value: `${data.distanceKm ?? 0} km`, label: t("guard.distance", "Distancia"), tone: "ink" },
  ];
  const toneClass = (tone: string) =>
    tone === "online" ? "text-online" : tone === "gold" ? "text-gold" : "text-ink";

  return (
    <div className="card-elev p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <ClipboardCheck size={15} className="text-gold" />
          {t("guard.lastShift", "Último turno")}
        </span>
        {data.punchOutLabel && (
          <span className="text-[11px] tabular-nums text-faint">{data.punchOutLabel}</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-surface-2 p-3">
            <p className={`text-lg font-bold tabular-nums ${toneClass(c.tone)}`}>{c.value}</p>
            <p className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide text-muted">
              {c.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* OFF-DUTY status hero — mirrors the on-duty card's language (label, status pill,
   stat row) but in a dormant gold/grey key. */
function CurrentStatusCard({
  postsCount,
  hours,
}: {
  postsCount: number;
  hours?: number | null;
}) {
  const { t } = useTranslation();
  const stats: { value: string; label: string; tone?: "online" }[] = [
    { value: String(postsCount), label: t("guard.assignedPosts", "Puestos") },
    {
      value: hours != null ? `${hours}h` : "—",
      label: t("guard.hours30", "Horas · 30d"),
    },
    {
      value: t("guard.secured", "Seguro"),
      label: t("guard.allZones", "Zonas"),
      tone: "online",
    },
  ];
  return (
    <div className="card-elev relative overflow-hidden p-4">
      <div className="grid-overlay absolute inset-0 opacity-40" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gold">
            <Moon size={15} />
            {t("guard.currentStatus", "Estado actual")}
          </span>
          <span className="rounded-full border border-line-2 bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-faint">
            {t("guard.inactive", "Inactivo")}
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold leading-none tracking-tight text-muted">
          {t("guard.offDuty", "Fuera de turno")}
        </p>
        <div className="mt-4 grid grid-cols-3 divide-x divide-line border-t border-line pt-3">
          {stats.map((s) => (
            <div key={s.label} className="px-2 text-center first:pl-0 last:pr-0">
              <p
                className={`text-lg font-bold tabular-nums ${
                  s.tone === "online" ? "text-online" : "text-ink"
                }`}
              >
                {s.value}
              </p>
              <p className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide text-muted">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Upcoming-shift card with a live countdown + gold date chip. Reused for an
   already-running shift the guard hasn't clocked into yet (isCurrent). */
function NextShiftCard({ shift, isCurrent }: { shift: any; isCurrent: boolean }) {
  const { t } = useTranslation();
  const now = useNowTick(30000);
  const start = shift?.startTime ? new Date(shift.startTime) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const station = shift?.station?.stationName || shift?.stationName || "—";
  const timeRange = `${shift?.startTimeLabel || fmtTime(shift?.startTime)} – ${
    shift?.endTimeLabel || fmtTime(shift?.endTime)
  }`;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-surface to-surface p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gold">
          <Clock size={15} />
          {isCurrent
            ? t("guard.currentShift", "Turno actual")
            : t("guard.nextShift", "Próximo turno")}
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-gold tabular-nums">
          {isCurrent ? t("guard.inProgress", "En curso") : countdownLabel(start, now)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/10 leading-none">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gold">
            {MONTHS_ES[start.getMonth()]}
          </span>
          <span className="mt-0.5 text-xl font-bold tabular-nums text-ink">
            {String(start.getDate()).padStart(2, "0")}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{dayLabel(start, t)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span className="tabular-nums">{timeRange}</span>
            <span className="text-faint">·</span>
            <span className="truncate">{station}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

type LateArrival = {
  isLate: boolean;
  lateMinutes: number;
  graceMin: number;
  shiftId: string | null;
  startTimeLabel: string | null;
  stationName: string | null;
};

/* High-visibility late-arrival banner. Shown at the top of the off-duty
   dashboard when the guard's shift has started and they still haven't clocked
   in. If a clock-in target is available, the button kicks off the same
   checklist→selfie flow as the hero CTA; otherwise it's informational. */
function LateWarning({
  info,
  onClockIn,
}: {
  info: LateArrival;
  onClockIn?: () => void;
}) {
  const { t } = useTranslation();
  const min = Math.max(0, Math.round(info.lateMinutes || 0));
  // Warn once when the banner first appears.
  useEffect(() => {
    fb.warning();
  }, []);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-critical/40 bg-critical/10 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-critical/40 bg-critical/15 text-critical">
          <AlertTriangle size={22} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold tracking-tight text-critical">
            {t("late.title", "Vas tarde a tu turno")}
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">
            {t("late.minutes", { min })}
            {info.stationName && (
              <span className="font-medium text-muted">
                {" "}
                {t("late.atStation", { station: info.stationName })}
              </span>
            )}
          </p>
          {info.startTimeLabel && (
            <p className="mt-0.5 text-xs text-muted">
              {t("late.since", { time: info.startTimeLabel })}
            </p>
          )}
          <p className="mt-1.5 text-xs leading-snug text-muted">
            {t(
              "late.body",
              "Aún no has marcado tu entrada. Marca tu entrada lo antes posible.",
            )}
          </p>
          {onClockIn && (
            <button
              onClick={() => {
                fb.press();
                onClockIn();
              }}
              className="mt-3.5 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-gold to-gold-strong px-5 py-3.5 text-sm font-bold uppercase tracking-wide text-on-accent active:from-gold-hover active:to-gold-hover"
            >
              <Power size={18} className="shrink-0" strokeWidth={2.5} />
              {t("late.clockInNow", "Marcar entrada")}
            </button>
          )}
        </div>
      </div>
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

  // Ronda + Examen now live in the on-duty view (OnDutyView). Off duty keeps
  // only backup/volunteer.
  const quickActions = [
    {
      icon: <LifeBuoy size={18} />,
      label: t("nav.backup"),
      sub: t("backup.cardSub", "Cubre turnos sin asignar y gana puntos extra"),
      to: "/guard/backup",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Score + tier — tappable: opens the full "Mi Desempeño" detail screen. */}
      <Card
        className="cursor-pointer p-5 active:bg-surface-2"
        onClick={() => {
          fb.tap();
          history.push("/guard/performance");
        }}
      >
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
                style={{
                  color,
                  borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                  background: `color-mix(in srgb, ${color} 8%, transparent)`,
                }}
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

            {/* Affordance: this card opens the full performance detail screen. */}
            <div className="mt-4 flex items-center justify-end gap-1 border-t border-line pt-3 text-xs font-semibold text-gold">
              <span>{t("perfDetail.seeDetail", "Ver detalle")}</span>
              <ChevronRight size={15} className="shrink-0" />
            </div>
          </>
        )}
      </Card>

      {/* Quick actions: take the station test / volunteer as backup */}
      <div className="grid grid-cols-1 gap-3">
        {quickActions.map((a) => (
          <button
            key={a.to}
            onClick={() => {
              fb.tap();
              history.push(a.to);
            }}
            className="flex min-h-[54px] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-left active:bg-surface-2"
          >
            <span className="shrink-0 text-gold">{a.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{a.label}</span>
              {a.sub && (
                <span className="mt-0.5 block text-xs leading-snug text-muted">{a.sub}</span>
              )}
            </span>
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
