import { useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { useTranslation } from "react-i18next";
import { Map as MapIcon, CheckCircle2, Circle, Activity, ChevronRight } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, SectionTitle, EmptyState, Dot } from "@/components/ui";
import RondaDetailModal from "@/components/RondaDetailModal";
import { useAsync } from "@/lib/useAsync";
import { rondasService } from "@/lib/rondas";
import { RondaRoute, RondaCheckpoint, TagScan } from "@/types/rondas";
import { fmtTime, relativeTime } from "@/lib/format";
import { fb } from "@/lib/feedback";

/**
 * Supervisor live patrol tracking — consolidated on the siteTour system
 * (routes = tours, checkpoints = tags, scans = tagScans). Replaces the
 * deprecated patrol/patrolCheckpoint endpoints.
 */
export default function PatrolTracking() {
  const { t } = useTranslation();
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const routes: RondaRoute[] = await rondasService.routes().catch(() => []);
    // Fetch every route's tags in parallel — sequential awaits serialize N
    // round-trips and make load/refresh slow proportional to route count.
    await Promise.all(
      routes.map(async (r) => {
        try {
          r.tags = await rondasService.tags(r.id);
        } catch {
          r.tags = [];
        }
      })
    );
    const scans: TagScan[] = await rondasService.scans({ limit: 200 }).catch(() => []);
    return { routes, scans };
  });

  // The screen advertises "live" checkpoint state, so poll for fresh scans on a
  // bounded interval instead of only on mount / manual pull-to-refresh. Pause
  // while the app is backgrounded (timers are throttled there anyway) and
  // refresh once on return to the foreground; clean up on unmount.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id == null) id = setInterval(() => reloadRef.current(), 20000);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    start();
    const sub = CapacitorApp.addListener("appStateChange", (state) => {
      if (state.isActive) {
        reloadRef.current();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.then((h) => h.remove()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routes: RondaRoute[] = data?.routes || [];
  const scans: TagScan[] = data?.scans || [];
  const selected = activeRoute || routes[0]?.id || null;
  const route = routes.find((r) => r.id === selected) || routes[0];

  // Clearance must be scoped to the current operating window, NOT to whatever
  // happens to be in the loaded 200-row scan page — otherwise yesterday's scans
  // light up today's checkpoints as "done". Mirror the shift/day scoping used in
  // OnDutyView (which filters scans to >= shiftStart): with no clock-in context
  // on the supervisor side, scope to the start of the current local day.
  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [data]);

  // Latest in-window scan per checkpoint (siteTourTagId), so each cleared
  // checkpoint can show WHEN it was scanned and by WHOM.
  const scanByTag = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of scans as any[]) {
      const tagId = s.siteTourTagId;
      if (!tagId) continue;
      const ts = new Date(s.scannedAt).getTime();
      if (Number.isNaN(ts) || ts < dayStart) continue;
      const prev = m.get(tagId);
      if (!prev || ts > new Date(prev.scannedAt).getTime()) m.set(tagId, s);
    }
    return m;
  }, [scans, dayStart]);

  // Recent scan activity, also scoped to the current day window.
  const recentScans = useMemo(
    () =>
      (scans as any[]).filter((s) => {
        const ts = new Date(s.scannedAt).getTime();
        return !Number.isNaN(ts) && ts >= dayStart;
      }),
    [scans, dayStart]
  );

  const guardOf = (s: any): string | undefined =>
    s?.guard?.fullName || s?.guardName || s?.scannedData?.guardName;

  const checkpoints: RondaCheckpoint[] = useMemo(
    () =>
      (route?.tags || [])
        .slice()
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [route]
  );
  const cleared = checkpoints.filter((c) => scanByTag.has(c.id)).length;

  return (
    <Screen root title={t("patrol.title")} subtitle={t("patrol.subtitle")} onRefresh={reload}>
      {loading ? (
        <Loader />
      ) : routes.length === 0 ? (
        <EmptyState icon={<MapIcon size={28} />} title={t("rondas.noRoutes")} />
      ) : (
        <div className="space-y-4">
          {/* Route selector */}
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {routes.map((r) => {
              const isActive = (selected || routes[0]?.id) === r.id;
              const live = (r as any).active !== false;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    fb.select();
                    setActiveRoute(r.id);
                  }}
                  className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
                    isActive ? "border-gold bg-gold/10 text-gold" : "border-line text-muted"
                  }`}
                >
                  <Dot color={live ? "online" : "muted"} />
                  {r.name || t("nav.patrol")}
                  <span className="text-[10px] uppercase opacity-70">
                    {live ? t("patrol.active") : t("patrol.scheduled")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progress */}
          <Card className="p-4">
            <SectionTitle
              right={
                <span className="text-xs text-muted">
                  {t("patrol.cleared", { done: cleared, total: checkpoints.length })}
                </span>
              }
            >
              {route?.name}
            </SectionTitle>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gold"
                style={{
                  width: checkpoints.length ? `${(cleared / checkpoints.length) * 100}%` : "0%",
                }}
              />
            </div>
          </Card>

          {/* Checkpoints */}
          <div>
            <SectionTitle icon={<MapIcon size={16} />}>{t("patrol.allCheckpoints")}</SectionTitle>
            {checkpoints.length === 0 ? (
              <EmptyState icon={<MapIcon size={28} />} title={t("app.noData")} />
            ) : (
              <div className="space-y-2">
                {checkpoints.map((cp, i) => {
                  const scan = scanByTag.get(cp.id);
                  const done = !!scan;
                  const guard = guardOf(scan);
                  // Subtitle: who scanned it (cleared) or the checkpoint location.
                  const subtitle = done
                    ? [guard, fmtTime(scan.scannedAt)].filter(Boolean).join(" · ")
                    : cp.location || cp.instructions || "";
                  return (
                    <Card key={cp.id ?? `${cp.name || "cp"}-${i}`} className="flex items-center gap-3 p-3.5">
                      {done ? (
                        <CheckCircle2 className="shrink-0 text-online" size={20} />
                      ) : (
                        <Circle className="shrink-0 text-low" size={20} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {cp.name || `CP-${i + 1}`}
                        </p>
                        {subtitle && (
                          <p className="truncate text-xs text-muted">{subtitle}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] font-medium">
                        {done ? (
                          <span className="text-online">{t("patrol.clearedDot")}</span>
                        ) : (
                          <span className="text-faint">{t("patrol.pending")}</span>
                        )}
                      </span>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent scan activity (today) — its own label, not the incidents one */}
          {recentScans.length > 0 && (
            <div>
              <SectionTitle icon={<Activity size={16} />}>
                {t("patrol.recentScans", "Actividad de rondas")}
              </SectionTitle>
              <div className="space-y-2">
                {recentScans.slice(0, 8).map((s: any, i: number) => {
                  const sd: any = s.scannedData || {};
                  const cpName =
                    sd.checkpointName || s.tag?.name || t("patrol.title");
                  const guard = guardOf(s);
                  const aid = s.tourAssignmentId;
                  return (
                    <button
                      key={s.id ?? `${s.scannedAt || ""}-${i}`}
                      onClick={() => { if (aid) { fb.tap(); setDetailId(aid); } }}
                      disabled={!aid}
                      className="card-elev pressable flex w-full items-center gap-3 p-3 text-left disabled:opacity-100"
                    >
                      <CheckCircle2 size={16} className="shrink-0 text-online" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{cpName}</p>
                        <p className="truncate text-[11px] text-faint">
                          {[guard, fmtTime(s.scannedAt)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted">
                        {relativeTime(s.scannedAt)}
                      </span>
                      {aid && <ChevronRight size={15} className="shrink-0 text-faint" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {detailId && <RondaDetailModal assignmentId={detailId} staff onClose={() => setDetailId(null)} />}
    </Screen>
  );
}
