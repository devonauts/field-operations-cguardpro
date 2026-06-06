import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { useIonAlert, useIonToast } from "@ionic/react";
import {
  ShieldCheck,
  Shield,
  MapPin,
  Clock,
  Loader2,
  Users,
  Siren,
  AlertTriangle,
  Footprints,
  ClipboardCheck,
  CheckCircle2,
  ChevronRight,
  FileText,
  X,
  Navigation,
  Wifi,
  Play,
  User,
  Bell,
  Smartphone,
} from "lucide-react";
import { useAsync } from "@/lib/useAsync";
import { incidentService, guardService } from "@/lib/services";
import { getCurrentPosition } from "@/lib/geo";
import { IncidentForm } from "@/components/IncidentForm";
import { VisitorModal } from "@/components/VisitorModal";
import { ConsignaComplete } from "@/components/ConsignaComplete";
import {
  SectionCard,
  SectionHeader,
  StatusChip,
  QuickActionTile,
  ActivityRow,
  Button,
  IconTile,
  Tone,
} from "@/components/ui/kit";
import {
  consignasService,
  ConsignaItem,
  memosService,
  MemoItem,
  rondasService,
} from "@/lib/rondas";

function useElapsed(since: any): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = new Date(since).getTime();
  if (!since || Number.isNaN(start)) return "00:00:00";
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function fmtClock(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/* Activity event → icon / tone / friendly label. */
const ACTIVITY_LABEL: Record<string, string> = {
  "guard.checkin": "Registro de entrada",
  "guard.checkout": "Registro de salida",
  "visitor.arrival": "Visitante ingresó",
  "visitor.departure": "Salida de visitante",
  "patrol.completed": "Ronda completada",
  "patrol.missed": "Ronda incompleta",
  "incident.created": "Incidente reportado",
  "incident.updated": "Incidente actualizado",
  "device.mismatch": "Dispositivo no reconocido",
};
function activityVisual(type: string): { tone: Tone; icon: any } {
  const t = (type || "").toLowerCase();
  if (t.startsWith("guard")) return { tone: "green", icon: <User size={16} /> };
  if (t.startsWith("visitor")) return { tone: "amber", icon: <User size={16} /> };
  if (t.startsWith("patrol")) return { tone: "blue", icon: <Shield size={16} /> };
  if (t.startsWith("incident")) return { tone: "red", icon: <AlertTriangle size={16} /> };
  if (t.startsWith("device")) return { tone: "purple", icon: <Smartphone size={16} /> };
  return { tone: "neutral", icon: <Bell size={16} /> };
}
const stripEmoji = (s: string) =>
  (s || "").replace(/^[^A-Za-zÁÉÍÓÚÑ0-9]+/, "").trim();
function nameFromTitle(title: string): string {
  const i = (title || "").indexOf(":");
  return i >= 0 ? title.slice(i + 1).trim() : "";
}

export default function OnDutyView({
  data,
  busy,
  onClockOut,
  onRequestClockOut,
  onResendRequest,
  onCancelRequest,
}: {
  data: any;
  busy: boolean;
  onClockOut: () => void;
  onRequestClockOut: () => void;
  onResendRequest?: () => void;
  onCancelRequest?: () => void;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [visitorOpen, setVisitorOpen] = useState(false);
  const [panicBusy, setPanicBusy] = useState(false);
  const [consigna, setConsigna] = useState<ConsignaItem | null>(null);

  const { data: consignas, reload: reloadConsignas } = useAsync<ConsignaItem[]>(
    () => consignasService.orders().catch(() => []),
    [],
  );
  const pendingConsignas = (consignas || []).filter((c) => !c.done).length;

  const { data: memos, reload: reloadMemos } = useAsync<MemoItem[]>(
    () => memosService.list().catch(() => []),
    [],
  );
  const [memo, setMemo] = useState<MemoItem | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);

  const { data: patrols } = useAsync<any[]>(() => rondasService.patrols().catch(() => []), []);
  const { data: activity } = useAsync<any[]>(() => guardService.activity().catch(() => []), []);

  const acceptMemo = async () => {
    if (!memo) return;
    setMemoBusy(true);
    try {
      await memosService.accept(memo.id);
      setMemo(null);
      reloadMemos();
      presentToast({ message: t("memos.confirmed", "Lectura confirmada"), duration: 1500, color: "success" });
    } catch {
      presentToast({ message: t("memos.confirmError", "No se pudo confirmar"), duration: 2000, color: "danger" });
    } finally {
      setMemoBusy(false);
    }
  };

  const station = data?.stations?.[0] || {};
  const punchInTime = data?.activeClockIn?.punchInTime || data?.activeClockIn?.createdAt;
  const elapsed = useElapsed(punchInTime);
  const stationName = station.stationName || station.name || "—";

  // Live verification chips.
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    getCurrentPosition()
      .then(() => setGpsOk(true))
      .catch(() => setGpsOk(false));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Next patrol (best-effort from the guard's assignments).
  const nextPatrol = (patrols || [])[0] || null;
  const checkpoints =
    nextPatrol?.checkpointCount ??
    nextPatrol?.tagsCount ??
    (Array.isArray(nextPatrol?.tags) ? nextPatrol.tags.length : null);
  const nextStart = nextPatrol?.scheduledAt || nextPatrol?.startAt || nextPatrol?.startTime || null;
  const minsToNext = nextStart
    ? Math.max(0, Math.round((new Date(nextStart).getTime() - Date.now()) / 60000))
    : null;

  const sendPanic = async () => {
    setPanicBusy(true);
    try {
      let loc = stationName;
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await getCurrentPosition();
        lat = pos.latitude;
        lng = pos.longitude;
        loc = `${stationName} (${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)})`;
      } catch {
        /* location optional */
      }
      await incidentService.createAsGuard({
        isPanic: true,
        subject: t("panic.subject"),
        title: t("panic.subject"),
        content: `${t("panic.subject")} — ${stationName}`,
        priority: "critical",
        status: "abierto",
        location: loc,
        latitude: lat,
        longitude: lng,
        stationId: station?.id,
        postSiteId: station?.postSiteId,
        incidentAt: new Date().toISOString(),
      });
      presentToast({ message: t("panic.sent"), duration: 3000, color: "danger", position: "top" });
    } catch {
      presentToast({ message: "Error", duration: 2500, color: "danger", position: "top" });
    } finally {
      setPanicBusy(false);
    }
  };

  const confirmPanic = () =>
    presentAlert({
      header: t("panic.title"),
      message: t("panic.message"),
      buttons: [
        { text: t("app.cancel"), role: "cancel" },
        { text: t("panic.confirm"), role: "destructive", handler: sendPanic },
      ],
    });

  const quickActions: { key: string; icon: any; tone: Tone; onClick: () => void }[] = [
    { key: "visitors", icon: <Users size={24} />, tone: "amber", onClick: () => setVisitorOpen(true) },
    { key: "patrol", icon: <Footprints size={24} />, tone: "blue", onClick: () => history.push("/guard/patrol") },
    { key: "incident", icon: <AlertTriangle size={24} />, tone: "red", onClick: () => setIncidentOpen(true) },
    {
      key: "panic",
      icon: panicBusy ? <Loader2 size={24} className="animate-spin" /> : <Siren size={24} />,
      tone: "red",
      onClick: confirmPanic,
    },
  ];

  return (
    <div className="space-y-5">
      {/* ---------- ACTIVE SHIFT ---------- */}
      <div className="scanline glow-online relative overflow-hidden rounded-2xl border border-online/40 bg-gradient-to-br from-online/10 via-navy to-navy p-4">
        <div className="grid-overlay absolute inset-0 opacity-60" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-online">
              <Clock size={15} />
              {t("onduty.activeShift", "Turno activo")}
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-online/40 bg-online/10 text-online">
              <ShieldCheck size={22} />
            </span>
          </div>

          <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-tight text-ink tabular-nums">
            {elapsed}
          </p>
          <p className="mt-2 text-sm text-muted">
            {t("onduty.started", "Inició")} {fmtClock(punchInTime)}
          </p>

          <div className="mt-4 flex divide-x divide-online/20 border-t border-online/20 pt-3">
            <StatusChip icon={<MapPin size={14} />} label={t("onduty.insideGeofence", "En geocerca")} ok />
            <StatusChip
              icon={<Navigation size={14} />}
              label={t("onduty.gpsVerified", "GPS verificado")}
              ok={gpsOk !== false}
            />
            <StatusChip
              icon={<Wifi size={14} />}
              label={t("onduty.deviceOnline", "Dispositivo en línea")}
              ok={online}
            />
          </div>
        </div>
      </div>

      {/* ---------- NEXT PATROL ---------- */}
      <div className="relative overflow-hidden rounded-2xl border border-info/40 bg-gradient-to-br from-info/10 via-navy to-navy p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-info">
              <Footprints size={15} />
              {t("onduty.nextPatrol", "Próxima ronda")}
            </span>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-ink tabular-nums">
                {minsToNext != null ? minsToNext : checkpoints != null ? checkpoints : "—"}
              </span>
              <span className="text-sm text-muted">
                {minsToNext != null ? "min" : t("onduty.checkpointsWord", "puntos")}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {checkpoints != null
                ? t("onduty.checkpoints", "{{n}} puntos de control", { n: checkpoints })
                : t("onduty.startRound", "Inicia tu ronda")}
            </p>
          </div>
          <PatrolRoute />
        </div>
        <Button variant="primary" full className="mt-4 bg-info! text-white!" onClick={() => history.push("/guard/patrol")}>
          <Play size={18} fill="currentColor" />
          {t("onduty.startPatrol", "Iniciar ronda")}
          <ChevronRight size={18} className="ml-auto" />
        </Button>
      </div>

      {/* ---------- QUICK ACTIONS ---------- */}
      <div>
        <SectionHeader title={t("onduty.quickActions", "Acciones rápidas")} />
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map((a) => (
            <QuickActionTile
              key={a.key}
              icon={a.icon}
              label={t(`features.${a.key}`)}
              tone={a.key === "visitors" ? "amber" : a.key === "patrol" ? "blue" : a.key === "incident" ? "amber" : "red"}
              onClick={a.onClick}
            />
          ))}
        </div>
      </div>

      {/* ---------- RECENT ACTIVITY ---------- */}
      {(activity || []).length > 0 && (
        <div>
          <SectionHeader
            title={t("onduty.recentActivity", "Actividad reciente")}
            action={
              <button onClick={() => history.push("/guard/patrol")} className="text-xs font-semibold text-info active:opacity-70">
                {t("onduty.viewAll", "Ver todo")}
              </button>
            }
          />
          <div className="card-elev divide-y divide-line overflow-hidden">
            {(activity || []).slice(0, 6).map((a) => {
              const v = activityVisual(a.eventType);
              const title = ACTIVITY_LABEL[a.eventType] || stripEmoji(a.title) || t("onduty.event", "Evento");
              const subtitle = nameFromTitle(a.title) || stripEmoji(a.subtitle || "");
              return (
                <ActivityRow
                  key={a.id}
                  tone={v.tone}
                  icon={v.icon}
                  title={title}
                  subtitle={subtitle || undefined}
                  time={fmtClock(a.at)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- CONSIGNAS ---------- */}
      {(consignas || []).length > 0 && (
        <div>
          <SectionHeader
            title={t("consignas.title", "Consignas de hoy")}
            action={
              pendingConsignas > 0 ? (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold">
                  {t("consignas.pending", "{{n}} pendientes", { n: pendingConsignas })}
                </span>
              ) : undefined
            }
          />
          <div className="card-elev divide-y divide-line overflow-hidden">
            {(consignas || []).map((c) => (
              <button
                key={c.id}
                onClick={() => !c.done && setConsigna(c)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${c.done ? "opacity-60" : "active:bg-white/3"}`}
              >
                <IconTile tone={c.done ? "green" : "amber"} size="sm">
                  {c.done ? <CheckCircle2 size={16} /> : <ClipboardCheck size={16} />}
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{c.title}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {c.time && (
                      <>
                        <Clock size={11} />
                        {c.time} ·{" "}
                      </>
                    )}
                    {c.done ? t("consignas.doneLabel", "Completada") : t("consignas.todo", "Por hacer")}
                  </span>
                </span>
                {!c.done && <ChevronRight size={18} className="shrink-0 text-faint" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- MEMOS ---------- */}
      {(memos || []).length > 0 && (
        <div>
          <SectionHeader title={t("memos.title", "Memos")} />
          <div className="card-elev divide-y divide-line overflow-hidden">
            {(memos || []).map((m) => (
              <button
                key={m.id}
                onClick={() => setMemo(m)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${m.wasAccepted ? "opacity-60" : "active:bg-white/3"}`}
              >
                <IconTile tone={m.wasAccepted ? "green" : "amber"} size="sm">
                  {m.wasAccepted ? <CheckCircle2 size={16} /> : <FileText size={16} />}
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {m.subject || t("memos.untitled", "Memo")}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {m.createdByName ? <>{m.createdByName} · </> : null}
                    {m.wasAccepted ? t("memos.read", "Leído") : t("memos.unread", "Sin leer")}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- CLOCK OUT ---------- */}
      <ClockOutControl
        data={data}
        busy={busy}
        onClockOut={onClockOut}
        onRequestClockOut={onRequestClockOut}
        onResendRequest={onResendRequest}
        onCancelRequest={onCancelRequest}
      />

      <IncidentForm
        isOpen={incidentOpen}
        onClose={() => setIncidentOpen(false)}
        onCreated={() => setIncidentOpen(false)}
        asGuard
        station={station}
      />
      <VisitorModal isOpen={visitorOpen} onClose={() => setVisitorOpen(false)} station={station} />
      <ConsignaComplete
        isOpen={!!consigna}
        consigna={consigna}
        onClose={() => setConsigna(null)}
        onDone={() => {
          setConsigna(null);
          reloadConsignas();
        }}
      />

      {/* ---------- MEMO READER ---------- */}
      {memo && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setMemo(null)}>
          <div
            className="w-full rounded-t-2xl bg-surface p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <IconTile tone="amber" size="sm">
                  <FileText size={16} />
                </IconTile>
                <h3 className="text-base font-bold text-ink">{memo.subject || t("memos.untitled", "Memo")}</h3>
              </div>
              <button onClick={() => setMemo(null)} className="text-muted active:opacity-70">
                <X size={20} />
              </button>
            </div>
            {memo.createdByName && (
              <p className="mb-2 text-xs text-muted">
                {t("memos.from", "De")}: {memo.createdByName}
              </p>
            )}
            {memo.content && (
              <p className="mb-5 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{memo.content}</p>
            )}
            {memo.wasAccepted ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-online-soft py-3 text-sm font-semibold text-online">
                <CheckCircle2 size={18} /> {t("memos.alreadyRead", "Lectura confirmada")}
              </div>
            ) : (
              <Button variant="primary" full disabled={memoBusy} onClick={acceptMemo}>
                {memoBusy ? <Loader2 size={18} className="animate-spin" /> : t("memos.confirmRead", "Confirmar lectura")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Decorative dashed patrol route with checkpoints + play marker (matches mock). */
function PatrolRoute() {
  return (
    <svg width="120" height="64" viewBox="0 0 120 64" className="shrink-0" aria-hidden>
      <path
        d="M10 46 L40 50 L70 22 L110 10"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeDasharray="4 5"
        strokeLinecap="round"
        opacity="0.7"
      />
      {[
        [40, 50],
        [70, 22],
      ].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r="5" fill="#0a0e16" stroke="#38bdf8" strokeWidth="2" />
      ))}
      <circle cx="10" cy="46" r="9" fill="#38bdf8" />
      <path d="M7 42 L7 50 L14 46 Z" fill="#0a0e16" />
      <path d="M110 10 l0 -8 m0 8 l6 0" stroke="#38bdf8" strokeWidth="2" />
      <rect x="110" y="2" width="9" height="6" fill="#38bdf8" />
    </svg>
  );
}

/**
 * Clock-out control with the early-out approval gate (unchanged behaviour).
 */
function ClockOutControl({
  data,
  busy,
  onClockOut,
  onRequestClockOut,
  onResendRequest,
  onCancelRequest,
}: {
  data: any;
  busy: boolean;
  onClockOut: () => void;
  onRequestClockOut: () => void;
  onResendRequest?: () => void;
  onCancelRequest?: () => void;
}) {
  const { t } = useTranslation();
  // Early-vs-normal is decided by the backend from the TURNO (single source of
  // truth) — the worker only renders it. `isEarlyClockOut` is true while the
  // guard is still on the clock before the turno's scheduled end (minus grace).
  const status: string | undefined = data?.clockOutRequest?.status;
  const isEarly = !!data?.isEarlyClockOut;
  const endLabel: string | null = data?.scheduledEndLabel || null;
  const minsToEnd: number | null =
    data?.minutesToScheduledEnd != null ? Number(data.minutesToScheduledEnd) : null;
  const canClockOut = !isEarly || status === "approved";
  const pending = isEarly && status === "pending";

  if (canClockOut) {
    const approved = status === "approved";
    return (
      <Button variant={approved ? "primary" : "danger"} full disabled={busy} onClick={onClockOut}>
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          t(approved ? "onduty.clockOutApproved" : "onduty.clockOut")
        )}
      </Button>
    );
  }

  if (pending) {
    return (
      <div className="space-y-2">
        <div className="btn-xl w-full cursor-default border border-gold/40 bg-gold/5 text-gold">
          <Loader2 size={16} className="animate-spin" />
          {t("onduty.clockOutPending")}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" full disabled={busy} onClick={() => onResendRequest?.()}>
            {t("onduty.resendRequest", "Reenviar")}
          </Button>
          <Button variant="danger" full disabled={busy} onClick={() => onCancelRequest?.()}>
            {t("onduty.cancelRequest", "Cancelar")}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted">
          {t("onduty.pendingHint", "Esperando aprobación del supervisor. Puedes reenviar o cancelar la solicitud.")}
        </p>
      </div>
    );
  }

  const remaining =
    minsToEnd != null && minsToEnd > 0
      ? `${Math.floor(minsToEnd / 60)}h ${minsToEnd % 60}m`
      : null;
  return (
    <div className="space-y-2">
      {status === "rejected" && (
        <p className="text-center text-xs text-critical">{t("onduty.clockOutRejected")}</p>
      )}
      {endLabel && (
        <p className="text-center text-xs text-muted">
          {t("onduty.turnoEndsAt", "Tu turno termina a las {{time}}", { time: endLabel })}
          {remaining ? ` · ${t("onduty.remaining", "faltan {{r}}", { r: remaining })}` : ""}
        </p>
      )}
      <button
        onClick={onRequestClockOut}
        disabled={busy}
        className="btn-xl w-full bg-high text-white active:opacity-80 disabled:opacity-50"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : t("onduty.requestEarlyOut")}
      </button>
      <p className="text-center text-[11px] text-muted">{t("onduty.earlyOutHint")}</p>
    </div>
  );
}
