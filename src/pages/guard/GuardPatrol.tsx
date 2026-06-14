import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal, useIonToast } from "@ionic/react";
import {
  MapPin, CheckCircle2, Circle, ScanLine, Loader2, X, AlertTriangle,
  PartyPopper, RefreshCw, Navigation, Play, Flag, History, CloudOff, ChevronRight,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState, SectionTitle } from "@/components/ui";
import { CustomSelect } from "@/components/Select";
import { RondaQRScanner } from "@/components/RondaQRScanner";
import { IncidentForm } from "@/components/IncidentForm";
import { usePhotoCapture, PhotoStrip } from "@/components/photoCapture";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { rondasService } from "@/lib/rondas";
import { getCurrentPosition, Coords, distanceMeters } from "@/lib/geo";
import { dataUrlToFile } from "@/lib/capture";
import fb from "@/lib/feedback";
import {
  RondaCheckpoint, RondaRoute, CheckpointScanStatus, RondaSettings, DEFAULT_SETTINGS, TagScan,
} from "@/types/rondas";
import { fmtDateTime } from "@/lib/format";

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };
const SCAN_STATUSES: CheckpointScanStatus[] = ["completed", "late", "issue", "skipped"];

/* ----- local persistence (resume after app close / signal loss) ----- */
const sKey = (routeId: string) => `ronda.session.${routeId}`;
const scKey = (routeId: string) => `ronda.scanned.${routeId}`;
const PENDING_KEY = "ronda.pending";
const ls = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k: string) { try { localStorage.removeItem(k); } catch {} },
};

