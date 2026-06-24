import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { MessageSquare, Users, ChevronRight, SquarePen, Send, Loader2 } from "lucide-react";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, SkeletonList, Sheet } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import { messageService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { fb } from "@/lib/feedback";

const fmt = (d?: string | null) => {
  if (!d) return "";
  try { return new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

export default function GuardMessages() {
  const { t } = useTranslation();
  const history = useHistory();
  const { data, loading, error, reload } = useAsync<any>(() => messageService.listThreads({ limit: 50 }));
  const rows: any[] = (data?.rows || []).filter((c: any) => c && c.id);
  const [composing, setComposing] = useState(false);

  // A new message arriving anywhere refreshes the inbox.
  useEffect(() => {
    const off = onPush((d: any) => { if (d?.type === "message.new") reload(); });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send a brand-new message to the office, then open the created thread.
  const onSent = async (conversationId: string) => {
    setComposing(false);
    await reload();
    if (conversationId) { fb.tap(); history.push(`/guard/messages/${conversationId}`); }
  };

  return (
    <Screen
      root
      title={t("messages.title", "Mensajes")}
      onRefresh={async () => { await reload(); }}
      right={
        <button
          onClick={() => { fb.tap(); setComposing(true); }}
          aria-label={t("messages.new", "Nuevo mensaje")}
          className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted active:bg-surface-2"
        >
          <SquarePen size={18} />
        </button>
      }
    >
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState title={t("messages.empty", "Sin mensajes")} hint={t("messages.emptyHint", "Aquí verás los mensajes de tu empresa.")} />
          <Button variant="primary" onClick={() => setComposing(true)}>
            <SquarePen size={18} />
            {t("messages.contactOffice", "Escribir a la oficina")}
          </Button>
        </div>
      ) : (
        <div className="card-elev divide-y divide-line overflow-hidden">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => { fb.tap(); history.push(`/guard/messages/${c.id}`); }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:bg-surface-2"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
                {c.isGroup ? <Users size={18} /> : <MessageSquare size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{c.counterpartName || c.recipientName || t("messages.company", "Empresa")}</span>
                  <span className="shrink-0 text-xs text-faint">{fmt(c.lastMessageAt)}</span>
                </span>
                <span className="block truncate text-xs text-muted">{c.lastMessagePreview || (c.isGroup ? t("messages.group", "Grupo") : "")}</span>
              </span>
              {(c.unreadCount || 0) > 0 && (
                <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-critical px-1.5 text-[10px] font-bold text-white">{c.unreadCount}</span>
              )}
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </button>
          ))}
        </div>
      )}

      <ComposeSheet open={composing} onClose={() => setComposing(false)} onSent={onSent} />
    </Screen>
  );
}

/* ----------------------------------------------------------- Compose sheet */

function ComposeSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (conversationId: string) => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      fb.press();
      const res: any = await messageService.create(text, newId());
      fb.success();
      onSent(res?.conversationId || "");
    } catch {
      fb.error();
      setError(t("messages.sendFailed", "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo."));
      setBusy(false);
    }
  };

  // Don't allow dismissing the sheet while a send is in flight.
  const requestClose = () => { if (!busy) onClose(); };

  return (
    <Sheet open={open} onClose={requestClose} title={t("messages.toOffice", "Para la oficina")}>
      <p className="label-eyebrow -mt-1 mb-2">{t("messages.new", "Nuevo mensaje")}</p>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        autoFocus
        placeholder={t("messages.placeholder", "Escribe tu mensaje para la empresa…")}
        className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-gold/50"
      />
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}

      <button
        onClick={send}
        disabled={busy || !body.trim()}
        className="btn-xl mt-4 w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {t("messages.send", "Enviar")}
      </button>
    </Sheet>
  );
}
