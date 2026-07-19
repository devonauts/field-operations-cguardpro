import { useEffect, useMemo, useState } from "react";
import { useIonViewWillEnter } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { ChevronRight, ClipboardCheck, LogOut, RadioTower, Siren, Timer, UserCheck } from "lucide-react";
import { useAsync } from "@/lib/useAsync";
import { incidentService, guardService, taskService } from "@/lib/services";
import { rondasService } from "@/lib/rondas";
import { getCurrentPosition } from "@/lib/geo";
import { isNetworkError } from "@/lib/api";
import { enqueue } from "@/lib/offlineQueue";
import { Button, MetricTile } from "@/components/ui/kit";
import { Sheet, ResultSheet, SlideToConfirm } from "@/components/ui";
import fb from "@/lib/feedback";
import IncomingPassdownGate from "@/components/IncomingPassdownGate";

/* ----------------------------------------------------------------- helpers */

function useElapsed(since: any): { clock: string; hours: number; mins: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = new Date(since).getTime();
  if (!since || Number.isNaN(start)) return { clock: "00:00:00", hours: 0, mins: 0 };
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { clock: `${pad(h)}:${pad(m)}:${pad(s % 60)}`, hours: h, mins: m };
}

/** Live HH:MM:SS clock. Owns the 1s tick so only this node re-renders each
 *  second — the rest of the on-duty tree re-renders only on data changes. */
function ShiftClock({ since }: { since: any }) {
  const { clock } = useElapsed(since);
  return (
    <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-tight text-gold tabular-nums">
      {clock}
    </p>
  );
}

/** Live "elapsed" stat. Owns its own 1s tick (isolated leaf). */
function ElapsedStat({ since, label }: { since: any; label: string }) {
  const { hours, mins } = useElapsed(since);
  return <ShiftStat value={`${hours}h ${String(mins).padStart(2, "0")}m`} label={label} />;
}

function fmtClock(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "—";
  }
}