interface PendingScan {
  routeId: string;
  tagIdentifier: string;
  checkpointName: string;
  latitude?: number;
  longitude?: number;
  stationId?: string;
  notes?: string;
  status: CheckpointScanStatus;
  photoDataUrl?: string;
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export default function GuardPatrol() {
  const { t } = useTranslation();
  const [present] = useIonToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pendingCp, setPendingCp] = useState<RondaCheckpoint | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [pending, setPending] = useState<PendingScan[]>(() => ls.get<PendingScan[]>(PENDING_KEY, []));
  const [showHistory, setShowHistory] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const dash = await guardService.dashboard().catch(() => null);
    const station = dash?.stations?.[0] || null;
    const settings: RondaSettings = await rondasService.settings().catch(() => DEFAULT_SETTINGS);
    // Rondas are isolated per STATION. Fetch only this station's tours (server-side
    // filter by stationId) and keep strictly those whose stationId matches — never
    // fall back to the whole tenant, and never match at the post-site level (a
    // sibling/orphaned station at the same post-site must not leak in).
    const fetched: RondaRoute[] = station
      ? await rondasService.routes({ stationId: station.id }).catch(() => [])
      : [];
    const routes: RondaRoute[] = station
      ? (fetched as RondaRoute[]).filter((r) => (r as any).stationId === station.id)
      : [];
    for (const r of routes) {
      try { r.tags = await rondasService.tags(r.id); } catch { r.tags = []; }
    }
    const scans: TagScan[] = await rondasService.scans({ limit: 200 }).catch(() => []);
    const patrols = await rondasService.patrols().catch(() => []);
    return { station, settings, routes, scans, patrols };
  });

  const settings = data?.settings || DEFAULT_SETTINGS;
  const routes = data?.routes || [];
  const station = data?.station;
  const route = routes.find((r) => r.id === selectedId) || routes[0];
  const routeId = route?.id || "";

  const checkpoints = useMemo(
    () => (route?.tags || []).slice().sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [route]
  );

  // Restore session + scanned for the active route (incl. backend reconciliation).
  useEffect(() => {
    if (!routeId) return;
    const sess = ls.get<{ startedAt: number } | null>(sKey(routeId), null);
    setStartedAt(sess?.startedAt ?? null);
    const local: string[] = ls.get<string[]>(scKey(routeId), []);
    // reconcile with backend scans for this route's tags
    const tagIdById = new Map((route?.tags || []).map((tg) => [tg.id, tg.tagIdentifier]));
    const backend = (data?.scans || [])
      .map((sc) => tagIdById.get(sc.siteTourTagId || ""))
      .filter(Boolean) as string[];
    setScanned(new Set([...local, ...backend]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, data?.scans]);

  // live timer
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // auto-flush pending scans when back online
  useEffect(() => {
    const onOnline = () => flushPending();
    window.addEventListener("online", onOnline);
    const id = setInterval(() => { if (navigator.onLine && pending.length) flushPending(); }, 20000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const persistScanned = (next: Set<string>) => ls.set(scKey(routeId), Array.from(next));

  const startPatrol = () => {
    fb.press();
    const ts = Date.now();
    setStartedAt(ts);
    ls.set(sKey(routeId), { startedAt: ts });
    // Stamp startAt + notify tenant/client (best-effort; don't block the UI).
    if (routeId) rondasService.startPatrol(routeId).catch(() => {});
  };
  const finishPatrol = () => {
    fb.success();
    setStartedAt(null);
    ls.del(sKey(routeId));
    ls.del(scKey(routeId));
    setScanned(new Set());
    reload();
  };

  const doneCount = checkpoints.filter((c) => scanned.has(c.tagIdentifier)).length;
  const allDone = checkpoints.length > 0 && doneCount === checkpoints.length;
  const nextCp = checkpoints.find((c) => !scanned.has(c.tagIdentifier));

  const onScan = (value: string) => {
    setScannerOpen(false);
    const cp = checkpoints.find((c) => c.tagIdentifier === value);
    if (!cp) { present({ message: t("rondas.wrongCheckpoint"), duration: 2500, color: "warning", position: "top" }); return; }
    if (scanned.has(cp.tagIdentifier)) { present({ message: t("rondas.alreadyScanned"), duration: 2000, position: "top" }); return; }
    setPendingCp(cp);
  };

  /** Server-side location verdict returned by the scan endpoint. */
  type ScanLocation = { validLocation: boolean | null; distanceMeters: number | null; radiusM: number; verified: boolean };

  /** Submit (or queue when offline) a checkpoint scan. Returns the server's
   *  location-verification verdict so the guard sees if they were on-site. */
  const submitScan = async (cp: RondaCheckpoint, p: {
    coords: Coords | null; notes: string; status: CheckpointScanStatus; photoDataUrl?: string;
  }): Promise<{ status: "ok" | "queued"; location?: ScanLocation }> => {
    const markDone = () => {
      setScanned((s) => { const n = new Set(s).add(cp.tagIdentifier); persistScanned(n); return n; });
    };
    const tryOnline = async (): Promise<ScanLocation | undefined> => {
      let photoPrivateUrl: string | undefined, photoFileToken: string | undefined;
      if (p.photoDataUrl) {
        const up = await rondasService.uploadPhoto(dataUrlToFile(p.photoDataUrl, `ronda-${Date.now()}.jpg`));
        photoPrivateUrl = up.privateUrl; photoFileToken = up.fileToken;
      }
      const resp: any = await rondasService.scan({
        tagIdentifier: cp.tagIdentifier,
        latitude: p.coords?.latitude, longitude: p.coords?.longitude, stationId: station?.id,
        scannedData: {
          checkpointName: cp.name, notes: p.notes || undefined, status: p.status,
          photoPrivateUrl, photoFileToken, device: navigator.userAgent, appVersion: "0.1.0",
        },
      });
      return resp?.location as ScanLocation | undefined;
    };
    if (!navigator.onLine) {
      queueScan(cp, p); markDone(); return { status: "queued" };
    }
    try { const location = await tryOnline(); markDone(); return { status: "ok", location }; }
    catch { queueScan(cp, p); markDone(); return { status: "queued" }; }
  };

  const queueScan = (cp: RondaCheckpoint, p: { coords: Coords | null; notes: string; status: CheckpointScanStatus; photoDataUrl?: string; }) => {
    const item: PendingScan = {
      routeId, tagIdentifier: cp.tagIdentifier, checkpointName: cp.name,
      latitude: p.coords?.latitude, longitude: p.coords?.longitude, stationId: station?.id,
      notes: p.notes, status: p.status, photoDataUrl: p.photoDataUrl,
    };
    setPending((q) => { const n = [...q, item]; ls.set(PENDING_KEY, n); return n; });
  };

  const flushPending = async () => {
    const queue = ls.get<PendingScan[]>(PENDING_KEY, []);
    if (!queue.length || !navigator.onLine) return;
    const remaining: PendingScan[] = [];
    for (const it of queue) {
      try {
        let photoPrivateUrl: string | undefined, photoFileToken: string | undefined;
        if (it.photoDataUrl) {
          const up = await rondasService.uploadPhoto(dataUrlToFile(it.photoDataUrl, `ronda-${Date.now()}.jpg`));
          photoPrivateUrl = up.privateUrl; photoFileToken = up.fileToken;
        }
        await rondasService.scan({
          tagIdentifier: it.tagIdentifier, latitude: it.latitude, longitude: it.longitude, stationId: it.stationId,
          scannedData: { checkpointName: it.checkpointName, notes: it.notes, status: it.status, photoPrivateUrl, photoFileToken },
        });
      } catch { remaining.push(it); }
    }
    setPending(remaining); ls.set(PENDING_KEY, remaining);
    if (remaining.length === 0) present({ message: t("rondas.synced"), duration: 2000, color: "success", position: "top" });
  };

  return (
    <Screen
      title={t("rondas.title")}
      subtitle={route?.name || t("rondas.subtitle")}
      onRefresh={reload}
      right={
        startedAt ? (
          <span className="font-mono text-sm font-bold tabular-nums text-online">{fmtElapsed(now - startedAt)}</span>
        ) : undefined
      }
    >
      {loading ? (
        <Loader />
      ) : checkpoints.length === 0 ? (
        <>
          <EmptyState icon={<MapPin size={28} />} title={t("rondas.noRoutes")} />
          <HistorySection patrols={data?.patrols || []} open={showHistory} setOpen={setShowHistory} />
        </>
      ) : (
        <div className="space-y-4">
          {routes.length > 1 && !startedAt && (
            <CustomSelect
              value={route?.id || ""}
              options={routes.map((r) => ({ value: r.id, label: r.name }))}
              label={t("rondas.selectRoute")}
              onChange={(v) => setSelectedId(v)}
            />
          )}

          {/* offline / pending banner */}
          {pending.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-high/40 bg-high/10 px-3 py-2.5 text-xs text-high">
              <CloudOff size={15} className="shrink-0" />
              <span className="flex-1">{t("rondas.pendingSync", { count: pending.length })}</span>
              <button onClick={() => { fb.tap(); flushPending(); }} className="font-semibold underline">{t("rondas.syncNow")}</button>
            </div>
          )}

          {!startedAt ? (
            /* ---------- start screen ---------- */
            <Card className="p-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold-soft">
                <Play className="text-gold" size={30} />
              </div>
              <p className="text-base font-semibold text-ink">{route?.name}</p>
              <p className="mt-1 text-xs text-muted">{t("rondas.startHint")}</p>
              <p className="mt-1 text-xs text-faint">{checkpoints.length} {t("rondas.allCheckpoints").toLowerCase()}</p>
              <button onClick={startPatrol} className="btn-xl mt-5 w-full bg-gold-strong text-navy active:bg-gold-hover">
                <Play size={18} />
                {doneCount > 0 ? t("rondas.resume") : t("rondas.start")}
              </button>
            </Card>
          ) : (
            /* ---------- in-progress ---------- */
            <>
              <Card className="p-4">
                <SectionTitle right={<span className="text-xs text-muted">{t("rondas.progress", { done: doneCount, total: checkpoints.length })}</span>}>
                  {t("rondas.inProgress")}
                </SectionTitle>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(doneCount / checkpoints.length) * 100}%` }} />
                </div>
                {allDone ? (
                  <div className="mt-4 rounded-xl border border-online/40 bg-online/5 p-4 text-center">
                    <PartyPopper className="mx-auto mb-1 text-online" size={26} />
                    <p className="text-sm font-semibold text-online">{t("rondas.completedTitle")}</p>
                    <p className="mt-0.5 text-xs text-muted">{t("rondas.completedHint")}</p>
                  </div>
                ) : nextCp ? (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 p-3">
                    <Navigation size={18} className="shrink-0 text-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="label-eyebrow">{t("rondas.nextCheckpoint")}</p>
                      <p className="truncate text-sm font-semibold text-ink">{nextCp.name}</p>
                      {nextCp.location && <p className="truncate text-xs text-muted">{nextCp.location}</p>}
                    </div>
                    <ChevronRight size={18} className="text-muted" />
                  </div>
                ) : null}
              </Card>

              {/* checkpoint list */}
              <div className="space-y-2">
                {checkpoints.map((cp, i) => {
                  const done = scanned.has(cp.tagIdentifier);
                  const isNext = nextCp?.id === cp.id;
                  return (
                    <Card key={cp.id || i} className={`flex items-center gap-3 p-3.5 ${done ? "!border-online/40" : isNext ? "!border-gold/40" : ""}`}>
                      {done ? <CheckCircle2 className="shrink-0 text-online" size={20} /> : <Circle className={`shrink-0 ${isNext ? "text-gold" : "text-low"}`} size={20} />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{cp.name}</p>
                        {(cp.location || cp.instructions) && <p className="truncate text-xs text-muted">{cp.location || cp.instructions}</p>}
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium ${done ? "text-online" : "text-faint"}`}>
                        {done ? t("rondas.done") : t("rondas.pending")}
                      </span>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          <HistorySection patrols={data?.patrols || []} open={showHistory} setOpen={setShowHistory} />
        </div>
      )}

      {/* action bar */}
      {checkpoints.length > 0 && startedAt && (
        <div className="sticky bottom-0 -mx-4 mt-4 space-y-2 border-t border-line bg-navy px-4 pt-3" style={footerStyle}>
          {!allDone ? (
            <button onClick={() => { fb.tap(); setScannerOpen(true); }} className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover">
              <ScanLine size={18} />{t("rondas.scanQR")}
            </button>
          ) : (
            <button onClick={finishPatrol} className="btn-xl w-full bg-online text-white active:opacity-80">
              <Flag size={18} />{t("rondas.finish")}
            </button>
          )}
          <button onClick={() => { fb.tap(); setIssueOpen(true); }} className="btn-xl w-full border border-critical/40 text-critical">
            <AlertTriangle size={18} />{t("rondas.reportIssue")}
          </button>
        </div>
      )}

      {scannerOpen && <RondaQRScanner onScan={onScan} onClose={() => setScannerOpen(false)} />}

      {pendingCp && (
        <ScanConfirm
          checkpoint={pendingCp}
          settings={settings}
          onClose={() => setPendingCp(null)}
          onSubmit={async (p) => {
            const r = await submitScan(pendingCp, p);
            setPendingCp(null);
            const loc = r.location;
            if (r.status === "ok" && loc?.verified && loc.validLocation === false) {
              // Server confirmed the guard was NOT within the checkpoint geofence.
              present({
                message: t("rondas.outOfLocationServer", {
                  dist: loc.distanceMeters != null ? Math.round(Number(loc.distanceMeters)) : "?",
                  max: loc.radiusM,
                  defaultValue: "Escaneo registrado FUERA de ubicación: {{dist}} m del punto (máx {{max}} m).",
                }),
                duration: 5000, color: "danger", position: "top",
              });
            } else {
              present({
                message: r.status === "queued" ? t("rondas.offlineSaved") : t("rondas.scanned"),
                duration: 2500, color: r.status === "queued" ? "warning" : "success", position: "top",
              });
            }
          }}
        />
      )}

      <IncidentForm isOpen={issueOpen} onClose={() => setIssueOpen(false)} onCreated={() => setIssueOpen(false)} asGuard station={station} />
    </Screen>
  );
}

/* ------------------ checkpoint scan confirmation ------------------ */
function ScanConfirm({ checkpoint, settings, onClose, onSubmit }: {
  checkpoint: RondaCheckpoint;
  settings: RondaSettings;
  onClose: () => void;
  onSubmit: (p: { coords: Coords | null; notes: string; status: CheckpointScanStatus; photoDataUrl?: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { photos, addPhoto, removePhoto, Inputs } = usePhotoCapture();
  const [status, setStatus] = useState<CheckpointScanStatus>("completed");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGps = () => {
    setGpsError(false);
    getCurrentPosition().then(setCoords).catch(() => setGpsError(true));
  };
  useEffect(() => { fetchGps(); }, []);

  // distance to checkpoint (if it has coordinates)
  const cpLat = Number(checkpoint.latitude), cpLng = Number(checkpoint.longitude);
  const hasCpCoords = !Number.isNaN(cpLat) && !Number.isNaN(cpLng) && (cpLat !== 0 || cpLng !== 0);
  const dist = coords && hasCpCoords ? Math.round(distanceMeters(coords.latitude, coords.longitude, cpLat, cpLng)) : null;

  const submit = async () => {
    if (busy) return;
    fb.press();
    setError(null);
    // enforce settings.
    // TESTING ESCAPE HATCH: VITE_GEOFENCE_BYPASS=true lets you scan checkpoints
    // from anywhere (mirrors the backend GUARD_GEOFENCE_BYPASS). Leave unset for
    // production so the ronda geofence is enforced.
    const geofenceBypass = import.meta.env.VITE_GEOFENCE_BYPASS === "true";
    if (settings.requireGeofence && !geofenceBypass) {
      if (!coords) { setError(t("rondas.locationRequired")); return; }
      if (dist != null && dist > settings.geofenceRadius) {
        setError(t("rondas.mustBeCloser", { dist, max: settings.geofenceRadius })); return;
      }
    }
    if (settings.requirePhoto && photos.length === 0) { setError(t("rondas.photoRequired")); return; }
    if (settings.requireNote && !notes.trim()) { setError(t("rondas.noteRequired")); return; }

    setBusy(true);
    try {
      await onSubmit({ coords, notes, status, photoDataUrl: photos[0]?.dataUrl });
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60";

  return (
    <IonModal isOpen onDidDismiss={onClose}>
      <div className="flex h-full flex-col bg-navy">
        <Inputs />
        <div className="safe-top flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ScanLine size={18} className="text-gold" />{t("rondas.confirmCheckpoint")}
          </h2>
          <button onClick={onClose} className="text-muted"><X size={22} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
          <Card className="p-4">
            <p className="text-base font-semibold text-ink">{checkpoint.name}</p>
            {checkpoint.location && <p className="mt-0.5 text-xs text-muted">{checkpoint.location}</p>}
            {checkpoint.instructions && <p className="mt-2 text-sm text-muted">{checkpoint.instructions}</p>}
          </Card>

          {/* GPS + distance */}
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${
            coords ? (dist != null && dist > settings.geofenceRadius ? "border-critical/40 bg-critical/5 text-critical" : "border-online/40 bg-online/5 text-online")
            : gpsError ? "border-critical/40 bg-critical/5 text-critical" : "border-line text-muted"
          }`}>
            <Navigation size={14} />
            {coords ? (
              <span>{coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}{dist != null ? ` · ${dist} m` : ""}</span>
            ) : gpsError ? (
              <button onClick={fetchGps} className="flex items-center gap-1 font-medium"><RefreshCw size={12} /> {t("rondas.gpsError")}</button>
            ) : (
              <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {t("rondas.gettingLocation")}</span>
            )}
          </div>

          <div>
            <label className="label-eyebrow mb-1.5 block">{t("rondas.statusLabel")}</label>
            <div className="grid grid-cols-4 gap-2">
              {SCAN_STATUSES.map((s) => (
                <button key={s} onClick={() => { fb.select(); setStatus(s); }} className={`flex min-h-[44px] items-center justify-center rounded-lg border px-1 text-[11px] font-semibold ${status === s ? "border-gold bg-gold/10 text-gold" : "border-line text-muted"}`}>
                  {t(`rondas.scanStatus.${s}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label-eyebrow mb-1.5 block">
              {t("rondas.notes")}{settings.requireNote && <span className="text-critical"> *</span>}
            </label>
            <textarea rows={2} className={`${input} resize-none`} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div>
            <label className="label-eyebrow mb-1.5 block">
              {t("rondas.evidence")}{settings.requirePhoto && <span className="text-critical"> *</span>}
            </label>
            <PhotoStrip photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
          </div>

          {error && <p className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">{error}</p>}
        </div>

        <div className="border-t border-line px-4 pt-3" style={footerStyle}>
          <button onClick={submit} disabled={busy} className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} />{t("rondas.submitScan")}</>}
          </button>
        </div>
      </div>
    </IonModal>
  );
}

/* ----------------------------- history ----------------------------- */
function HistorySection({ patrols, open, setOpen }: { patrols: any[]; open: boolean; setOpen: (b: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Card className="p-0">
      <button onClick={() => { fb.tap(); setOpen(!open); }} className="flex w-full items-center gap-2 px-4 py-3.5 text-sm font-semibold text-ink">
        <History size={16} className="text-gold" />
        <span className="flex-1 text-left">{t("rondas.history")}</span>
        <ChevronRight size={18} className={`text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-line px-4 py-2">
          {patrols.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted">{t("rondas.noHistory")}</p>
          ) : (
            <div className="divide-y divide-line">
              {patrols.slice(0, 20).map((p, i) => (
                <div key={p.id || i} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{p.routeName || t("rondas.title")}</p>
                    <p className="text-[11px] text-faint">{fmtDateTime(p.startAt || p.updatedAt)} · {p.scanCount} {t("rondas.allCheckpoints").toLowerCase()}</p>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${p.status === "completed" ? "border-online/40 bg-online/5 text-online" : "border-line-2 text-muted"}`}>
                    {p.status === "completed" ? t("rondas.scanStatus.completed") : t("rondas.inProgress")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
