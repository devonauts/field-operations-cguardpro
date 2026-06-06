import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonInfiniteScroll, IonInfiniteScrollContent } from "@ionic/react";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { asRows } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import { pick } from "@/lib/normalize";

const PAGE = 12;

export default function GuardSchedule() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(PAGE);
  const { data, loading, error, reload } = useAsync(() => guardService.schedule());

  // Only shifts from now through the next month, sorted, de-duplicated.
  const shifts = useMemo(() => {
    const raw: any[] = data?.shifts ? asRows(data.shifts) : asRows(data);
    const now = Date.now();
    const horizon = now + 31 * 24 * 60 * 60 * 1000; // ~1 month ahead
    const seen = new Set<string>();
    return raw
      .map((s) => ({ s, ts: new Date(pick(s, "startTime", "date", "shiftDate") as any).getTime() }))
      .filter(({ ts }) => !Number.isNaN(ts) && ts <= horizon && ts >= now - 12 * 3600 * 1000)
      .sort((a, b) => a.ts - b.ts)
      .filter(({ s }) => {
        // collapse exact-duplicate shift rows
        const key = `${s.startTime}|${s.endTime}|${s.stationId || s.station?.id || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ s }) => s);
  }, [data]);

  const shown = shifts.slice(0, visible);
  const hasMore = visible < shifts.length;

  return (
    <Screen
      title={t("nav.schedule")}
      subtitle={t("schedule.nextMonth")}
      onRefresh={async () => {
        setVisible(PAGE);
        await reload();
      }}
    >
      {loading ? (
        <Loader />
      ) : error ? (
        <EmptyState icon={<CalendarDays size={28} />} title={t("app.noData")} hint={error} />
      ) : shifts.length === 0 ? (
        <EmptyState icon={<CalendarDays size={28} />} title={t("guard.noShifts")} />
      ) : (
        <>
          <div className="space-y-3">
            {shown.map((s, i) => (
              <Card key={s.id || i} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">
                    {fmtDate(pick(s, "startTime", "date", "shiftDate"))}
                  </p>
                  {(s.shiftSchedule || s.type) && (
                    <span className="rounded-md border border-gold/40 bg-gold/5 px-2 py-0.5 text-[11px] font-medium text-gold">
                      {s.shiftSchedule || s.type}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <Clock size={14} className="text-gold" />
                  {fmtTime(s.startTime)} — {fmtTime(s.endTime)}
                </div>
                {(s.station?.stationName || s.stationName) && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <MapPin size={14} className="text-gold" />
                    {s.station?.stationName || s.stationName}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <IonInfiniteScroll
            disabled={!hasMore}
            onIonInfinite={(e) => {
              setVisible((v) => v + PAGE);
              (e.target as HTMLIonInfiniteScrollElement).complete();
            }}
          >
            <IonInfiniteScrollContent loadingSpinner="crescent" />
          </IonInfiniteScroll>

          {!hasMore && (
            <p className="mt-4 text-center text-[11px] text-faint">
              {t("schedule.allShown", { count: shifts.length })}
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
