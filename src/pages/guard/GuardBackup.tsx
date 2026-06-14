import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LifeBuoy, Loader2, Check, MapPin } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { fmtDate, fmtTime } from "@/lib/format";
import { fb } from "@/lib/feedback";

interface OpenShift {
  shiftId: string;
  stationId: string;
  stationName: string | null;
  startTime: string;
  endTime: string;
  absentGuard: string | null;
  alreadyOffered: boolean;
}

export default function GuardBackup() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(() =>
    guardService.backupOpen().catch(() => []),
  );
  const rows: OpenShift[] = (data as OpenShift[]) || [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const volunteer = async (shiftId: string) => {
    if (busyId) return;
    fb.press();
    setBusyId(shiftId);
    try {
      await guardService.volunteerBackup({ shiftId });
      fb.success();
      await reload();
    } catch {
      fb.error();
      /* surfaced by reload state */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen
      back
      title={t("backup.title")}
      subtitle={t("backup.subtitle")}
      onRefresh={reload}
    >
      {loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState icon={<LifeBuoy size={28} />} title={t("backup.empty")} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">{t("backup.explain")}</p>
          {rows.map((s) => (
            <Card key={s.shiftId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <MapPin size={14} className="text-gold" />
                    {s.stationName || t("backup.unknownStation")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {fmtDate(s.startTime)} · {fmtTime(s.startTime)} —{" "}
                    {fmtTime(s.endTime)}
                  </p>
                  {s.absentGuard && (
                    <p className="mt-1 text-[11px] text-faint">
                      {t("backup.covering", { name: s.absentGuard })}
                    </p>
                  )}
                </div>
                {s.alreadyOffered ? (
                  <span className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-online/40 bg-online/5 px-4 text-sm font-semibold text-online">
                    <Check size={16} />
                    {t("backup.offered")}
                  </span>
                ) : (
                  <button
                    onClick={() => volunteer(s.shiftId)}
                    disabled={busyId === s.shiftId}
                    className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-gold-strong px-4 text-sm font-semibold text-navy active:bg-gold-hover disabled:opacity-50"
                  >
                    {busyId === s.shiftId ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      t("backup.volunteer")
                    )}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  );
}
