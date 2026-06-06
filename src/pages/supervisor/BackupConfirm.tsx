import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LifeBuoy, Loader2, Check, X, MapPin } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState, Avatar } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { performanceService } from "@/lib/services";
import { fmtDate } from "@/lib/format";

const subjectName = (ev: any) =>
  ev.subject?.fullName ||
  [ev.subject?.firstName, ev.subject?.lastName].filter(Boolean).join(" ") ||
  ev.subject?.email ||
  "—";

export default function BackupConfirm() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(() =>
    performanceService.backupEvents("offered").catch(() => []),
  );
  const rows = (data as any[]) || [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, confirm: boolean) => {
    if (busyId) return;
    setBusyId(id);
    try {
      if (confirm) await performanceService.confirmBackup(id);
      else await performanceService.rejectBackup(id);
      await reload();
    } catch {
      /* surfaced by reload */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen
      title={t("backupConfirm.title")}
      subtitle={t("backupConfirm.subtitle")}
      onRefresh={reload}
    >
      {loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy size={28} />}
          title={t("backupConfirm.empty")}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((ev) => (
            <Card key={ev.id} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar name={subjectName(ev)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {subjectName(ev)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <MapPin size={12} className="text-gold" />
                    {ev.station?.stationName || t("backup.unknownStation")} ·{" "}
                    {fmtDate(ev.eventDate)}
                  </p>
                </div>
              </div>
              {ev.notes && (
                <p className="mt-2 text-xs text-faint">{ev.notes}</p>
              )}
              <div className="mt-3 flex gap-2.5">
                <button
                  onClick={() => act(ev.id, true)}
                  disabled={busyId === ev.id}
                  className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold-strong text-sm font-semibold text-navy active:bg-gold-hover disabled:opacity-50"
                >
                  {busyId === ev.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={16} />
                      {t("backupConfirm.confirm")}
                    </>
                  )}
                </button>
                <button
                  onClick={() => act(ev.id, false)}
                  disabled={busyId === ev.id}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-line px-5 text-sm font-semibold text-muted active:bg-surface-2 disabled:opacity-50"
                >
                  <X size={16} />
                  {t("backupConfirm.reject")}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  );
}
