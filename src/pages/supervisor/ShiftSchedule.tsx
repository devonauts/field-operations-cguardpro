import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import {
  startOfWeek,
  addDays,
  isSameDay,
  format,
} from "date-fns";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { shiftService } from "@/lib/services";
import { fmtTime } from "@/lib/format";
import { pick } from "@/lib/normalize";
import { fb } from "@/lib/feedback";

export default function ShiftSchedule() {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(() => new Date());

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data, loading, reload } = useAsync(() =>
    shiftService.list({ limit: 300 }).catch(() => [])
  );
  const shifts: any[] = data || [];

  const dayShifts = useMemo(
    () =>
      shifts.filter((s) => {
        const d = new Date(pick(s, "startTime", "date", "shiftDate") as any);
        return !Number.isNaN(d.getTime()) && isSameDay(d, selected);
      }),
    [shifts, selected]
  );

  const dshort = i18n.language?.startsWith("en") ? "EEE" : "EEEEEE";

  return (
    <Screen
      title={t("schedule.title")}
      subtitle={t("schedule.guardsScheduled", { count: dayShifts.length })}
      onRefresh={reload}
    >
      {/* Week day picker */}
      <div className="mb-4 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const active = isSameDay(d, selected);
          return (
            <button
              key={d.toISOString()}
              onClick={() => {
                fb.select();
                setSelected(d);
              }}
              className={`flex flex-col items-center rounded-lg border py-2 ${
                active
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-line text-muted"
              }`}
            >
              <span className="text-[10px] uppercase">{format(d, dshort)}</span>
              <span className="text-base font-bold">{format(d, "d")}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <Loader />
      ) : dayShifts.length === 0 ? (
        <EmptyState icon={<CalendarDays size={28} />} title={t("guard.noShifts")} />
      ) : (
        <div className="space-y-2">
          {dayShifts.map((s, i) => {
            const name =
              s.securityGuard?.fullName ||
              s.guard?.fullName ||
              s.guardName ||
              "—";
            return (
              <Card key={s.id || i} className="border-l-4 !border-l-gold p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{name}</p>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Clock size={13} className="text-gold" />
                    {fmtTime(s.startTime)} — {fmtTime(s.endTime)}
                  </span>
                </div>
                {(s.station?.stationName || s.stationName) && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <MapPin size={13} className="text-gold" />
                    {s.station?.stationName || s.stationName}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
