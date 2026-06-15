import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Send, Loader2, Paperclip, Play, X } from "lucide-react";
import { Screen } from "@/components/Screen";
import { messageService, type MessageAttachment } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { fb } from "@/lib/feedback";
import { useFileUrl } from "@/lib/fileUrl";

/**
 * Message attachments are stored as raw private paths (no token downloadUrl on
 * the wire), so each one resolves its displayable URL via a token fetch.
 * Wrapped in tiny components because the resolver is a hook and attachments are
 * rendered inside a list .map().
 */
function AttachmentImage({ src, alt, className }: { src?: string | null; alt?: string; className?: string }) {
  const url = useFileUrl(src);
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
function AttachmentLink({ src, children }: { src?: string | null; children: ReactNode }) {
  const url = useFileUrl(src);
  return <a href={url} target="_blank" rel="noreferrer">{children}</a>;
}
function AttachmentVideo({ src, className }: { src?: string | null; className?: string }) {
  const url = useFileUrl(src);
  return <video src={url} controls preload="metadata" className={className} />;
}

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
  const { conversationId: paramId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  // Ionic keeps this page mounted through transitions and its tab outlet
  // transiently yields an undefined route param — which left the thread never
  // loading (load + poll + push listener are all gated on a valid id). Derive
  // the id from the URL as a fallback so it loads reliably; after back-nav the
  // URL is /guard/messages (no id segment) so it correctly stays empty and we
  // never hit /messages/undefined.
  const conversationId =
    paramId && paramId !== "undefined"
      ? paramId
      : location.pathname.match(/\/guard\/messages\/([^/?#]+)/)?.[1] || "";
  const validId = !!conversationId && conversationId !== "undefined";
  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id: load() fires from many sources (poll, push, resume,
  // post-send). A slower earlier response must not overwrite a newer snapshot.
  const loadSeq = useRef(0);

  const scrollDown = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, []);

  // Clear any pending scroll timer on unmount.
  useEffect(() => () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); }, []);

  const load = useCallback(async (markRead = false) => {
    if (!validId) { setLoading(false); return; }
    const seq = ++loadSeq.current;
    try {
      const res: any = await messageService.thread(conversationId, { limit: 60 });
      if (seq !== loadSeq.current) return; // a newer load() superseded this one
      setConversation(res?.conversation || null);
      setMessages((res?.rows || []).slice().reverse()); // API newest-first → show oldest-first
      setLoadError(null);
      if (markRead) messageService.markRead(conversationId).catch(() => {});
      scrollDown();
    } catch (e: any) {
      if (seq !== loadSeq.current) return;
      setLoadError(e?.message || t("messages.loadFailed", "No se pudieron cargar los mensajes."));
    } finally { if (seq === loadSeq.current) setLoading(false); }
  }, [conversationId, validId, scrollDown, t]);

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
    if ((!body && pending.length === 0) || sending || uploading || conversation?.isOneWay || !validId) return;
    fb.press();
    const atts = pending;
    setSending(true);
    setSendError(null);
    setDraft("");
    setPending([]);
    // Optimistic append.
    const temp = { id: `tmp_${Date.now()}`, senderType: "guard", body, attachments: atts, createdAt: new Date().toISOString(), _pending: true };
    setMessages((m) => [...m, temp]);
    scrollDown();
    try {
      await messageService.send(conversationId, body, newId(), atts);
      await load();
    } catch (e: any) {
      // Surface the failure instead of silently dropping it, and restore the draft.
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setDraft(body);
      setPending(atts);
      fb.error();
      setSendError(e?.message || t("messages.sendFailed", "No se pudo enviar. Reintenta."));
    } finally { setSending(false); }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !files.length || !validId) return;
    setUploading(true);
    setSendError(null);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        if (!/^image\/|^video\//.test(file.type)) { setSendError(t("messages.onlyMedia", "Solo imágenes o videos.")); continue; }
        if (file.size > 100 * 1024 * 1024) { setSendError(t("messages.tooBig", "Máximo 100 MB.")); continue; }
        const att = await messageService.uploadAttachment(file);
        setPending((p) => [...p, att]);
      }
    } catch (e: any) {
      setSendError(e?.message || t("messages.uploadFailed", "No se pudo subir el archivo."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-muted">
              {loadError || t("messages.threadEmpty", "Aún no hay mensajes en esta conversación.")}
            </p>
            {loadError && (
              <button onClick={() => { fb.tap(); load(true); }} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink active:bg-surface-2">
                {t("common.retry", "Reintentar")}
              </button>
            )}
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderType === "guard";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-gold text-on-accent" : "bg-surface-2 text-ink"} ${m._pending ? "opacity-60" : ""}`}>
                  {!mine && m.senderName && <p className="mb-0.5 text-[10px] font-semibold opacity-70">{m.senderName}</p>}
                  {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                    <div className="mb-1 grid gap-1.5">
                      {m.attachments.map((a: any, i: number) => (
                        a.type === "video" ? (
                          <AttachmentVideo key={a.id || a.url || i} src={a.url} className="max-h-64 w-full rounded-lg bg-surface-2" />
                        ) : (
                          <AttachmentLink key={a.id || a.url || i} src={a.url}>
                            <AttachmentImage src={a.url} alt={a.name || "imagen"} className="max-h-64 w-full rounded-lg object-cover" />
                          </AttachmentLink>
                        )
                      ))}
                    </div>
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-on-accent/60" : "text-muted"}`}>{fmt(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer pinned at the bottom, clear of the home indicator + keyboard. */}
      {conversation?.isOneWay ? (
        <p
          className="shrink-0 border-t border-line bg-background px-4 pt-3 text-center text-xs text-muted"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
        >
          {t("messages.readOnly", "Esta conversación es solo de lectura.")}
        </p>
      ) : (
        <div
          className="shrink-0 border-t border-line bg-background px-4 pt-2"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
        >
          {sendError && <p className="mb-1 text-[11px] text-critical">{sendError}</p>}
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((a, i) => (
                <div key={(a as any).id || a.url || i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-line-2">
                  {a.type === "video" ? (
                    <div className="flex h-full w-full items-center justify-center bg-surface-2 text-muted"><Play size={18} /></div>
                  ) : (
                    <AttachmentImage src={a.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <button onClick={() => { fb.tap(); setPending((p) => p.filter((_, j) => j !== i)); }} className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl bg-background/80 text-ink"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
            <button
              onClick={() => { fb.tap(); fileRef.current?.click(); }}
              disabled={uploading}
              aria-label={t("messages.attach", "Adjuntar")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line-2 text-muted active:bg-surface-2 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("messages.compose", "Escribe un mensaje…")}
              rows={1}
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-line-2 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
            />
            <button
              onClick={send}
              disabled={sending || uploading || (!draft.trim() && pending.length === 0)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}
    </Screen>
  );
}
