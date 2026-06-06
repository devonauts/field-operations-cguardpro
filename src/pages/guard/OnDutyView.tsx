import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { useIonAlert, useIonToast } from "@ionic/react";
import {
  ShieldCheck,
  MapPin,
  Clock,
  Loader2,
  Users,
  Siren,
  AlertTriangle,
  Footprints,
  Building2,
  ClipboardCheck,
  CheckCircle2,
  ChevronRight,
  FileText,
  X,
} from "lucide-react";
import { initialsOf } from "@/lib/normalize";
import { useAsync } from "@/lib/useAsync";
import { postSiteService } from "@/lib/services";
import { incidentService } from "@/lib/services";
import { postSiteLogoUrl, staticMapUrl } from "@/lib/station";
import { fmtDateTime } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";
import { IncidentForm } from "@/components/IncidentForm";
import { VisitorModal } from "@/components/VisitorModal";
import { ConsignaComplete } from "@/components/ConsignaComplete";
import { consignasService, ConsignaItem, memosService, MemoItem } from "@/lib/rondas";

function StationLogo({ logo, name }: { logo: string | null; name?: string }) {
  const [errored, setErrored] = useState(false);
  if (logo && !errored) {
    return (
      <img
        src={logo}
        alt=""
        className="h-12 w-12 rounded-xl border border-line bg-surface object-cover"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold/30 bg-gold-soft text-sm font-bold tracking-tight text-gold">
      {initialsOf(name)}
    </div>
  );
}

function useElapsed(since: any): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = new Date(since).getTime();
  if (!since || Number.isNaN(start)) return "—";
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export default function OnDutyView({
  data,
  busy,
  onClockOut,
  onRequestClockOut,
}: {
  data: any;
  busy: boolean;
  onClockOut: () => void;
  onRequestClockOut: () => void;
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
    []
  );
  const pendingConsignas = (consignas || []).filter((c) => !c.done).length;

  const { data: memos, reload: reloadMemos } = useAsync<MemoItem[]>(
    () => memosService.list().catch(() => []),
    []
  );
  const [memo, setMemo] = useState<MemoItem | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);
  const pendingMemos = (memos || []).filter((m) => !m.wasAccepted).length;

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
  const punchInTime =
    data?.activeClockIn?.punchInTime || data?.activeClockIn?.createdAt;
  const elapsed = useElapsed(punchInTime);

  const { data: postSite } = useAsync(
    () =>
      station.postSiteId
        ? postSiteService.find(station.postSiteId).catch(() => null)
        : Promise.resolve(null),
    [station.postSiteId]
  );

  const logo = postSiteLogoUrl(postSite);
  const mapUrl = staticMapUrl(
    postSite?.latitud ?? station.latitud,
    postSite?.longitud ?? station.longitud
  );
  const stationName = station.stationName || station.name || postSite?.companyName || "—";
  const address = postSite?.address || postSite?.city || "";

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
      presentToast({
        message: t("panic.sent"),
        duration: 3000,
        color: "danger",
        position: "top",
      });
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

  const features = [
    {
      key: "visitors",
      icon: <Users size={22} />,
      tone: "gold",
      onClick: () => setVisitorOpen(true),
    },
    {
      key: "patrol",
      icon: <Footprints size={22} />,
      tone: "info",
      onClick: () => history.push("/guard/patrol"),
    },
    {
      key: "incident",
      icon: <AlertTriangle size={22} />,
      tone: "warning",
      onClick: () => setIncidentOpen(true),
    },
    {
      key: "panic",
      icon: panicBusy ? <Loader2 size={22} className="animate-spin" /> : <Siren size={22} />,
      tone: "danger",
      onClick: confirmPanic,
    },
  ];

  const toneCls: Record<string, string> = {
    gold: "border-gold/30 text-gold",
    info: "border-info/30 text-info",
    warning: "border-high/30 text-high",
    danger: "border-critical/40 text-critical bg-critical/5",
  };

  const iconWrapCls: Record<string, string> = {
    gold: "bg-gold-soft text-gold",
    info: "bg-info/10 text-info",
    warning: "bg-high/10 text-high",
    danger: "bg-critical/10 text-critical",
  };

  return (
    <div className="space-y-4">
      {/* ---------- HERO ---------- */}
      <div className="scanline glow-online relative overflow-hidden rounded-2xl border border-online/40">
        {/* backdrop: place image (satellite map if available) → else placeholder */}
        <div className="absolute inset-0">
          {/* placeholder "place image": large building watermark + gradient wash */}
          <div className="absolute inset-0 bg-gradient-to-br from-online/10 via-navy to-navy" />
          <Building2
            className="absolute -right-6 -top-6 text-online/10"
            size={190}
            strokeWidth={1}
          />
          {mapUrl && (
            <img
              src={mapUrl}
              alt=""
              className="h-full w-full object-cover opacity-35"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          )}
          <div className="absolute inset-0 grid-overlay" />
          <div className="absolute inset-0 bg-gradient-to-b from-navy/55 via-navy/80 to-navy" />
        </div>

        <div className="relative p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 rounded-full border border-online/50 bg-online/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-online">
              <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-online" />
              {t("onduty.active")}
            </span>
            <StationLogo logo={logo} name={stationName} />
          </div>

          <h2 className="mt-3 text-xl font-bold leading-tight text-ink">{stationName}</h2>
          {address && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <MapPin size={13} className="text-gold" />
              {address}
            </p>
          )}

          {/* live timer + inside-area chip */}
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="label-eyebrow">{t("onduty.timeOnDuty")}</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-online">{elapsed}</p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-xs text-muted">
                <Clock size={12} className="text-gold" />
                {fmtDateTime(punchInTime)}
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-online/30 bg-online/5 px-2.5 py-1 text-[11px] font-medium text-online">
                <ShieldCheck size={12} />
                {t("onduty.insideArea")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- STATION FEATURES ---------- */}
      <div>
        <p className="label-eyebrow mb-2">{t("onduty.stationFeatures")}</p>
        <div className="grid grid-cols-2 gap-3">
          {features.map((f) => (
            <button
              key={f.key}
              onClick={f.onClick}
              className={`card flex min-h-26 flex-col items-center justify-center gap-3 p-4 text-center transition active:scale-[0.98] ${toneCls[f.tone]}`}
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconWrapCls[f.tone]}`}>
                {f.icon}
              </span>
              <span className="text-base font-semibold tracking-tight text-ink">
                {t(`features.${f.key}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- CONSIGNAS ESPECÍFICAS ---------- */}
      {(consignas || []).length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label-eyebrow">{t("consignas.title", "Consignas de hoy")}</p>
            {pendingConsignas > 0 && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold">
                {t("consignas.pending", "{{n}} pendientes", { n: pendingConsignas })}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {(consignas || []).map((c) => (
              <button
                key={c.id}
                onClick={() => !c.done && setConsigna(c)}
                className={`card flex w-full items-center gap-3 p-3 text-left ${c.done ? "opacity-60" : "active:opacity-80"}`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${c.done ? "bg-online-soft text-online" : "bg-gold-soft text-gold"}`}>
                  {c.done ? <CheckCircle2 size={18} /> : <ClipboardCheck size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{c.title}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {c.time && <><Clock size={11} />{c.time} · </>}
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
          <div className="mb-2 flex items-center justify-between">
            <p className="label-eyebrow">{t("memos.title", "Memos")}</p>
            {pendingMemos > 0 && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold">
                {t("memos.pending", "{{n}} sin leer", { n: pendingMemos })}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {(memos || []).map((m) => (
              <button
                key={m.id}
                onClick={() => setMemo(m)}
                className={`card flex w-full items-center gap-3 p-3 text-left ${m.wasAccepted ? "opacity-60" : "active:opacity-80"}`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${m.wasAccepted ? "bg-online-soft text-online" : "bg-gold-soft text-gold"}`}>
                  {m.wasAccepted ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{m.subject || t("memos.untitled", "Memo")}</span>
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

      {/* ---------- CLOCK OUT (with early-out approval gate) ---------- */}
      <ClockOutControl
        data={data}
        busy={busy}
        onClockOut={onClockOut}
        onRequestClockOut={onRequestClockOut}
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
        onDone={() => { setConsigna(null); reloadConsignas(); }}
      />

      {/* ---------- MEMO READER / ACKNOWLEDGE ---------- */}
      {memo && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setMemo(null)}>
          <div
            className="w-full rounded-t-2xl bg-surface p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-soft text-gold">
                  <FileText size={18} />
                </span>
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
              <button
                onClick={acceptMemo}
                disabled={memoBusy}
                className="btn-xl w-full bg-gold text-white active:opacity-80 disabled:opacity-50"
              >
                {memoBusy ? <Loader2 size={18} className="animate-spin" /> : t("memos.confirmRead", "Confirmar lectura")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Clock-out control with the early-out approval gate. State machine driven by
 * guardMe data: clockOutRequest.status + clockOutThresholdMin + the active
 * record's scheduledEnd.
 */
function ClockOutControl({
  data,
  busy,
  onClockOut,
  onRequestClockOut,
}: {
  data: any;
  busy: boolean;
  onClockOut: () => void;
  onRequestClockOut: () => void;
}) {
  const { t } = useTranslation();
  const status: string | undefined = data?.clockOutRequest?.status;
  const thresholdMin = Number(data?.clockOutThresholdMin ?? 0);
  const scheduledEnd = data?.activeClockIn?.scheduledEnd
    ? new Date(data.activeClockIn.scheduledEnd)
    : null;
  const minsToEnd = scheduledEnd
    ? (scheduledEnd.getTime() - Date.now()) / 60000
    : null;
  const isEarly = minsToEnd != null && minsToEnd > thresholdMin;
  const canClockOut = !isEarly || status === "approved";
  const pending = isEarly && status === "pending";

  if (canClockOut) {
    const approved = status === "approved";
    return (
      <button
        onClick={onClockOut}
        disabled={busy}
        className={`btn-xl w-full text-white active:opacity-80 disabled:opacity-50 ${
          approved ? "bg-online" : "bg-critical"
        }`}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          t(approved ? "onduty.clockOutApproved" : "onduty.clockOut")
        )}
      </button>
    );
  }

  if (pending) {
    return (
      <div className="btn-xl w-full cursor-default border border-gold/40 bg-gold/5 text-gold">
        <Loader2 size={16} className="animate-spin" />
        {t("onduty.clockOutPending")}
      </div>
    );
  }

  // Early, no pending request → offer to request approval.
  return (
    <div className="space-y-2">
      {status === "rejected" && (
        <p className="text-center text-xs text-critical">
          {t("onduty.clockOutRejected")}
        </p>
      )}
      <button
        onClick={onRequestClockOut}
        disabled={busy}
        className="btn-xl w-full bg-high text-white active:opacity-80 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          t("onduty.requestEarlyOut")
        )}
      </button>
      <p className="text-center text-[11px] text-muted">
        {t("onduty.earlyOutHint")}
      </p>
    </div>
  );
}
