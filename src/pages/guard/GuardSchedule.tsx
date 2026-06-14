import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Clock, MapPin, CalendarDays } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader } from "@/components/ui";
import { guardService } from "@/lib/services";
import { asRows } from "@/lib/api";
import { pick } from "@/lib/normalize";
import fb from "@/lib/feedback";

/* ------------------------------------------------------------ date helpers */
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfWeekMon = (d: Date) => { const x = startOfDay(d); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

type View = "day" | "week" | "month";

export default function GuardSchedule() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-ES";

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [shifts, setShifts] = useState<any[]>([]);
  const [freeDays, setFreeDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const today = startOfDay(new Date());

  // Fetch a generous window around the focused month; refetch when month changes.
  const monthKey = `${anchor.getFullYear()}-${anchor.getMonth()}`;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const from = addDays(startOfMonth(anchor), -7);
    const to = addDays(endOfMonth(anchor), 7);
    guardService
      .schedule({ from: from.toISOString(), to: to.toISOString() })
      .then((d: any) => {
        if (!alive) return;
        setShifts(asRows(d?.shifts || []));
        setFreeDays(new Set<string>(d?.freeDays || []));
      })
      .catch(() => { if (alive) { setShifts([]); setFreeDays(new Set()); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const s of shifts) {
      const ts = new Date(pick(s, "startTime", "date", "shiftDate") as any);
      if (Number.isNaN(ts.getTime())) continue;
      const k = ymd(ts);
      (m.get(k) || m.set(k, []).get(k)!).push(s);
    }
    return m;
  }, [shifts]);

  const shiftsOn = (d: Date) => (byDay.get(ymd(d)) || []).slice().sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  /* ---------------- navigation ---------------- */
  const step = (dir: 1 | -1) => {
    fb.select();
    setAnchor((a) => (view === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, Math.min(a.getDate(), 28))
      : view === "week" ? addDays(a, 7 * dir) : addDays(a, dir)));
  };
  const goToday = () => { fb.tap(); setAnchor(startOfDay(new Date())); };

  const periodLabel = useMemo(() => {
    if (view === "day") return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(anchor);
    if (view === "month") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchor);
    const ws = startOfWeekMon(anchor); const we = addDays(ws, 6);
    const f = (d: Date, opts: any) => new Intl.DateTimeFormat(locale, opts).format(d);
    return `${f(ws, { day: "numeric", month: "short" })} – ${f(we, { day: "numeric", month: "short" })}`;
  }, [view, anchor, locale]);

  const weekdayLabels = useMemo(() => {
    const base = startOfWeekMon(new Date());
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(addDays(base, i)),
    );
  }, [locale]);

  return (
    <Screen title={t("nav.schedule", "Horario")}>
      {/* Segmented control */}
      <div className="mb-3 flex rounded-xl bg-surface-2 p-1">
        {(["day", "week", "month"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => { fb.select(); setView(v); }}
            className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition-colors ${view === v ? "bg-gold text-navy" : "text-muted"}`}
          >
            {v === "day" ? t("schedule.day", "Día") : v === "week" ? t("schedule.week", "Semana") : t("schedule.month", "Mes")}
          </button>
        ))}
      </div>

      {/* Period header + nav */}
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => step(-1)} className="grid h-9 w-9 place-items-center rounded-full text-muted active:bg-surface-2"><ChevronLeft size={20} /></button>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold capitalize text-ink">{periodLabel}</span>
          {!sameDay(anchor, today) && (
            <button onClick={goToday} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-gold active:bg-gold/10">{t("schedule.today", "Hoy")}</button>
          )}
        </div>
        <button onClick={() => step(1)} className="grid h-9 w-9 place-items-center rounded-full text-muted active:bg-surface-2"><ChevronRight size={20} /></button>
      </div>

      {loading ? (
        <Loader />
      ) : (
        <>
          {view === "month" && <MonthGrid anchor={anchor} today={today} weekdayLabels={weekdayLabels} byDay={byDay} freeDays={freeDays} onPick={(d: Date) => { fb.tap(); setAnchor(d); }} />}
          {view === "week" && <WeekStrip anchor={anchor} today={today} weekdayLabels={weekdayLabels} byDay={byDay} freeDays={freeDays} onPick={(d: Date) => { fb.tap(); setAnchor(d); }} />}

          {/* Selected-day events (shown under month/week, and as the body of day view) */}
          <div className="mt-4">
            <DayHeader anchor={anchor} locale={locale} view={view} />
            <DayShifts shifts={shiftsOn(anchor)} freeDay={freeDays.has(ymd(anchor))} t={t} />
          </div>
        </>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------ subcomponents */

function MonthGrid({ anchor, today, weekdayLabels, byDay, freeDays, onPick }: any) {
  const start = startOfWeekMon(startOfMonth(anchor));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = anchor.getMonth();
  return (
    <Card className="p-2">
      <div className="grid grid-cols-7">
        {weekdayLabels.map((w: string, i: number) => (
          <div key={i} className="pb-1 text-center text-[10px] font-semibold uppercase text-muted">{w}</div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = sameDay(d, today);
          const isSel = sameDay(d, anchor);
          const count = (byDay.get(ymd(d)) || []).length;
          const free = freeDays.has(ymd(d));
          return (
            <button key={i} onClick={() => onPick(d)} className="relative flex aspect-square flex-col items-center justify-center">
              <span className={[
                "grid h-8 w-8 place-items-center rounded-full text-[13px]",
                isSel ? "bg-gold font-bold text-navy" : isToday ? "font-bold text-gold" : inMonth ? "text-ink" : "text-faint",
                !isSel && free ? "bg-online/10" : "",
              ].join(" ")}>{d.getDate()}</span>
              {count > 0 && !isSel && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-gold" />}
              {count > 0 && isSel && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-navy/70" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function WeekStrip({ anchor, today, weekdayLabels, byDay, freeDays, onPick }: any) {
  const ws = startOfWeekMon(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
        const isToday = sameDay(d, today);
        const isSel = sameDay(d, anchor);
        const count = (byDay.get(ymd(d)) || []).length;
        const free = freeDays.has(ymd(d));
        return (
          <button key={i} onClick={() => onPick(d)} className={`flex flex-col items-center gap-1 rounded-xl py-2 ${isSel ? "bg-gold text-navy" : "active:bg-surface-2"}`}>
            <span className={`text-[10px] font-semibold uppercase ${isSel ? "text-navy/70" : "text-muted"}`}>{weekdayLabels[i]}</span>
            <span className={`text-[15px] font-bold ${isSel ? "text-navy" : isToday ? "text-gold" : "text-ink"}`}>{d.getDate()}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${count > 0 ? (isSel ? "bg-navy/70" : "bg-gold") : free ? "bg-online/60" : "bg-transparent"}`} />
          </button>
        );
      })}
    </div>
  );
}

