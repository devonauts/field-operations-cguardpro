import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Loader, EmptyState } from "@/components/ui";
import { IncidentRow } from "@/components/IncidentRow";
import { IncidentForm } from "@/components/IncidentForm";
import { useAsync } from "@/lib/useAsync";
import { incidentService } from "@/lib/services";
import { normalizeSeverity, normalizeStatus, pick } from "@/lib/normalize";

const SEVERITY_FILTERS = ["all", "critical", "high", "medium", "low"] as const;
const STATUS_FILTERS = ["all", "open", "inProgress", "resolved", "closed"] as const;

export default function SupervisorIncidents() {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sev, setSev] = useState<(typeof SEVERITY_FILTERS)[number]>("all");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");

  const { data, loading, reload } = useAsync(() =>
    incidentService.list({ limit: 100 }).catch(() => ({ rows: [], count: 0 }))
  );

  const rows = data?.rows || [];
  const activeCount = rows.filter(
    (i: any) => normalizeStatus(i.status) === "open"
  ).length;

  const filtered = useMemo(
    () =>
      rows.filter((i: any) => {
        const title = String(pick(i, "subject", "title", "name") || "").toLowerCase();
        if (query && !title.includes(query.toLowerCase())) return false;
        if (sev !== "all" && normalizeSeverity(pick(i, "priority", "severity")) !== sev)
          return false;
        if (status !== "all" && normalizeStatus(i.status) !== status) return false;
        return true;
      }),
    [rows, query, sev, status]
  );

  return (
    <Screen
      title={t("incidents.title")}
      subtitle={t("incidents.active", { count: activeCount })}
      onRefresh={reload}
      right={
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gold-strong px-3 py-2 text-xs font-semibold text-navy active:bg-gold-hover"
        >
          <Plus size={15} />
          {t("incidents.logIncident")}
        </button>
      }
    >
      {loading ? (
        <Loader />
      ) : (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("incidents.searchPlaceholder")}
              className="w-full rounded-xl border border-line bg-surface py-3 pl-9 pr-4 text-sm text-ink placeholder:text-faint outline-none focus:border-gold/60"
            />
          </div>

          {/* Filter chips */}
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {SEVERITY_FILTERS.map((s) => (
              <Chip
                key={s}
                active={sev === s}
                onClick={() => setSev(s)}
                label={s === "all" ? t("incidents.allSeverity") : t(`incidents.severity.${s}`)}
              />
            ))}
          </div>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {STATUS_FILTERS.map((s) => (
              <Chip
                key={s}
                active={status === s}
                onClick={() => setStatus(s)}
                label={s === "all" ? t("incidents.allStatus") : t(`incidents.statusLabel.${s}`)}
              />
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<AlertTriangle size={28} />} title={t("app.noData")} />
          ) : (
            <div className="space-y-3">
              {filtered.map((inc: any, i: number) => (
                <IncidentRow key={inc.id || i} incident={inc} />
              ))}
            </div>
          )}
        </div>
      )}

      <IncidentForm isOpen={formOpen} onClose={() => setFormOpen(false)} onCreated={reload} />
    </Screen>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
        active ? "border-gold bg-gold/10 text-gold" : "border-line text-muted"
      }`}
    >
      {label}
    </button>
  );
}
