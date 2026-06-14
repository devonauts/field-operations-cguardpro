import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  ResponsiveContainer,
} from "recharts";
import { Screen } from "@/components/Screen";
import { Card, StatCard, Loader, SectionTitle } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { incidentService } from "@/lib/services";
import { normalizeStatus, pick } from "@/lib/normalize";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PIE_COLORS = ["#ef4444", "#d4a017", "#38bdf8", "#a855f7", "#22c55e", "#94a3b8"];

export default function Reports() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(() =>
    incidentService.list({ limit: 500 }).catch(() => ({ rows: [], count: 0 }))
  );

  const rows = data?.rows || [];

  // Heavy aggregation over up to 500 rows — memoize so unrelated re-renders
  // (recharts measure/resize, i18n language change) don't rescan and reparse
  // dates every time.
  const { total, resolutionRate, monthly, byType } = useMemo(() => {
    const total = data?.count || rows.length;
    const resolved = rows.filter((i: any) =>
      ["resolved", "closed"].includes(normalizeStatus(i.status))
    ).length;
    const resolutionRate = total ? Math.round((resolved / total) * 1000) / 10 : 0;

    // Monthly trend (current year)
    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthly = MONTHS.map((m, idx) => {
      const inMonth = rows.filter((i: any) => {
        const d = new Date(pick(i, "incidentAt", "dateTime", "createdAt") as any);
        return d.getFullYear() === year && d.getMonth() === idx;
      });
      return {
        month: m,
        reported: inMonth.length,
        resolved: inMonth.filter((i: any) =>
          ["resolved", "closed"].includes(normalizeStatus(i.status))
        ).length,
      };
    }).slice(0, currentMonth + 1);

    // By type
    const typeMap = new Map<string, number>();
    rows.forEach((i: any) => {
      const k =
        i.incidentType?.name || i.typeName || pick(i, "subject", "title") || "Other";
      typeMap.set(k, (typeMap.get(k) || 0) + 1);
    });
    const byType = Array.from(typeMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return { total, resolutionRate, monthly, byType };
  }, [rows]);

  return (
    <Screen title={t("reports.title")} subtitle={t("reports.subtitle")} onRefresh={reload}>
      {loading ? (
        <Loader />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t("reports.totalIncidents")} value={total} accent="ink" />
            <StatCard
              label={t("reports.resolutionRate")}
              value={`${resolutionRate}%`}
              accent="online"
            />
          </div>

          {/* Monthly trend */}
          <Card className="p-4">
            <SectionTitle>{t("reports.monthlyTrend")}</SectionTitle>
            <div className="mb-2 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-critical" />
                {t("reports.reported")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-online" />
                {t("reports.resolved")}
              </span>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#8b93a1", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="reported" fill="#b91c1c" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="resolved" fill="#15803d" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* By type */}
          {byType.length > 0 && (
            <Card className="p-4">
              <SectionTitle>{t("reports.byType")}</SectionTitle>
              <div className="flex items-center gap-4">
                <div className="h-36 w-36 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byType}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={64}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {byType.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {byType.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 text-muted">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <span className="font-semibold text-ink">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </Screen>
  );
}