function DayHeader({ anchor, locale, view }: any) {
  if (view === "day") return null; // the period header already shows the day
  return (
    <p className="mb-2 text-[13px] font-bold capitalize text-ink">
      {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(anchor)}
    </p>
  );
}

function DayShifts({ shifts, freeDay, t }: any) {
  if (freeDay && shifts.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-online/15 text-online"><CalendarDays size={18} /></span>
        <div>
          <p className="text-[15px] font-semibold text-ink">{t("schedule.freeDay", "Día libre")}</p>
          <p className="text-xs text-muted">{t("schedule.timeOffApproved", "Tiempo libre aprobado")}</p>
        </div>
      </Card>
    );
  }
  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted"><CalendarDays size={24} /></span>
        <p className="text-sm text-muted">{t("schedule.noShiftsDay", "Sin turnos este día")}</p>
      </div>
    );
  }
  const fmt = (s: any, k: "start" | "end") => s[k === "start" ? "startTimeLabel" : "endTimeLabel"] ||
    new Date(s[k === "start" ? "startTime" : "endTime"]).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-2.5">
      {shifts.map((s: any, i: number) => (
        <Card key={s.id || i} className="overflow-hidden p-0">
          <div className="flex">
            <span className="w-1 shrink-0 bg-gold" />
            <div className="flex-1 p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
                  <Clock size={15} className="text-gold" /> {fmt(s, "start")} – {fmt(s, "end")}
                </span>
                {(s.shiftSchedule || s.type) && (
                  <span className="rounded-md border border-gold/40 bg-gold/5 px-2 py-0.5 text-[11px] font-medium text-gold">{s.shiftSchedule || s.type}</span>
                )}
              </div>
              {(s.station?.stationName || s.stationName) && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                  <MapPin size={14} className="text-gold" /> {s.station?.stationName || s.stationName}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
