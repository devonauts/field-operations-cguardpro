import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import {
  Send, Loader2, Paperclip, Camera, Play, X, Mic, Smile,
  Check, CheckCheck, Clock, Users, Lock,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { messageService, type MessageAttachment } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { fb } from "@/lib/feedback";
import { useFileUrl } from "@/lib/fileUrl";
import { useAuth } from "@/context/AuthContext";
import { startRecording, stopRecording, cancelRecording, isRecordingSupported } from "@/lib/audioRecorder";
import { ensureMicPermission } from "@/lib/micPermission";
import { ImageViewer } from "@/components/shared/ImageViewer";
import styles from "./GuardThread.module.css";

function AttachmentImage({ src, alt, className }: { src?: string | null; alt?: string; className?: string }) {
  const url = useFileUrl(src);
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
function AttachmentVideo({ src, className }: { src?: string | null; className?: string }) {
  const url = useFileUrl(src);
  return <video src={url} controls preload="metadata" className={className} />;
}
function AttachmentAudio({ src }: { src?: string | null }) {
  const url = useFileUrl(src);
  return <audio src={url} controls preload="metadata" className="w-56 max-w-full" />;
}

const fmt = (d?: string | null) => {
  if (!d) return "";
  try { return new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};
const dayLabel = (d?: string | null, t?: any) => {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(dt, today)) return t ? t("incidents.today", "Hoy") : "Hoy";
  if (same(dt, y)) return t ? t("incidents.yesterday", "Ayer") : "Ayer";
  return dt.toLocaleDateString([], { day: "numeric", month: "long" });
};
const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

// Stable per-sender name color (WhatsApp-style) so the guard sees who's writing.
const SENDER_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f59e0b", "#06b6d4", "#ef4444"];
function colorFor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

export default function GuardThread() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const myUserId = user?.id ? String(user.id) : null;
  const { conversationId: paramId } = useParams<{ conversationId: string }>();
  const location = useLocation();
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
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const recStartedAt = useRef(0);
  const recTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);

  const scrollDown = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, []);
  useEffect(() => () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); }, []);

  const load = useCallback(async (markRead = false) => {
    if (!validId) { setLoading(false); return; }
    const seq = ++loadSeq.current;
    try {
      const res: any = await messageService.thread(conversationId, { limit: 80 });
      if (seq !== loadSeq.current) return;
      setConversation(res?.conversation || null);
      setMessages((res?.rows || []).slice().reverse());
      setLoadError(null);
      if (markRead) messageService.markRead(conversationId).catch(() => {});
      scrollDown();
    } catch (e: any) {
      if (seq !== loadSeq.current) return;
      setLoadError(e?.message || t("messages.loadFailed", "No se pudieron cargar los mensajes."));
    } finally { if (seq === loadSeq.current) setLoading(false); }
  }, [conversationId, validId, scrollDown, t]);

  useEffect(() => { load(true); }, [load]);

  useEffect(() => {
    if (!validId) return;
    const off = onPush((d: any) => {
      if (d?.type === "message.new" && String(d.conversationId) === String(conversationId)) load(true);
    });
    const id = setInterval(() => load(), 15000);
    const sub = CapacitorApp.addListener("appStateChange", (s) => { if (s.isActive) load(true); });
    return () => { off(); clearInterval(id); sub.then((h) => h.remove()).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, validId]);

  const send = async () => {
    const body = draft.trim();
    if ((!body && pending.length === 0) || sending || uploading || conversation?.isOneWay || !validId) return;
    fb.press();
    const atts = pending;
    setSending(true); setSendError(null); setDraft(""); setPending([]);
    const temp = { id: `tmp_${Date.now()}`, senderType: "guard", senderUserId: myUserId, body, attachments: atts, createdAt: new Date().toISOString(), _pending: true };
    setMessages((m) => [...m, temp]);
    scrollDown();
    try {
      await messageService.send(conversationId, body, newId(), atts);
      await load();
    } catch (e: any) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setDraft(body); setPending(atts); fb.error();
      setSendError(e?.message || t("messages.sendFailed", "No se pudo enviar. Reintenta."));
    } finally { setSending(false); }
  };

  const sendEditedImage = async (file: File) => {
    if (!validId) return;
    setUploading(true); setSendError(null);
    try {
      const att = await messageService.uploadAttachment(file);
      await messageService.send(conversationId, "", newId(), [att]);
      await load();
    } catch (e: any) { fb.error(); setSendError(e?.message || t("messages.sendFailed", "No se pudo enviar. Reintenta.")); }
    finally { setUploading(false); }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !files.length || !validId) return;
    setUploading(true); setSendError(null);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        if (!/^image\/|^video\/|^audio\//.test(file.type)) { setSendError(t("messages.onlyMedia", "Solo imágenes, videos o audio.")); continue; }
        if (file.size > 100 * 1024 * 1024) { setSendError(t("messages.tooBig", "Máximo 100 MB.")); continue; }
        const att = await messageService.uploadAttachment(file);
        setPending((p) => [...p, att]);
      }
    } catch (e: any) {
      setSendError(e?.message || t("messages.uploadFailed", "No se pudo subir el archivo."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  };

  const startRec = async () => {
    if (!validId || recording || conversation?.isOneWay) return;
    setSendError(null);
    try {
      await ensureMicPermission();
      await startRecording();
      recStartedAt.current = Date.now();
      setRecElapsed(0); setRecording(true); fb.tap();
      recTick.current = setInterval(() => setRecElapsed(Date.now() - recStartedAt.current), 200);
    } catch (e: any) {
      setSendError(e?.message || t("messages.micFailed", "No se pudo acceder al micrófono."));
    }
  };
  const stopRecAndSend = async () => {
    if (!recording) return;
    if (recTick.current) { clearInterval(recTick.current); recTick.current = null; }
    setRecording(false);
    try {
      const rec = await stopRecording();
      setUploading(true);
      const att = await messageService.uploadAttachment(rec.file);
      fb.press();
      await messageService.send(conversationId, "", newId(), [att]);
      await load();
    } catch (e: any) {
      fb.error();
      setSendError(e?.message || t("messages.sendFailed", "No se pudo enviar. Reintenta."));
    } finally { setUploading(false); }
  };
  const cancelRec = () => {
    if (recTick.current) { clearInterval(recTick.current); recTick.current = null; }
    cancelRecording(); setRecording(false); setRecElapsed(0); fb.tap();
  };
  useEffect(() => () => { if (recTick.current) clearInterval(recTick.current); cancelRecording(); }, []);

  // A guard→office thread resolves the guard's OWN name as subject/counterpart
  // — label it as the office instead of heading the chat with yourself.
  const selfName = String(user?.fullName || user?.firstName || "").trim().toLowerCase();
  const rawTitle = conversation?.subject || conversation?.counterpartName || "";
  const title =
    rawTitle && selfName && rawTitle.trim().toLowerCase() === selfName
      ? t("messages.toOffice", "Para la oficina")
      : rawTitle || t("messages.title", "Mensajes");
  const membersLabel = conversation?.memberCount
    ? `${conversation.memberCount} ${t("messages.members", "miembros")}`
    : conversation?.isGroup ? t("messages.group", "Grupo") : "";

  const canRecord = isRecordingSupported() && !draft.trim() && pending.length === 0;
  let lastDay = "";

  return (
    <Screen fill title={title} subtitle={membersLabel}>
      <div className={styles.wrap}>
        <div ref={scrollRef} className={styles.list}>
          {messages.length > 0 && (
            <div className="mx-auto my-1 flex max-w-[19rem] items-center gap-1.5 rounded-lg bg-surface-2/80 px-3 py-1.5 text-center text-[11.5px] text-muted">
              <Lock size={12} className="shrink-0" />
              <span>{t("messages.e2e", "Los mensajes están cifrados de extremo a extremo.")}</span>
            </div>
          )}
          {loading && messages.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted" /></div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Users size={28} className="text-faint" />
              <p className="text-sm text-muted">{loadError || t("messages.threadEmpty", "Aún no hay mensajes en esta conversación.")}</p>
              {loadError && <button onClick={() => { fb.tap(); load(true); }} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink active:bg-surface-2">{t("common.retry", "Reintentar")}</button>}
            </div>
          ) : (
            messages.map((m) => {
              const mine = m._pending || (m.senderUserId ? String(m.senderUserId) === myUserId : m.senderType === "guard");
              const dl = dayLabel(m.createdAt, t);
              const showDay = dl && dl !== lastDay;
              if (showDay) lastDay = dl;
              const senderKey = String(m.senderUserId || m.senderName || "?");
              return (
                <div key={m.id}>
                  {showDay && <div className="flex justify-center"><span className={styles.dateChip}>{dl}</span></div>}
                  {mine ? (
                    <div className={styles.rowOut}>
                      <div className={`${styles.bubbleOut} ${m._pending ? "opacity-70" : ""}`}>
                        <Attachments m={m} onImageTap={setViewerSrc} />
                        {m.body && <p className={styles.text}>{m.body}</p>}
                        <div className={`${styles.meta} ${styles.metaOut}`}>
                          <span>{fmt(m.createdAt)}</span>
                          {m._pending ? <Clock size={13} /> : (m.readAt || m.seenAt) ? <CheckCheck size={14} style={{ color: "#5ff0d0" }} /> : <Check size={13} />}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.rowIn}>
                      <MsgAvatar m={m} />
                      <div className={styles.bubbleIn}>
                        {/* Always show WHO sent it (name + stable color) so the guard knows. */}
                        {m.senderName && <p className={styles.sender} style={{ color: colorFor(senderKey) }}>{m.senderName}</p>}
                        <Attachments m={m} onImageTap={setViewerSrc} />
                        {m.body && <p className={styles.text}>{m.body}</p>}
                        <div className={`${styles.meta} ${styles.metaIn}`}><span>{fmt(m.createdAt)}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {conversation?.isOneWay ? (
          <p className="shrink-0 border-t border-line bg-surface px-4 pt-3 text-center text-xs text-muted" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
            {t("messages.readOnly", "Esta conversación es solo de lectura.")}
          </p>
        ) : (
          <div style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}>
            {sendError && <p className="px-4 pt-1 text-[11px] text-critical">{sendError}</p>}
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-2">
                {pending.map((a, i) => (
                  <div key={(a as any).id || a.url || i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-line-2">
                    {a.type === "video" ? <div className="grid h-full w-full place-items-center bg-surface-2 text-muted"><Play size={18} /></div>
                      : a.type === "audio" ? <div className="grid h-full w-full place-items-center bg-gold/15 text-gold"><Mic size={18} /></div>
                      : <AttachmentImage src={a.url} alt="" className="h-full w-full object-cover" />}
                    <button onClick={() => { fb.tap(); setPending((p) => p.filter((_, j) => j !== i)); }} className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl bg-background/80 text-ink"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.composer}>
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
              {recording ? (
                <div className={styles.recBar}>
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-critical" />
                  <span className="font-mono text-ink">{String(Math.floor(recElapsed / 60000)).padStart(2, "0")}:{String(Math.floor((recElapsed % 60000) / 1000)).padStart(2, "0")}</span>
                  <span className="text-muted">{t("messages.recording", "Grabando…")}</span>
                  <button onClick={cancelRec} aria-label={t("app.cancel", "Cancelar")} className="ml-auto text-muted active:text-critical"><X size={18} /></button>
                </div>
              ) : (
                <div className={styles.inputWrap}>
                  <Smile size={22} className="shrink-0 text-muted" />
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("messages.compose", "Escribe un mensaje…")} rows={1} />
                  <button onClick={() => { fb.tap(); fileRef.current?.click(); }} disabled={uploading} aria-label={t("messages.attach", "Adjuntar")} className={styles.iconBtn}>
                    {uploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                  </button>
                  <button onClick={() => { fb.tap(); camRef.current?.click(); }} disabled={uploading} aria-label={t("visitor.camera", "Cámara")} className={styles.iconBtn}><Camera size={20} /></button>
                </div>
              )}
              {canRecord ? (
                <button onClick={recording ? stopRecAndSend : startRec} disabled={uploading} aria-label={recording ? t("messages.stopSend", "Enviar") : t("messages.record", "Grabar")} className={styles.micBtn} style={recording ? { background: "var(--critical)", color: "#fff" } : undefined}>
                  {recording ? <Send size={20} /> : <Mic size={22} />}
                </button>
              ) : (
                <button onClick={send} disabled={sending || uploading || recording || (!draft.trim() && pending.length === 0)} aria-label={t("messages.send", "Enviar")} className={styles.micBtn}>
                  {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ImageViewer src={viewerSrc} open={!!viewerSrc} onClose={() => setViewerSrc(null)} onSendEdited={sendEditedImage} />
    </Screen>
  );
}

function MsgAvatar({ m }: { m: any }) {
  const url = useFileUrl(m.senderAvatar || m.avatar || null);
  return (
    <span className={styles.msgAvatar}>
      {url ? <img src={url} alt="" /> : <span className="text-[11px] font-bold">{String(m.senderName || "?").slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

function Attachments({ m, onImageTap }: { m: any; onImageTap?: (url: string) => void }) {
  const { t } = useTranslation();
  if (!Array.isArray(m.attachments) || m.attachments.length === 0) return null;
  return (
    <div className="mb-1 grid gap-1.5">
      {m.attachments.map((a: any, i: number) => (
        a.type === "video" ? <AttachmentVideo key={a.id || a.url || i} src={a.url} className="max-h-64 w-full rounded-lg bg-surface-2" />
          : a.type === "audio" ? <AttachmentAudio key={a.id || a.url || i} src={a.url} />
          : <button key={a.id || a.url || i} type="button" onClick={() => { fb.tap(); onImageTap?.(a.url); }} className="block">
              <AttachmentImage src={a.url} alt={a.name || t("messages.imageAlt", "imagen")} className="max-h-64 w-full rounded-lg object-cover" />
            </button>
      ))}
    </div>
  );
}
