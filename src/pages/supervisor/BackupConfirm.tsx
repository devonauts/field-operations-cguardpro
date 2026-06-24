import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LifeBuoy, Loader2, Check, X, MapPin } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, SkeletonList, EmptyState, ErrorState, Avatar } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import { performanceService } from "@/lib/services";
import { fmtDate } from "@/lib/format";
import { fb } from "@/lib/feedback";

const subjectName = (ev: any) =>
  ev.subject?.fullName ||
  [ev.subject?.firstName, ev.subject?.lastName].filter(Boolean).join(" ") ||
  ev.subject?.email ||
  "—";

export default function BackupConfirm() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() =>
    performanceService.backupEvents("offered"),
  );
  const rows = (data as any[]) || [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, confirm: boolean) => {
    if (busyId) return;
    setBusyId(id);
    try {
      if (confirm) await performanceService.confirmBackup(id);
      else await performanceService.rejectBackup(id);
      if (confirm) fb.success();
      else fb.warning();
      await reload();
    } catch {
      fb.error();
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
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
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
                <Button
                  variant="primary"
                  onClick={() => act(ev.id, true)}
                  disabled={busyId === ev.id}
                  className="flex flex-1 items-center justify-center gap-2"
                >
                  {busyId === ev.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={16} />
                      {t("backupConfirm.confirm")}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => act(ev.id, false)}
                  disabled={busyId === ev.id}
                  className="flex items-center justify-center gap-2 px-5"
                >
                  <X size={16} />
                  {t("backupConfirm.reject")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  );
}
