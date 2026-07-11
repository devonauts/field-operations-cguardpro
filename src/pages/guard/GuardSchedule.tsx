import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Clock, MapPin, CalendarDays } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, ErrorState, Skeleton } from "@/components/ui";
import { Segmented } from "@/components/ui/kit";
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
const MIN_MS = 60000;
const DAY_MIN = 1440;

/** A shift's [start, end] in ms (end defaults to +30min when missing/invalid). */
function shiftRange(s: any): { start: number; end: number } | null {
  const start = new Date(pick(s, "startTime", "date", "shiftDate") as any).getTime();
  if (Number.isNaN(start)) return null;
  const endRaw = new Date(s.endTime).getTime();
  const end = Number.isNaN(endRaw) ? start + 30 * MIN_MS : Math.max(endRaw, start + 30 * MIN_MS);
  return { start, end };
}

/** True when a shift overlaps the given calendar day (handles overnight shifts). */
function overlapsDay(s: any, day: Date): boolean {
  const r = shiftRange(s);
  if (!r) return false;
  const dayStart = startOfDay(day).getTime();
  return r.start < dayStart + DAY_MIN * MIN_MS && r.end > dayStart;
}

/** Every calendar-day key a shift touches (so an overnight shift marks BOTH days). */
function shiftDayKeys(s: any): string[] {
  const r = shiftRange(s);
  if (!r) return [];
  const keys: string[] = [];
  let cur = startOfDay(new Date(r.start));
  let guard = 0;
  while (cur.getTime() < r.end && guard < 14) { keys.push(ymd(cur)); cur = addDays(cur, 1); guard++; }
  if (!keys.length) keys.push(ymd(new Date(r.start)));
  return keys;
}

/**
 * Timeline blocks for ONE day: every shift that overlaps the day, clipped to the
 * day's [0..1440] minute window. An overnight shift yields its evening slice on
 * the start day (…→24:00) AND its morning slice on the next day (00:00→…) — the
 * fix for night shifts that previously stopped at midnight.
 */
function blocksForDay(allShifts: any[], day: Date) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MIN * MIN_MS;
  const out: any[] = [];
  for (const s of allShifts) {
    const r = shiftRange(s);
    if (!r) continue;
    const top = Math.max(r.start, dayStart);
    const bottom = Math.min(r.end, dayEnd);
    if (bottom <= top) continue;
    const sMin = (top - dayStart) / MIN_MS;
    const eMin = Math.max((bottom - dayStart) / MIN_MS, sMin + 15);
    out.push({ s, sMin, eMin, continuesPrev: r.start < dayStart, continuesNext: r.end > dayEnd });
  }
  out.sort((a, b) => a.sMin - b.sMin);
  return out;
}

type View = "day" | "week" | "month";

