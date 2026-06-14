import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellRing } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { notificationService } from "@/lib/services";
import { relativeTime } from "@/lib/format";
import { pick } from "@/lib/normalize";

export default function GuardNotices() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(() =>
    notificationService.list({ limit: 50 }).catch(() => [])
  );
  const notices = useMemo(
    () =>
      (data || []).slice().sort((a: any, b: any) => {
        const ta = new Date(pick(a, "createdAt") as any).getTime() || 0;
        const tb = new Date(pick(b, "createdAt") as any).getTime() || 0;
        return tb - ta;
      }),
    [data]
  );

  return (
    <Screen title={t("notices.title")} subtitle={t("notices.subtitle")} onRefresh={reload}>
      {loading ? (
        <Loader />
      ) : notices.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title={t("notices.empty")} />
      ) : (
        <div className="space-y-3">
          {notices.map((n: any, i: number) => {
            const unread = n.readStatus === false || n.readStatus === 0;
            const title = pick<string>(n, "title", "subject") || "—";
            const body = pick<string>(n, "body", "message", "content");
            return (
              <Card
                key={n.id || i}
                className={`p-4 ${unread ? "!border-gold/40" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      unread ? "bg-gold-soft text-gold" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {unread ? <BellRing size={16} /> : <Bell size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{title}</p>
                      {unread && (
                        <span className="shrink-0 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase text-navy">
                          {t("notices.new")}
                        </span>
                      )}
                    </div>
                    {body && <p className="mt-0.5 text-xs text-muted">{body}</p>}
                    <p className="mt-1 text-[11px] text-faint">
                      {relativeTime(pick(n, "createdAt"))}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
