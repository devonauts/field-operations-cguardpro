import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { MessageSquare, ChevronRight, SquarePen, Send, Loader2, X } from "lucide-react";
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

const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

export default function GuardMessages() {
  const { t } = useTranslation();
  const history = useHistory();
  const { data, loading, reload } = useAsync<any>(() => messageService.listThreads({ limit: 50 }).catch(() => ({ rows: [] })));
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
        <Loader />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState title={t("messages.empty", "Sin mensajes")} hint={t("messages.emptyHint", "Aquí verás los mensajes de tu empresa.")} />
          <button
            onClick={() => { fb.tap(); setComposing(true); }}
            className="btn-xl bg-gold-strong text-on-accent active:bg-gold-hover"
          >
            <SquarePen size={18} />
            {t("messages.contactOffice", "Escribir a la oficina")}
          </button>
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

      {composing && <ComposeSheet onClose={() => setComposing(false)} onSent={onSent} />}
    </Screen>
  );
}

/* ----------------------------------------------------------- Compose sheet */

function ComposeSheet({ onClose, onSent }: { onClose: () => void; onSent: (conversationId: string) => void }) {
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div
        className="relative max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-2" />
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="label-eyebrow">{t("messages.new", "Nuevo mensaje")}</p>
            <h3 className="text-base font-bold text-ink">{t("messages.toOffice", "Para la oficina")}</h3>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-full p-2 text-muted active:bg-surface-2 disabled:opacity-50" aria-label={t("app.close", "Cerrar")}>
            <X size={20} />
          </button>
        </div>

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
      </div>
    </div>
  );
}