export default function GuardSchedule() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-ES";

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [shifts, setShifts] = useState<any[]>([]);
  const [freeDays, setFreeDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const today = startOfDay(new Date());

  // Fetch a generous window around the focused month; refetch when month changes.
  const monthKey = `${anchor.getFullYear()}-${anchor.getMonth()}`;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    const from = addDays(startOfMonth(anchor), -7);
    const to = addDays(endOfMonth(anchor), 7);
    guardService
      .schedule({ from: from.toISOString(), to: to.toISOString() })
      .then((d: any) => {
        if (!alive) return;
        setShifts(asRows(d?.shifts || []));
        setFreeDays(new Set<string>(d?.freeDays || []));
      })
      .catch((e: any) => { if (alive) { setShifts([]); setFreeDays(new Set()); setLoadError(e?.message || "error"); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, reloadKey]);

  // The selected/anchor day's shifts — by OVERLAP, not just start day, so a night
  // shift that began the previous evening still shows on this morning.
  const anchorShifts = useMemo(
    () => shifts.filter((s) => overlapsDay(s, anchor))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [shifts, anchor],
  );

  // Every day any shift TOUCHES (start day through end day) — overnight shifts
  // mark both days. Drives the worked-day dots and the free-day exclusion.
  const workedDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of shifts) for (const k of shiftDayKeys(s)) set.add(k);
    return set;
  }, [shifts]);

  // Free/rest days ("L"): approved time-off PLUS any non-working day that falls
  // within the guard's scheduled rotation span (between the first and last
  // shift we fetched). This reveals the rotation pattern — worked days carry a
  // dot, rest days carry an "L" — without spamming unscheduled future months.
  const freeSet = useMemo(() => {
    const set = new Set<string>(freeDays);
    const times = shifts
      .map((s) => new Date(pick(s, "startTime", "date", "shiftDate") as any).getTime())
      .filter((n) => !Number.isNaN(n));
    if (times.length) {
      let cur = startOfDay(new Date(Math.min(...times)));
      const last = startOfDay(new Date(Math.max(...times)));
      while (cur <= last) {
        const k = ymd(cur);
        if (!workedDays.has(k)) set.add(k);
        cur = addDays(cur, 1);
      }
    }
    return set;
  }, [shifts, freeDays, workedDays]);

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
    <Screen root title={t("nav.schedule", "Horario")}>
      {/* Segmented control */}
      <Segmented<View>
        className="mb-3"
        value={view}
        onChange={setView}
        options={[
          { value: "day", label: t("schedule.day", "Día") },
          { value: "week", label: t("schedule.week", "Semana") },
          { value: "month", label: t("schedule.month", "Mes") },
        ]}
      />

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
        <Skeleton className="h-80 w-full rounded-card" />
      ) : loadError ? (
        <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <>
          {view === "month" && (
            <>
              <MonthGrid anchor={anchor} today={today} weekdayLabels={weekdayLabels} workedDays={workedDays} freeDays={freeSet} onPick={(d: Date) => { fb.tap(); setAnchor(d); }} />
              <Legend t={t} />
              <div className="mt-4">
                <DayHeader anchor={anchor} locale={locale} view={view} />
                <DayShifts shifts={anchorShifts} freeDay={freeSet.has(ymd(anchor))} t={t} />
              </div>
            </>
          )}

          {view === "week" && (
            <>
              <WeekTimeline anchor={anchor} today={today} weekdayLabels={weekdayLabels} shifts={shifts} workedDays={workedDays} freeDays={freeSet} onPick={(d: Date) => { fb.tap(); setAnchor(d); }} t={t} />
              <Legend t={t} />
            </>
          )}

          {view === "day" && (
            <DayTimeline shifts={shifts} freeDay={freeSet.has(ymd(anchor))} anchor={anchor} today={today} t={t} />
          )}
        </>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------ subcomponents */

function MonthGrid({ anchor, today, weekdayLabels, workedDays, freeDays, onPick }: any) {
  const start = startOfWeekMon(startOfMonth(anchor));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = anchor.getMonth();
  return (
    <Card className="p-2">
      <div className="grid grid-cols-7">
        {weekdayLabels.map((w: string, i: number) => (
          <div key={i} className="pb-1 text-center text-xs font-semibold uppercase text-muted">{w}</div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = sameDay(d, today);
          const isSel = sameDay(d, anchor);
          const worked = workedDays.has(ymd(d));
          const free = freeDays.has(ymd(d));
          return (
            <button key={i} onClick={() => onPick(d)} className="relative flex aspect-square flex-col items-center justify-center rounded-xl">
              <span className={[
                "grid h-8 w-8 place-items-center rounded-full text-[13px]",
                isSel ? "bg-gold font-bold text-on-accent" : isToday ? "font-bold text-gold" : inMonth ? "text-ink" : "text-faint",
                !isSel && free ? "bg-online/10" : "",
              ].join(" ")}>{d.getDate()}</span>
              {/* bottom marker: shift dot, else "L" for a free/resting day */}
              {worked ? (
                <span className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${isSel ? "bg-on-accent/70" : "bg-gold"}`} />
              ) : free ? (
                <span className={`absolute bottom-0.5 text-[11px] font-bold leading-none ${isSel ? "text-on-accent" : "text-online"}`}>L</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** iOS-Calendar-style week view: a day-header row (with "L" rest-day markers)
 *  over a scrollable 24h grid of 7 day-columns, with shift blocks positioned by
 *  their real times and a "now" indicator on today's column. */
function WeekTimeline({ anchor, today, weekdayLabels, shifts, workedDays, freeDays, onPick }: any) {
  const HOUR_H = 44;          // px per hour
  const GUTTER = 40;          // px width of the hour-label gutter
  const ws = startOfWeekMon(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const now = new Date();
  const showsToday = days.some((d) => sameDay(d, today));
  const nowMin = showsToday ? (now.getTime() - startOfDay(today).getTime()) / 60000 : -1;

  const fmtStart = (s: any) =>
    s.startTimeLabel || new Date(s.startTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {/* Day-header row (doubles as the day selector) */}
      <div className="mb-1 flex">
        <span className="shrink-0" style={{ width: GUTTER }} />
        <div className="grid flex-1 grid-cols-7 gap-px">
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            const isSel = sameDay(d, anchor);
            const worked = workedDays.has(ymd(d));
            const free = freeDays.has(ymd(d));
            return (
              <button key={i} onClick={() => onPick(d)} className={`flex flex-col items-center rounded-lg py-1 ${isSel ? "bg-gold text-on-accent" : "active:bg-surface-2"}`}>
                <span className={`text-[11px] font-semibold uppercase ${isSel ? "text-on-accent/70" : "text-muted"}`}>{weekdayLabels[i]}</span>
                <span className={`text-[14px] font-bold leading-tight ${isSel ? "text-on-accent" : isToday ? "text-gold" : "text-ink"}`}>{d.getDate()}</span>
                {worked ? (
                  <span className={`mt-0.5 h-1 w-1 rounded-full ${isSel ? "bg-on-accent/70" : "bg-gold"}`} />
                ) : free ? (
                  <span className={`mt-0.5 text-[11px] font-bold leading-none ${isSel ? "text-on-accent" : "text-online"}`}>L</span>
                ) : (
                  <span className="mt-0.5 h-1 w-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 24h grid with 7 day-columns */}
      <Card className="overflow-hidden p-0">
        <div className="relative" style={{ height: 24 * HOUR_H }}>
          {/* Hour gridlines + labels */}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: h * HOUR_H }}>
              <span className="-translate-y-1.5 pr-1 text-right text-[9px] tabular-nums text-faint" style={{ width: GUTTER }}>
                {String(h).padStart(2, "0")}
              </span>
              <span className="h-px flex-1 bg-line/40" />
            </div>
          ))}

          {/* Day columns */}
          <div className="absolute bottom-0 right-0 top-0 grid grid-cols-7" style={{ left: GUTTER }}>
            {days.map((d, i) => {
              const isSel = sameDay(d, anchor);
              return (
                <div key={i} className={`relative border-l border-line/40 ${isSel ? "bg-gold/[0.06]" : ""}`}>
                  {blocksForDay(shifts, d).map((b: any, j: number) => (
                    <button
                      key={b.s.id || j}
                      onClick={() => onPick(d)}
                      className={`absolute inset-x-0.5 z-20 overflow-hidden border border-gold/40 bg-gold/20 px-1 py-0.5 text-left ${
                        b.continuesPrev ? "rounded-t-none border-t-0" : "rounded-t-lg"
                      } ${b.continuesNext ? "rounded-b-none border-b-0" : "rounded-b-lg"}`}
                      style={{ top: (b.sMin / 60) * HOUR_H + 1, height: ((b.eMin - b.sMin) / 60) * HOUR_H - 2 }}
                    >
                      <span className="block truncate text-[9px] font-bold leading-tight text-ink">
                        {b.continuesPrev ? "↑ " : ""}{fmtStart(b.s)}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Now indicator */}
          {nowMin >= 0 && nowMin <= 1440 && (
            <div className="absolute right-0 z-30 flex items-center" style={{ left: GUTTER, top: (nowMin / 60) * HOUR_H }}>
              <span className="-ml-1 h-1.5 w-1.5 rounded-full bg-critical" />
              <span className="h-px flex-1 bg-critical/70" />
            </div>
          )}
        </div>
      </Card>
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

/** A compact legend explaining the grid markers. */
function Legend({ t }: any) {
  return (
    <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted">
      <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-gold" />{t("schedule.legendShift", "Turno")}</span>
      <span className="flex items-center gap-1.5"><span className="font-bold text-online">L</span>{t("schedule.legendFree", "Día libre")}</span>
    </div>
  );
}

/** iOS-Calendar-style day view: a scrollable 24h timeline with shift blocks
 *  positioned at their real times, hour gridlines, and a "now" indicator. */
function DayTimeline({ shifts, freeDay, anchor, today, t }: any) {
  const HOUR_H = 52;          // px per hour
  const GUTTER = 52;          // px width of the hour-label gutter
  const dayStart = startOfDay(anchor);
  const isToday = sameDay(anchor, today);
  const now = new Date();
  const nowMin = isToday ? (now.getTime() - dayStart.getTime()) / 60000 : -1;

  const fmt = (s: any, k: "start" | "end") => s[k === "start" ? "startTimeLabel" : "endTimeLabel"] ||
    new Date(s[k === "start" ? "startTime" : "endTime"]).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  // Overlap-based blocks: an overnight shift renders its evening slice today and
  // its morning slice (00:00→…) on the next day — no longer cut off at midnight.
  const blocks = blocksForDay(shifts, anchor);

  return (
    <div className="mt-3">
      {freeDay && (
        <Card className="mb-3 flex items-center gap-3 p-3.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-online/15 text-lg font-bold text-online">L</span>
          <div>
            <p className="text-[15px] font-semibold text-ink">{t("schedule.freeDay", "Día libre")}</p>
            <p className="text-xs text-muted">{t("schedule.timeOffApproved", "Tiempo libre aprobado")}</p>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden p-0">
        <div className="relative" style={{ height: 24 * HOUR_H }}>
          {/* Hour gridlines + labels */}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: h * HOUR_H }}>
              <span className="-translate-y-1.5 pr-2 text-right text-xs tabular-nums text-faint" style={{ width: GUTTER }}>
                {String(h).padStart(2, "0")}:00
              </span>
              <span className="h-px flex-1 bg-line/50" />
            </div>
          ))}

          {/* Now indicator */}
          {nowMin >= 0 && nowMin <= 1440 && (
            <div className="absolute right-0 z-10 flex items-center" style={{ left: GUTTER, top: (nowMin / 60) * HOUR_H }}>
              <span className="-ml-1 h-2 w-2 rounded-full bg-critical" />
              <span className="h-px flex-1 bg-critical" />
            </div>
          )}

          {/* Shift blocks */}
          {blocks.map((b: any, i: number) => (
            <div
              key={b.s.id || i}
              className={`absolute z-20 overflow-hidden border border-gold/40 bg-gold/15 px-2 py-1 ${
                b.continuesPrev ? "rounded-t-none border-t-0" : "rounded-t-lg"
              } ${b.continuesNext ? "rounded-b-none border-b-0" : "rounded-b-lg"}`}
              style={{ top: (b.sMin / 60) * HOUR_H + 1, height: ((b.eMin - b.sMin) / 60) * HOUR_H - 2, left: GUTTER + 4, right: 6 }}
            >
              <p className="flex items-center gap-1 text-[12px] font-bold text-ink">
                <Clock size={12} className="shrink-0 text-gold" /> {fmt(b.s, "start")} – {fmt(b.s, "end")}
                {b.continuesPrev && <span className="text-[10px] font-semibold text-gold">{t("schedule.fromPrevDay", "(día anterior)")}</span>}
                {b.continuesNext && <span className="text-[10px] font-semibold text-gold">{t("schedule.toNextDay", "(continúa)")}</span>}
              </p>
              {(b.s.station?.stationName || b.s.stationName) && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                  <MapPin size={11} className="shrink-0 text-gold" /> {b.s.station?.stationName || b.s.stationName}
                </p>
              )}
            </div>
          ))}

          {/* Empty state (no shifts and not a free day) */}
          {blocks.length === 0 && !freeDay && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted">
              {t("schedule.noShiftsDay", "Sin turnos este día")}
            </div>
          )}
        </div>
      </Card>
    </div>
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
    <div className="stagger space-y-2.5">
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