function timeAgo(d: any, t: any): string {
  const then = new Date(d).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return t("time.now", "ahora");
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

const isOpenIncident = (i: any) => {
  const s = String(i?.status || "").toLowerCase();
  return s !== "cerrado" && s !== "closed" && s !== "resuelto";
};
const isCritical = (i: any) => {
  const p = String(i?.priority || "").toLowerCase();
  return i?.isPanic || p === "critical" || p === "alto" || p === "high";
};

/* ------------------------------------------------------------------- card */

/** A whole-card tap target (avoids nested buttons; inner CTAs are visual). */
function NavCard({
  onClick,
  className = "",
  children,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const handle = () => {
    fb.tap();
    onClick();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handle()}
      className={`pressable cursor-pointer ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- view */

export default function OnDutyView({ data }: { data: any }) {
  const { t } = useTranslation();
  const history = useHistory();

  // ---- Panic / SOS (P0) ----
  const [sosOpen, setSosOpen] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosResult, setSosResult] = useState<null | "success" | "error" | "queued">(null);

  const stations: any[] = data?.stations || [];
  const station = stations[0] || {};
  const punchInTime = data?.activeClockIn?.punchInTime || data?.activeClockIn?.createdAt;
  const shiftStart = punchInTime ? new Date(punchInTime).getTime() : 0;

  const schedStart = data?.activeClockIn?.scheduledStart || data?.currentShift?.startTime;
  const schedEnd =
    data?.activeClockIn?.scheduledEnd || data?.scheduledEnd || data?.currentShift?.endTime;
  const minsToEnd =
    data?.minutesToScheduledEnd != null ? Math.max(0, Math.round(Number(data.minutesToScheduledEnd))) : null;
  const remainingLabel =
    minsToEnd != null ? `${Math.floor(minsToEnd / 60)}h ${minsToEnd % 60}m` : null;

  // Incidents (tenant feed) — scoped to this shift for the counters/alerts.
  const { data: incRes, loading: incLoading } = useAsync<{ rows: any[]; count: number }>(
    () => incidentService.list({ limit: 25 }).catch(() => ({ rows: [], count: 0 })),
    [],
  );
  const incidents = useMemo(() => incRes?.rows || [], [incRes]);
  const shiftIncidents = useMemo(
    () =>
      incidents.filter(
        (i) => new Date(i.incidentAt || i.createdAt || i.date).getTime() >= shiftStart,
      ),
    [incidents, shiftStart],
  );
  const incidentCount = shiftIncidents.length;
  const alerts = (shiftIncidents.length ? shiftIncidents : incidents).slice(0, 2);
  const alertBadge = (shiftIncidents.length ? shiftIncidents : incidents).filter(isOpenIncident).length;

  // Patrol progress.
  const { data: patrols, loading: patrolsLoading, reload: reloadPatrols } = useAsync<any[]>(
    () => rondasService.patrols().catch(() => []),
    [],
  );
  const { data: scans, loading: scansLoading, reload: reloadScans } = useAsync<any[]>(
    () => rondasService.scans({ limit: 100 }).catch(() => []),
    [],
  );
  // Rondas start/advance from OTHER screens (Rondas tab) while this home stays
  // mounted (Ionic caches tab pages) — without a refresh the RONDA ACTIVA card
  // said "Sin ruta" forever next to a genuinely running round. Re-pull when the
  // home becomes visible again, plus a slow poll while it stays open.
  useIonViewWillEnter(() => {
    reloadPatrols();
    reloadScans();
  });
  useEffect(() => {
    const id = setInterval(() => {
      reloadPatrols();
      reloadScans();
    }, 45_000);
    return () => clearInterval(id);
  }, [reloadPatrols, reloadScans]);
  // Client-requested tasks for my station(s).
  const { data: shiftTasks } = useAsync<any[]>(
    () => taskService.list().catch(() => []),
    [],
  );
  const taskCount = (shiftTasks || []).length;
  const activePatrol = (patrols || [])[0] || null;
  const tagsList: any[] = Array.isArray(activePatrol?.tags) ? activePatrol.tags : [];
  const totalCheckpoints =
    activePatrol?.checkpointCount ??
    activePatrol?.tagsCount ??
    (tagsList.length || null);
  const shiftScans = useMemo(
    () => (scans || []).filter((s) => new Date(s.scannedAt).getTime() >= shiftStart),
    [scans, shiftStart],
  );
  const scannedCount = Math.min(shiftScans.length, totalCheckpoints ?? shiftScans.length);
  const scannedIds = useMemo(
    () =>
      new Set(
        shiftScans.map((s) => s.tagIdentifier || s.tag?.tagIdentifier).filter(Boolean),
      ),
    [shiftScans],
  );
  const nextTag = tagsList.find((tg) => !scannedIds.has(tg.tagIdentifier)) || null;
  const routeName =
    activePatrol?.siteTour?.name || activePatrol?.name || activePatrol?.routeName || null;
  const routeCode = activePatrol?.code || activePatrol?.routeCode || null;

  // Team on duty at my sitio de servicio (post site) — guards across all the
  // sitio's stations, nobody from other sitios.
  const { data: team, loading: teamLoading } = useAsync<any>(
    () => guardService.team().catch(() => null),
    [],
  );
  // Zones the guard covers, with a real status from open incidents at each.
  const zones = useMemo(
    () =>
      stations.map((st) => {
        const open = incidents.some(
          (i) => isOpenIncident(i) && (i.stationId === st.id || i.station?.id === st.id),
        );
        const crit = incidents.some(
          (i) =>
            isOpenIncident(i) && isCritical(i) && (i.stationId === st.id || i.station?.id === st.id),
        );
        return {
          id: st.id,
          name: st.stationName || st.name,
          status: crit ? "alert" : open ? "patrol" : "clear",
        };
      }),
    [stations, incidents],
  );
  const activeCount = team?.count ?? zones.length ?? 1;
  // Consolidated first-load state: the four feeds populate the cards. Surface a
  // single skeleton on the initial load so cards don't pop in one-by-one.
  const initialLoading = incLoading && patrolsLoading && scansLoading && teamLoading;
  const sector = station.stationName || station.name || "—";

  // Fire a panic/SOS incident: grab a quick GPS fix (same helper the rest of the
  // app uses — getCurrentPosition is hard-bounded so this never hangs), then post
  // a critical guard-scoped incident. Built to complete in under ~3s.
  const sendPanic = async () => {
    if (sosBusy) return;
    setSosBusy(true);
    setSosResult(null);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const pos = await getCurrentPosition();
        latitude = pos.latitude;
        longitude = pos.longitude;
      } catch {
        /* GPS optional — send the alert regardless of a fix */
      }
      const panicData = {
        incidentType: "panic",
        type: "panic",
        isPanic: true,
        severity: "critical",
        priority: "critical",
        status: "abierto",
        title: t("sos.title", "SOS / Pánico"),
        subject: t("sos.title", "SOS / Pánico"),
        description: t("sos.desc", "Alerta de pánico enviada por el vigilante."),
        content: t("sos.desc", "Alerta de pánico enviada por el vigilante."),
        location: sector,
        stationId: station?.id,
        postSiteId: station?.postSiteId,
        latitude,
        longitude,
        incidentAt: new Date().toISOString(),
      };

      // Panic is life-safety — give it the resilience the rest of the app has.
      // Retry a couple of times for a transient blip; if the network is down,
      // QUEUE it (same "incident.create" replayer that backs incident reports)
      // so it fires automatically on reconnect instead of silently failing.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await incidentService.createAsGuard(panicData);
          setSosResult("success");
          setSosOpen(false);
          setSosBusy(false);
          return;
        } catch (e) {
          lastErr = e;
          if (!isNetworkError(e)) break; // server rejection → don't hammer/queue
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      if (isNetworkError(lastErr)) {
        enqueue("incident.create", { data: panicData, asGuard: true }, t("sos.title", "SOS / Pánico"));
        setSosResult("queued");
        setSosOpen(false);
      } else {
        setSosResult("error");
      }
    } catch {
      setSosResult("error");
    } finally {
      setSosBusy(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-line bg-surface-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pase de turno left by the previous shift (auto-received on the backend). */}
      <IncomingPassdownGate />
      {/* ============================ CURRENT SHIFT ============================ */}
      <NavCard
        onClick={() => history.push("/guard/shift")}
        className="glow-gold relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-surface to-surface"
      >
        <span className="absolute inset-y-0 left-0 w-1 bg-gold" />
        <div className="grid-overlay absolute inset-0 opacity-40" />
        <div className="relative p-4 pl-5">
          <div className="flex items-start justify-between">
            <span className="label-eyebrow">{t("onduty.currentShift", "Turno actual")}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-online/40 bg-online/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-online">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-online" />
              {t("guard.onDuty", "En servicio")}
            </span>
          </div>

          {/* Live 1s tick is isolated in this leaf so the rest of the on-duty
              tree only re-renders on data changes, not every second. */}
          <ShiftClock since={punchInTime} />

          <p className="mt-2 text-sm text-muted">
            {schedStart && schedEnd ? (
              <>
                {t("onduty.shiftWord", "Turno")} {fmtClock(schedStart)} – {fmtClock(schedEnd)}
              </>
            ) : (
              <>
                {t("onduty.started", "Inició")} {fmtClock(punchInTime)}
              </>
            )}
          </p>

          {/* Glanceable remaining time (P1): time-remaining + ends-at promoted to a
              prominent stat co-equal with elapsed, instead of a tiny sub-line. */}
          {remainingLabel && (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-gold/15 bg-gold/5 p-3">
              <MetricTile
                tone="gold"
                icon={<Timer size={20} />}
                value={remainingLabel}
                label={t("onduty.remainingLabel", "Restante")}
              />
              <MetricTile
                tone="neutral"
                icon={<ClipboardCheck size={20} />}
                value={schedEnd ? fmtClock(schedEnd) : "—"}
                label={t("onduty.endsAt", "Finaliza")}
              />
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 divide-x divide-gold/15 border-t border-gold/15 pt-3">
            <ElapsedStat since={punchInTime} label={t("onduty.elapsed", "Transcurrido")} />
            <ShiftStat value={String(incidentCount).padStart(2, "0")} label={t("onduty.incidents", "Incidentes")} tone={incidentCount > 0 ? "gold" : "ink"} />
            <ShiftStat
              value={totalCheckpoints != null ? `${scannedCount}/${totalCheckpoints}` : "—"}
              label={t("onduty.checkpointsWord", "Puntos")}
            />
          </div>
        </div>
      </NavCard>

      {/* ============================ ACTIVE PATROL =========================== */}
      <NavCard
        onClick={() => history.push("/guard/patrol/active")}
        className="card-elev overflow-hidden p-4"
      >
        <div className="flex items-center justify-between">
          <span className="label-eyebrow">{t("onduty.activePatrol", "Ronda activa")}</span>
          <span className="text-xs font-bold uppercase tracking-wide text-gold">
            {routeCode || routeName || t("onduty.noRoute", "Sin ruta")}
          </span>
        </div>

        <div className="mt-3 rounded-xl border border-gold/25 bg-gold/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="label-eyebrow">{t("onduty.nextCheckpoint", "Próximo punto")}</p>
              <p className="mt-1 truncate text-[15px] font-bold text-ink">
                {nextTag?.name || (totalCheckpoints && scannedCount >= totalCheckpoints
                  ? t("onduty.allCleared", "Ronda completa")
                  : t("onduty.startRound", "Inicia tu ronda"))}
              </p>
              {(nextTag?.zone || nextTag?.location) && (
                <p className="mt-0.5 truncate text-xs text-muted">{nextTag.zone || nextTag.location}</p>
              )}
            </div>
            <ShieldRoute />
          </div>
        </div>

        {/* Progress dots */}
        {totalCheckpoints != null && totalCheckpoints > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {Array.from({ length: Math.min(totalCheckpoints, 16) }).map((_, i) => {
              const done = i < scannedCount;
              return (
                <span
                  key={i}
                  className={
                    done
                      ? "h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_6px_rgba(212,160,23,0.7)]"
                      : "h-2.5 w-2.5 rounded-full border border-line-2"
                  }
                />
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted">
            {totalCheckpoints != null
              ? t("onduty.checkpointsCleared", "{{a}} de {{b}} puntos completados", {
                  a: scannedCount,
                  b: totalCheckpoints,
                })
              : t("onduty.openPatrol", "Abrir ronda")}
          </p>
          <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gold">
            {t("onduty.continue", "Continuar")} <ChevronRight size={15} />
          </span>
        </div>
      </NavCard>

      {/* ============================= TAREAS ============================ */}
      <NavCard
        onClick={() => history.push("/guard/tasks")}
        className="card-elev overflow-hidden p-4"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ClipboardCheck size={16} className="text-gold" />
            <span className="label-eyebrow">{t("onduty.tasks", "Tareas del turno")}</span>
            {taskCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-black">
                {taskCount}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gold">
            {t("onduty.viewAll", "Ver todo")} <ChevronRight size={15} />
          </span>
        </div>
      </NavCard>

      {/* ============================= LIVE ALERTS ============================ */}
      <NavCard
        onClick={() => history.push("/guard/incidents")}
        className="card-elev overflow-hidden p-4"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="label-eyebrow">{t("onduty.liveAlerts", "Novedades")}</span>
            {alertBadge > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-critical px-1.5 text-[11px] font-bold text-white">
                {alertBadge}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gold">
            {t("onduty.viewAll", "Ver todo")} <ChevronRight size={15} />
          </span>
        </div>

        {alerts.length > 0 ? (
          <div className="mt-3 divide-y divide-line">
            {alerts.map((a) => {
              const crit = isCritical(a);
              return (
                <div key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`mt-0.5 h-9 w-1 shrink-0 rounded-full ${crit ? "bg-critical" : "bg-gold"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {a.title || a.subject || t("onduty.event", "Evento")}
                    </p>
                    {(a.location || a.station?.stationName) && (
                      <p className="truncate text-xs text-muted">{a.location || a.station?.stationName}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${crit ? "text-critical" : "text-muted"}`}>
                    {timeAgo(a.incidentAt || a.createdAt || a.date, t)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">{t("onduty.noAlerts", "Sin alertas activas.")}</p>
        )}
      </NavCard>

      {/* ============================ TEAM ON DUTY =========================== */}
      <NavCard
        onClick={() => history.push("/guard/map")}
        className="card-elev overflow-hidden p-4"
      >
        <div className="flex items-center justify-between">
          <span className="label-eyebrow">{t("onduty.teamOnDuty", "Equipo en servicio")}</span>
          <span className="text-xs font-bold uppercase tracking-wide text-online">
            {t("onduty.activeCount", "{{n}} activos", { n: activeCount })}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <Radar zones={zones} />
          <div className="min-w-0 flex-1 space-y-2">
            {(zones.length ? zones : [{ id: "sector", name: sector, status: "clear" }]).slice(0, 4).map((z, i) => {
              const color =
                z.status === "alert" ? "bg-critical" : z.status === "patrol" ? "bg-gold" : "bg-online";
              const label =
                z.status === "alert"
                  ? t("onduty.zoneAlert", "alerta")
                  : z.status === "patrol"
                    ? t("onduty.zonePatrol", "ronda")
                    : t("onduty.zoneClear", "despejado");
              return (
                <div key={z.id ?? z.name ?? i} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
                  <span className="truncate text-ink">{z.name}</span>
                  <span className="text-muted">— {label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </NavCard>

      {/* Radio — visible entry to the live channel. The floating PTT button is
          unlabeled, so without this row the radio screen is only reachable via
          push deep-links (App Review couldn't find it — Guideline 2.5.4). */}
      <button
        onClick={() => {
          fb.tap();
          history.push("/guard/radio");
        }}
        className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-line bg-surface px-5 text-[15px] font-semibold text-ink active:bg-surface-2"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
          <RadioTower size={22} />
        </span>
        <span className="flex-1 text-left">{t("nav.radio", "Radio")}</span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </button>

      {/* Visitantes — kept reachable from the on-duty home now that it's no longer
          a bottom tab (see GuardTabs nav-stability note). */}
      <button
        onClick={() => {
          fb.tap();
          history.push("/guard/visitors");
        }}
        className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-line bg-surface px-5 text-[15px] font-semibold text-ink active:bg-surface-2"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
          <UserCheck size={22} />
        </span>
        <span className="flex-1 text-left">{t("nav.visitors", "Visitantes")}</span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </button>

      {/* ===================== MARCAR SALIDA (P1) ===================== */}
      {/* A clearly-LABELED clock-out affordance so the guard doesn't have to tap
          the (unlabeled) status card to find it. Smallest change: route to the
          shift-detail screen which already hosts the full clock-out flow. */}
      <Button
        variant="danger"
        full
        onClick={() => {
          fb.press();
          history.push("/guard/shift");
        }}
      >
        <LogOut size={18} />
        {t("onduty.clockOut", "Marcar salida")}
      </Button>

      {/* ============================ SOS / PÁNICO (P0) ============================ */}
      {/* Always-available emergency control. Requires a deliberate slide (no
          accidental single-tap). Opens a focused sheet with SlideToConfirm. */}
      <div className="rounded-2xl border border-critical/40 bg-critical/10 p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-critical/40 bg-critical/15 text-critical">
            <Siren size={18} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold tracking-tight text-critical">
              {t("sos.heading", "Emergencia")}
            </p>
            <p className="text-xs text-muted">
              {t("sos.sub", "Envía una alerta de pánico a tu central")}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            fb.press();
            setSosOpen(true);
          }}
          className="btn-xl mt-3 w-full bg-critical text-white active:opacity-80"
        >
          <Siren size={18} strokeWidth={2.5} />
          {t("sos.button", "SOS / Pánico")}
        </button>
      </div>

      {/* SOS confirmation sheet — slide to fire. */}
      <Sheet open={sosOpen} onClose={() => !sosBusy && setSosOpen(false)} title={t("sos.title", "SOS / Pánico")}>
        <p className="mb-4 text-sm text-muted">
          {t(
            "sos.confirmHint",
            "Esto enviará una alerta crítica con tu ubicación a la central. Úsalo solo en una emergencia real.",
          )}
        </p>
        {sosBusy ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm font-semibold text-critical">
            <Siren size={18} className="animate-pulse" />
            {t("sos.sending", "Enviando alerta…")}
          </div>
        ) : (
          <SlideToConfirm
            tone="critical"
            label={t("sos.slide", "Deslizar para SOS")}
            onConfirm={sendPanic}
          />
        )}
      </Sheet>

      {/* SOS result — success, queued (offline, will retry), or error. */}
      <ResultSheet
        open={!!sosResult}
        onClose={() => setSosResult(null)}
        variant={sosResult === "error" ? "error" : sosResult === "queued" ? "warning" : "success"}
        title={
          sosResult === "error"
            ? t("sos.failedTitle", "No se pudo enviar")
            : sosResult === "queued"
              ? t("sos.queuedTitle", "Se enviará al reconectar")
              : t("sos.sentTitle", "Alerta enviada")
        }
        lines={
          sosResult === "error"
            ? [t("sos.failedHint", "Revisa tu conexión e inténtalo de nuevo.")]
            : sosResult === "queued"
              ? [t("sos.queuedHint", "Sin conexión ahora. Tu alerta quedó guardada y se enviará automáticamente en cuanto vuelva la señal.")]
              : [t("sos.sentHint", "Tu central fue notificada con tu ubicación.")]
        }
        primaryLabel={
          sosResult === "error" ? t("app.retry", "Reintentar") : t("app.ok", "OK")
        }
        onPrimary={() => {
          if (sosResult === "error") {
            setSosResult(null);
            setSosOpen(true);
          } else {
            setSosResult(null);
          }
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- fragments */

function ShiftStat({ value, label, tone = "ink" }: { value: string; label: string; tone?: "ink" | "gold" }) {
  return (
    <div className="px-2 text-center first:pl-0 last:pr-0">
      <p className={`text-lg font-bold tabular-nums ${tone === "gold" ? "text-gold" : "text-ink"}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide text-muted">{label}</p>
    </div>
  );
}

/** Small decorative route glyph for the active-patrol card. */
function ShieldRoute() {
  return (
    <svg width="64" height="40" viewBox="0 0 64 40" className="shrink-0" aria-hidden>
      <path
        d="M6 30 L22 32 L40 14 L58 6"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2"
        strokeDasharray="3 4"
        strokeLinecap="round"
        opacity="0.8"
      />
      {[[22, 32], [40, 14]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="3.5" fill="var(--background)" stroke="var(--gold)" strokeWidth="2" />
      ))}
      <circle cx="6" cy="30" r="5" fill="var(--gold)" />
      <circle cx="58" cy="6" r="4" fill="none" stroke="var(--gold)" strokeWidth="2" />
    </svg>
  );
}

/** Tactical radar with the guard at center + dots per covered zone. */
function Radar({ zones }: { zones: { id?: string; name: string; status: string }[] }) {
  const pts = [
    [38, 30],
    [78, 38],
    [30, 74],
    [80, 80],
  ];
  return (
    <svg width="104" height="104" viewBox="0 0 110 110" className="shrink-0" aria-hidden>
      <rect x="1" y="1" width="108" height="108" rx="14" fill="var(--surface-2)" stroke="var(--line)" />
      {[40, 26, 12].map((r) => (
        <circle key={r} cx="55" cy="55" r={r} fill="none" stroke="var(--gold)" strokeOpacity="0.18" />
      ))}
      <line x1="55" y1="15" x2="55" y2="95" stroke="var(--gold)" strokeOpacity="0.12" />
      <line x1="15" y1="55" x2="95" y2="55" stroke="var(--gold)" strokeOpacity="0.12" />
      {zones.slice(0, 4).map((z, i) => {
        const [x, y] = pts[i] || pts[0];
        const fill = z.status === "alert" ? "var(--critical)" : z.status === "patrol" ? "var(--gold)" : "var(--online)";
        return <circle key={z.id ?? z.name ?? i} cx={x} cy={y} r="4" fill={fill} />;
      })}
      <circle cx="55" cy="55" r="5" fill="var(--gold)" />
      <circle cx="55" cy="55" r="9" fill="none" stroke="var(--gold)" strokeOpacity="0.5" />
    </svg>
  );
}
