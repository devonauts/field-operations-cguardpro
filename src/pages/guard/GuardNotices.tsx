import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellRing, ClipboardCheck, CheckCircle2, Loader2 } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, EmptyState, ErrorState, SkeletonList, SectionTitle } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { notificationService } from "@/lib/services";
import { memosService, MemoItem } from "@/lib/rondas";
import { relativeTime } from "@/lib/format";
import { pick } from "@/lib/normalize";
import { fb } from "@/lib/feedback";

/** Memos pendientes de confirmación — el "Recibido" alimenta memos.wasAccepted
 *  en el CRM (endpoint existente que la app nunca llamaba). */
function MemoAckList() {
  const { t } = useTranslation();
  const { data, reload } = useAsync<MemoItem[]>(
    () => memosService.list().catch(() => [] as MemoItem[]),
    [],
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = (data || []).filter((m: any) => !m.wasAccepted);
  if (pending.length === 0) return null;

  const accept = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await memosService.accept(id);
      fb.success();
      await reload();
    } catch {
      fb.error?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-4">
      <SectionTitle icon={<ClipboardCheck size={16} />}>
        {t("notices.memosPending", { defaultValue: "Memorandos por confirmar" })}
      </SectionTitle>
      <div className="space-y-3">
        {pending.map((m: any) => (
          <Card key={m.id} className="!border-gold/40 p-4">
            <p className="text-sm font-semibold text-ink">{m.title || m.subject || "Memorando"}</p>
            {(m.description || m.body || m.message) && (
              <p className="mt-0.5 text-xs text-muted">{m.description || m.body || m.message}</p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-faint">{relativeTime(m.createdAt)}</p>
              <button
                onClick={() => accept(m.id)}
                disabled={busyId === m.id}
                className="flex items-center gap-1.5 rounded-lg bg-gold-strong px-3 py-1.5 text-xs font-semibold text-on-accent active:bg-gold-hover disabled:opacity-60"
              >
                {busyId === m.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {t("notices.memoAck", { defaultValue: "Recibido" })}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function GuardNotices() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() =>
    notificationService.list({ limit: 50 })
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
      <MemoAckList />
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : notices.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title={t("notices.empty")} />
      ) : (
        <div className="stagger space-y-3">
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
                        <span className="shrink-0 rounded-full bg-gold px-1.5 py-0.5 text-[11px] font-bold uppercase text-on-accent">
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
