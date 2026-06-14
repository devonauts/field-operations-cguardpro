import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { MessageSquare, ChevronRight } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { messageService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { fb } from "@/lib/feedback";

const fmt = (d?: string | null) => {
  if (!d) return "";
  try { return new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

export default function GuardMessages() {
  const { t } = useTranslation();
  const history = useHistory();
  const { data, loading, reload } = useAsync<any>(() => messageService.listThreads({ limit: 50 }).catch(() => ({ rows: [] })));
  const rows: any[] = (data?.rows || []).filter((c: any) => c && c.id);

  // A new message arriving anywhere refreshes the inbox.
  useEffect(() => {
    const off = onPush((d: any) => { if (d?.type === "message.new") reload(); });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen title={t("messages.title", "Mensajes")} onRefresh={async () => { await reload(); }}>
      {loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title={t("messages.empty", "Sin mensajes")} hint={t("messages.emptyHint", "Aquí verás los mensajes de tu empresa.")} />
      ) : (
        <div className="card-elev divide-y divide-line overflow-hidden">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => { fb.tap(); history.push(`/guard/messages/${c.id}`); }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/[0.04]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
                <MessageSquare size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{c.counterpartName || c.recipientName || t("messages.company", "Empresa")}</span>
                  <span className="shrink-0 text-[10px] text-faint">{fmt(c.lastMessageAt)}</span>
                </span>
                <span className="block truncate text-xs text-muted">{c.lastMessagePreview || ""}</span>
              </span>
              {(c.unreadCount || 0) > 0 && (
                <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-critical px-1.5 text-[10px] font-bold text-white">{c.unreadCount}</span>
              )}
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}
