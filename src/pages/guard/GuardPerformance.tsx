import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  TrendingDown,
  Gift,
  Lightbulb,
  BarChart3,
  ListChecks,
  Activity,
  BookOpen,
  CalendarX,
  Clock,
  LifeBuoy,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState, ErrorState, ScoreRing, MeterBar, SectionTitle } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import {
  loadGuardPerformanceDetail,
  tierFor,
  WEIGHTS,
  ComponentKey,
  Tier,
} from "@/lib/performance";
import { fmtDate } from "@/lib/format";
import fb from "@/lib/feedback";

/* Tier + component palettes — mirror GuardDashboard's PerformanceSection. */
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
  quiz: "#6366f1", // distinct indigo data-viz series (no semantic token)
  training: "var(--high)",
};

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

const COMPONENT_ORDER = Object.keys(WEIGHTS) as ComponentKey[];

export default function GuardPerformance() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(30);

  const perf = useAsync(() => loadGuardPerformanceDetail(period), [period]);
  const p = perf.data;

  return (
    <Screen
      back
      title={t("perfDetail.title")}
      subtitle={t("perfDetail.subtitle")}
      onRefresh={() => perf.reload()}
    >
      {/* Period segmented control */}
      <div className="mb-4 flex rounded-xl bg-surface-2 p-1">
        {PERIODS.map((d) => (
          <button
            key={d}
            onClick={() => {
              fb.select();
              setPeriod(d);
            }}
            className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition-colors ${
              period === d ? "bg-gold text-on-accent" : "text-muted"
            }`}
          >
            {t(`perfDetail.period${d}`)}
          </button>
        ))}
      </div>

      {perf.loading && !p ? (
        <Loader />
      ) : perf.error && !p ? (
        <ErrorState onRetry={() => perf.reload()} />
      ) : !p ? (
        <EmptyState icon={<BarChart3 size={40} />} title={t("perf.noData")} />
      ) : (
        <Content p={p} t={t} />
      )}
    </Screen>
  );
}

function Content({ p, t }: { p: any; t: (k: string, o?: any) => string }) {
  const color = TIER_COLOR[p.tier as Tier];
  const s = p.stats || {};
  const penalty = p.penalty || { points: 0, absences: 0, tardies: 0 };
  const bonus = p.bonus || { points: 0, volunteerCount: 0, coverCount: 0 };
  const trend: { label: string; score: number }[] = Array.isArray(p.trend) ? p.trend : [];
  const events = p.events || { absences: [], tardies: [], backups: [] };

  if (!p.hasData) {
    return (
      <div className="space-y-4">
        <Card className="p-5">
          <SectionTitle icon={<TrendingUp size={16} />}>{t("perfDetail.overall")}</SectionTitle>
          <EmptyState icon={<BarChart3 size={40} />} title={t("perf.noData")} />
        </Card>
        <Glossary t={t} />
      </div>
    );
  }

  // ---- Stats grid -----------------------------------------------------------
  const statTiles: { key: string; value: string | number }[] = [
    { key: "hours", value: round(s.hoursWorked) },
    { key: "shifts", value: s.shiftsWorked ?? 0 },
    { key: "onTime", value: s.onTimeShifts ?? 0 },
    {
      key: "attendanceRate",
      value: s.attendanceRate == null ? "—" : `${Math.round(s.attendanceRate * 100)}%`,
    },
    { key: "avgLatenessMin", value: `${round(s.avgLatenessMin)} min` },
    { key: "absences", value: s.absences ?? 0 },
    { key: "tardies", value: s.tardies ?? 0 },
    { key: "shiftsScheduled", value: s.shiftsScheduled ?? 0 },
  ];

  const noEvents =
    !events.absences?.length && !events.tardies?.length && !events.backups?.length;

  return (
    <div className="space-y-4">
      {/* Hero: score + tier */}
      <Card className="p-5">
        <SectionTitle icon={<TrendingUp size={16} />}>{t("perfDetail.overall")}</SectionTitle>
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
            <span className="mt-2 text-xs text-faint">{t("perf.estimated")}</span>
          )}
        </div>
      </Card>

      {/* Trend */}
      <Card className="p-4">
        <SectionTitle icon={<Activity size={16} />}>{t("perfDetail.trendTitle")}</SectionTitle>
        {trend.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted">{t("perfDetail.trendEmpty")}</p>
        ) : (
          <div className="flex h-32 items-end gap-1.5 pt-2">
            {trend.map((pt, i) => {
              const h = Math.max(4, Math.min(100, pt.score));
              const c = TIER_COLOR[tierFor(pt.score)];
              return (
                <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[11px] font-semibold tabular-nums text-muted">
                    {Math.round(pt.score)}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height: `${h}%`,
                        background: c,
                        transition: "height 500ms ease",
                      }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[11px] text-faint">
                    {pt.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Breakdown */}
      <Card className="p-4">
        <SectionTitle icon={<ListChecks size={16} />}>
          {t("perfDetail.breakdownTitle")}
        </SectionTitle>
        <div className="space-y-4">
          {COMPONENT_ORDER.map((key) => {
            const comp = (p.components || []).find((c: any) => c.key === key);
            const score = comp?.score ?? 0;
            const pct = Math.round((WEIGHTS[key] || 0) * 100);
            return (
              <div key={key}>
                <MeterBar
                  label={t(`perf.component.${key}`)}
                  score={score}
                  color={COMPONENT_COLOR[key]}
                />
                <div className="mt-1.5 flex items-start gap-2">
                  <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">
                    {t("perfDetail.weight", { pct })}
                  </span>
                  <p className="text-[11px] leading-snug text-muted">
                    {t(`perfDetail.componentHint.${key}`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Stats grid */}
      <Card className="p-4">
        <SectionTitle icon={<BarChart3 size={16} />}>{t("perfDetail.statsTitle")}</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          {statTiles.map((tile) => (
            <div key={tile.key} className="rounded-xl bg-surface-2 p-2.5 text-center">
              <p className="text-base font-bold tabular-nums text-ink">{tile.value}</p>
              <p className="mt-0.5 text-xs leading-tight text-muted">
                {t(`perf.stat.${tile.key}`)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Penalty */}
      <Card className="p-4">
        <SectionTitle icon={<TrendingDown size={16} />}>
          {t("perfDetail.penaltyTitle")}
        </SectionTitle>
        {penalty.points > 0 || penalty.absences > 0 || penalty.tardies > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical/5 px-3 py-2 text-[13px] font-semibold text-critical">
            <TrendingDown size={15} className="shrink-0" />
            <span>
              {t("perfDetail.penaltyDetail", {
                absences: penalty.absences || 0,
                tardies: penalty.tardies || 0,
                points: penalty.points || 0,
              })}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted">{t("perfDetail.penaltyNone")}</p>
        )}
      </Card>

      {/* Backup bonus */}
      <Card className="p-4">
        <SectionTitle icon={<Gift size={16} />}>{t("perfDetail.bonusTitle")}</SectionTitle>
        {bonus.points > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-online/40 bg-online/5 px-3 py-2 text-[13px] font-semibold text-online">
            <Gift size={15} className="shrink-0" />
            <span>
              {t("perfDetail.bonusDetail", {
                volunteer: bonus.volunteerCount || 0,
                cover: bonus.coverCount || 0,
                points: bonus.points || 0,
              })}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted">{t("perfDetail.bonusNone")}</p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
          <LifeBuoy size={12} className="shrink-0" />
          {t("perfDetail.bonusNote")}
        </p>
      </Card>

      {/* Recent activity */}
      <Card className="p-4">
        <SectionTitle icon={<Activity size={16} />}>{t("perfDetail.eventsTitle")}</SectionTitle>
        {noEvents ? (
          <p className="text-xs text-muted">{t("perfDetail.noEvents")}</p>
        ) : (
          <ul className="space-y-2.5">
            {events.tardies?.map((e: any, i: number) => (
              <EventRow
                key={`t${i}`}
                icon={<Clock size={14} />}
                tone="warn"
                title={t("perfDetail.eventTardy", { min: Math.round(e.minutesLate || 0) })}
                date={e.date}
                sub={e.shiftLabel}
              />
            ))}
            {events.absences?.map((e: any, i: number) => (
              <EventRow
                key={`a${i}`}
                icon={<CalendarX size={14} />}
                tone="bad"
                title={t("perfDetail.eventAbsence")}
                date={e.date}
                sub={e.shiftLabel}
              />
            ))}
            {events.backups?.map((e: any, i: number) => (
              <EventRow
                key={`b${i}`}
                icon={<Gift size={14} />}
                tone="good"
                title={t("perfDetail.eventBackup")}
                date={e.date}
                sub={e.stationName}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Tips */}
      {Array.isArray(p.tips) && p.tips.length > 0 && (
        <Card className="p-4">
          <SectionTitle icon={<Lightbulb size={16} />}>{t("perfDetail.tipsTitle")}</SectionTitle>
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

      {/* Glossary */}
      <Glossary t={t} />
    </div>
  );
}

function Glossary({ t }: { t: (k: string, o?: any) => string }) {
  const rows: string[] = [...COMPONENT_ORDER, "penalty", "bonus"];
  return (
    <Card className="p-4">
      <SectionTitle icon={<BookOpen size={16} />}>{t("perfDetail.glossaryTitle")}</SectionTitle>
      <p className="mb-3 text-[11px] leading-snug text-muted">{t("perfDetail.glossaryIntro")}</p>
      <dl className="space-y-3">
        {rows.map((key) => {
          const label =
            key === "penalty"
              ? t("perfDetail.penaltyTitle")
              : key === "bonus"
                ? t("perfDetail.bonusTitle")
                : t(`perf.component.${key}`);
          return (
            <div key={key}>
              <dt className="text-xs font-semibold text-ink">{label}</dt>
              <dd className="mt-0.5 text-[11px] leading-snug text-muted">
                {t(`perfDetail.glossary.${key}`)}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

function EventRow({
  icon,
  tone,
  title,
  date,
  sub,
}: {
  icon: React.ReactNode;
  tone: "good" | "warn" | "bad";
  title: string;
  date: string;
  sub?: string;
}) {
  const toneClass = {
    good: "text-online",
    warn: "text-gold",
    bad: "text-critical",
  }[tone];
  return (
    <li className="flex items-center gap-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 ${toneClass}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-faint">{fmtDate(date)}</span>
    </li>
  );
}

function round(n: any): number {
  const v = Number(n) || 0;
  return Math.round(v * 10) / 10;
}
