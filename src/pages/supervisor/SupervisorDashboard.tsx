import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Activity,
  MapPin,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Screen } from "@/components/Screen";
import { Card, StatCard, Loader, SectionTitle, Dot, Avatar } from "@/components/ui";
import { IncidentRow } from "@/components/IncidentRow";
import { useAsync } from "@/lib/useAsync";
import {
  operationsService,
  incidentService,
  guardsService,
} from "@/lib/services";
import { normalizeStatus, pick } from "@/lib/normalize";
import { fb } from "@/lib/feedback";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SupervisorDashboard() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(async () => {
    const [kpis, incidents, guards] = await Promise.all([
      operationsService.kpis().catch(() => []),
      incidentService.list({ limit: 50 }).catch(() => ({ rows: [], count: 0 })),
      guardsService.activeLocations().catch(() => []),
    ]);
    return { kpis, incidents: incidents.rows, total: incidents.count, guards };
  });

  const kpiVal = (id: string) =>
    (data?.kpis || []).find((k: any) => k.id === id)?.value ?? "—";

  const incidents = data?.incidents || [];
  const openIncidents = incidents.filter(
    (i: any) => normalizeStatus(i.status) === "open"
  ).length;
  const guards = data?.guards || [];

  // Incidents this week, grouped by weekday — computed from real data.
  const weekData = (() => {
    const counts = new Array(7).fill(0);
    incidents.forEach((i: any) => {
      const d = new Date(pick(i, "incidentAt", "dateTime", "createdAt") as any);
      if (!Number.isNaN(d.getTime())) {
        const days = (Date.now() - d.getTime()) / 86400000;
        if (days <= 7) counts[d.getDay()]++;
      }
    });
    return WEEKDAYS.map((d, idx) => ({ day: d, count: counts[idx] }));
  })();

  return (
    <Screen
      root
      title={t("dashboard.operationsOverview")}
      subtitle={t("dashboard.openIncidents", { count: openIncidents })}
      onRefresh={reload}
      right={
        <div className="flex items-center gap-1.5 rounded-full border border-online/40 bg-online-soft px-2.5 py-1 text-[11px] font-semibold text-online">
          <Activity size={13} />
          {t("dashboard.live")}
        </div>
      }
    >
      {loading ? (
        <Loader />
      ) : (
        <div className="space-y-4">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t("dashboard.guardsOnSite")}
              value={kpiVal("guards") !== "—" ? kpiVal("guards") : guards.length}
              accent="gold"
              icon={<Users size={16} />}
            />
            <StatCard
              label={t("dashboard.openIncidentsKpi")}
              value={openIncidents || kpiVal("incidents")}
              accent="critical"
              icon={<AlertTriangle size={16} />}
            />
            <StatCard
              label={t("dashboard.patrolsToday")}
              value={kpiVal("rondas")}
              accent="online"
              icon={<CheckCircle2 size={16} />}
            />
            <StatCard
              label={t("dashboard.avgResponse")}
              value={kpiVal("stations")}
              accent="info"
              icon={<MapPin size={16} />}
            />
          </div>

          {/* Incidents this week */}
          <Card className="p-4">
            <SectionTitle>{t("dashboard.incidentsThisWeek")}</SectionTitle>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#8b93a1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={26}>
                    {weekData.map((_, i) => (
                      <Cell key={i} fill="#d4a017" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Active guards */}
          <Card className="p-4">
            <SectionTitle
              right={
                <span className="text-xs text-muted">
                  {t("dashboard.onShift", { on: guards.length, total: guards.length })}
                </span>
              }
            >
              {t("dashboard.activeGuards")}
            </SectionTitle>
            {guards.length === 0 ? (
              <p className="text-xs text-muted">{t("app.noData")}</p>
            ) : (
              <div className="space-y-3">
                {guards.slice(0, 6).map((g: any, i: number) => {
                  const name = g.fullName || g.name || g.guardName || "—";
                  return (
                    <div key={g.id || i} className="flex items-center gap-3">
                      <Dot color="online" />
                      <Avatar name={name} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{name}</p>
                        <p className="truncate text-xs text-muted">
                          {g.stationName || g.station?.stationName || g.location || ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Recent incidents */}
          <div>
            <SectionTitle
              right={
                <Link
                  to="/supervisor/incidents"
                  onClick={() => fb.tap()}
                  className="pressable text-xs font-medium text-gold"
                >
                  {t("app.viewAll")}
                </Link>
              }
            >
              {t("dashboard.recentIncidents")}
            </SectionTitle>
            <div className="space-y-3">
              {incidents.slice(0, 4).map((inc: any, i: number) => (
                <IncidentRow key={inc.id || i} incident={inc} />
              ))}
              {incidents.length === 0 && (
                <p className="text-xs text-muted">{t("app.noData")}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
