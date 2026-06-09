import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Send, Loader2 } from "lucide-react";
import { Screen } from "@/components/Screen";
import { messageService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";

const fmt = (d?: string | null) => {
  if (!d) return "";
  try { return new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};
const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

export default function GuardThread() {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId: string }>();
  // Ionic keeps this page mounted through back-transitions, after which
  // useParams yields undefined while timers/listeners still fire. Treat any
  // missing/"undefined" id as invalid so we never hit /messages/undefined.
  const validId = !!conversationId && conversationId !== "undefined";
  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);

  const load = useCallback(async (markRead = false) => {
    if (!validId) { setLoading(false); return; }
    try {
      const res: any = await messageService.thread(conversationId, { limit: 60 });
      setConversation(res?.conversation || null);
      setMessages((res?.rows || []).slice().reverse()); // API newest-first → show oldest-first
      if (markRead) messageService.markRead(conversationId).catch(() => {});
      scrollDown();
    } catch {
      /* keep prior state */
    } finally { setLoading(false); }
  }, [conversationId, validId]);

  useEffect(() => { load(true); }, [load]);

  // Push nudge for THIS thread + foreground poll + resume-reload. DB is truth.
  useEffect(() => {
    if (!validId) return;
    const off = onPush((d: any) => {
      if (d?.type === "message.new" && String(d.conversationId) === String(conversationId)) {
        load(true);
      }
    });
    const id = setInterval(() => load(), 15000);
    const sub = CapacitorApp.addListener("appStateChange", (s) => { if (s.isActive) load(true); });
    return () => {
      off();
      clearInterval(id);
      sub.then((h) => h.remove()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, validId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || conversation?.isOneWay || !validId) return;
    setSending(true);
    setSendError(null);
    setDraft("");
    // Optimistic append.
    const temp = { id: `tmp_${Date.now()}`, senderType: "guard", body, createdAt: new Date().toISOString(), _pending: true };
    setMessages((m) => [...m, temp]);
    scrollDown();
    try {
      await messageService.send(conversationId, body, newId());
      await load();
    } catch (e: any) {
      // Surface the failure instead of silently dropping it, and restore the draft.
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setDraft(body);
      setSendError(e?.message || t("messages.sendFailed", "No se pudo enviar. Reintenta."));
    } finally { setSending(false); }
  };

  return (
    <Screen
      fill
      title={conversation?.subject || t("messages.title", "Mensajes")}
    >
      {/* Scrolling message list — fills the space between header and composer. */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted" /></div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted">{t("messages.threadEmpty", "Aún no hay mensajes en esta conversación.")}</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderType === "guard";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-gold text-navy" : "bg-surface-2 text-ink"} ${m._pending ? "opacity-60" : ""}`}>
                  {!mine && m.senderName && <p className="mb-0.5 text-[10px] font-semibold opacity-70">{m.senderName}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-navy/60" : "text-muted"}`}>{fmt(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer pinned at the bottom, clear of the home indicator + keyboard. */}
      {conversation?.isOneWay ? (
        <p
          className="shrink-0 border-t border-line bg-navy px-4 pt-3 text-center text-xs text-muted"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
        >
          {t("messages.readOnly", "Esta conversación es solo de lectura.")}
        </p>
      ) : (
        <div
          className="shrink-0 border-t border-line bg-navy px-4 pt-2"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
        >
          {sendError && <p className="mb-1 text-[11px] text-critical">{sendError}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("messages.compose", "Escribe un mensaje…")}
              rows={1}
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-line-2 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}
    </Screen>
  );
}
