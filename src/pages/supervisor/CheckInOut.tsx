import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, UserCheck } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Avatar, EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardsService } from "@/lib/services";
import { pick } from "@/lib/normalize";
import { fmtTime } from "@/lib/format";

type Status = "checkedIn" | "checkedOut" | "notInYet" | "late";

// Grace window (minutes) past the scheduled start before a no-show counts late.
const LATE_GRACE_MIN = 10;

/** Scheduled shift start for a guard row, across the loose payload shapes. */
function scheduledStartOf(g: any): number | null {
  const raw = pick(
    g,
    "scheduledStart",
    "shiftStart",
    "scheduledStartTime",
    "startTime",
  ) ||
    g.currentShift?.startTime ||
    g.nextShift?.startTime ||
    g.shift?.startTime;
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function statusOf(g: any, now = Date.now()): Status {
  if (g.isOnDuty || g.onDuty || g.activeClockIn || g.checkedInAt) return "checkedIn";
  if (g.checkedOutAt || g.punchOutTime) return "checkedOut";
  // Trust an explicit backend flag, but fall back to a client-side computation:
  // scheduled to start (past the grace window) yet not checked in = late.
  if (g.late) return "late";
  const sched = scheduledStartOf(g);
  if (sched != null && now > sched + LATE_GRACE_MIN * 60000) return "late";
  return "notInYet";
}

const STATUS_STYLE: Record<Status, string> = {
  checkedIn: "border-online/40 bg-online/5 text-online",
  checkedOut: "border-line-2 text-muted",
  notInYet: "border-gold/40 bg-gold/5 text-gold",
  late: "border-critical/40 bg-critical/5 text-critical",
};

export default function CheckInOut() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  // Surface real failures instead of rendering them as an empty roster.
  const { data, loading, error, reload } = useAsync(() =>
    guardsService.list({ limit: 200 })
  );

  const guards = data?.rows || [];

  const counts = useMemo(() => {
    const c = { checkedIn: 0, checkedOut: 0, notInYet: 0, late: 0 };
    guards.forEach((g: any) => c[statusOf(g)]++);
    return c;
  }, [guards]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return guards.filter((g: any) => {
      const name = (g.fullName || g.name || "").toLowerCase();
      return !q || name.includes(q);
    });
  }, [guards, query]);

  const tiles: { key: Status; cls: string }[] = [
    { key: "checkedIn", cls: "text-online" },
    { key: "checkedOut", cls: "text-muted" },
    { key: "notInYet", cls: "text-gold" },
    { key: "late", cls: "text-critical" },
  ];

  return (
    <Screen
      root
      title={t("checkin.title")}
      subtitle={t("checkin.subtitle")}
      onRefresh={reload}
    >
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-4">
          {/* Stat tiles */}
          <div className="grid grid-cols-4 gap-2">
            {tiles.map((tile) => (
              <Card key={tile.key} className="p-3 text-center">
                <p className={`text-2xl font-bold ${tile.cls}`}>{counts[tile.key]}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                  {t(`checkin.${tile.key}`)}
                </p>
              </Card>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("checkin.searchPlaceholder")}
              className="w-full rounded-xl border border-line bg-surface py-3 pl-9 pr-4 text-sm text-ink placeholder:text-faint outline-none focus:border-gold/60"
            />
          </div>

          {/* Guard list */}
          {filtered.length === 0 ? (
            <EmptyState icon={<UserCheck size={28} />} title={t("app.noData")} />
          ) : (
            <div className="space-y-2">
              {filtered.map((g: any, i: number) => {
                const st = statusOf(g);
                const name = g.fullName || g.name || "—";
                return (
                  <Card key={g.id ?? `${name}-${i}`} className="flex items-center gap-3 p-3">
                    <Avatar name={name} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{name}</p>
                      <p className="truncate text-xs text-muted">
                        {g.station?.stationName ||
                          g.stationName ||
                          t("checkin.unassigned")}
                        {g.checkedInAt ? ` · ${fmtTime(g.checkedInAt)}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[st]}`}
                    >
                      {t(`checkin.${st}`)}
                    </span>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Screen>
  );
}
