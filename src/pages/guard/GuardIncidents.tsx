import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Plus } from "lucide-react";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { IncidentRow, IncidentDetailSheet } from "@/components/IncidentRow";
import { IncidentForm } from "@/components/IncidentForm";
import { useAsync } from "@/lib/useAsync";
import { incidentService } from "@/lib/services";
import fb from "@/lib/feedback";

export default function GuardIncidents() {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  // Track real failure separately from "loaded but empty" so a fetch error
  // renders <ErrorState> with retry — not a misleading empty list.
  const { data, loading, error, reload } = useAsync(() =>
    incidentService.list({ limit: 50 })
  );
  const rows = data?.rows || [];

  return (
    <Screen
      back
      title={t("guard.myIncidents")}
      subtitle={t("guard.reportIncident")}
      onRefresh={reload}
      right={
        <button
          onClick={() => {
            fb.tap();
            setFormOpen(true);
          }}
          className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-gold-strong px-4 text-xs font-semibold text-on-accent active:bg-gold-hover"
        >
          <Plus size={16} />
          {t("incidents.logIncident")}
        </button>
      }
    >
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={28} />} title={t("app.noData")} />
      ) : (
        <div className="space-y-3">
          {rows.map((inc: any, i: number) => (
            <IncidentRow
              key={inc.id || i}
              incident={inc}
              onClick={setSelected}
            />
          ))}
        </div>
      )}

      {/* Guard detail is read-only (no status actions). */}
      <IncidentDetailSheet
        incident={selected}
        open={selected != null}
        onClose={() => setSelected(null)}
      />

      <IncidentForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={reload}
        asGuard
      />
    </Screen>
  );
}
