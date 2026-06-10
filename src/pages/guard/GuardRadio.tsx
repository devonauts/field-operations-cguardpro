import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import { Radio, Mic, Square, Send, Bell, AlertTriangle, CheckCircle2, Loader2, Wifi } from "lucide-react";
import { Screen } from "@/components/Screen";
import { guardService, radioCheckService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { startRecording, stopRecording, cancelRecording, isRecordingSupported } from "@/lib/audioRecorder";
import { ensureMicPermission } from "@/lib/micPermission";
import RadioLiveChannel from "./RadioLiveChannel";

const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`);

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function GuardRadio() {
  const { t } = useTranslation();
  const history = useHistory();
  const [present] = useIonToast();

  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [channelName, setChannelName] = useState<string>(t("radio.generalChannel", "Canal general"));
  const [mode, setMode] = useState<"reportes" | "canal">("reportes");
  const timerRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const res: any = await radioCheckService.pending();
      setEntry(res?.entry || null);
    } catch { /* keep prior */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    guardService.dashboard().then((d: any) => {
      const st = d?.stations?.[0];
      if (st?.stationName || st?.name) setChannelName(st.stationName || st.name);
    }).catch(() => {});
  }, []);

  // Wake on push + poll while the screen is open. DB is the source of truth.
  useEffect(() => {
    const off = onPush((d: any) => { if (d?.type === "radio.check_request") load(); });
    const id = setInterval(load, 12000);
    return () => { off(); clearInterval(id); };
  }, [load]);

  // Recording timer.
  useEffect(() => {
    if (recording) {
      const t0 = Date.now();
      timerRef.current = setInterval(() => setElapsed(Date.now() - t0), 200);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [recording]);

  const afterReply = (msg: string) => {
    setEntry(null);
    setText("");
    setShowText(false);
    present({ message: msg, duration: 1800, position: "top" });
    setTimeout(load, 800);
  };

  const beginRecord = async () => {
    if (!entry || submitting) return;
    if (!isRecordingSupported()) {
      present({ message: t("radio.noMic", "Grabación no disponible. Usa \"Sin novedad\" o texto."), duration: 2400, position: "top" });
      setShowText(true);
      return;
    }
    if (!(await ensureMicPermission())) {
      present({ message: t("radio.micPerm", "Activa el permiso de micrófono en Perfil → Permisos."), duration: 2600, position: "top" });
      setShowText(true);
      return;
    }
    try { await startRecording(); setRecording(true); }
    catch { present({ message: t("radio.micDenied", "No se pudo acceder al micrófono."), duration: 2400, position: "top" }); }
  };

  const finishRecord = async () => {
    if (!recording) return;
    setRecording(false);
    setSubmitting(true);
    try {
      const { file } = await stopRecording();
      const audioUrl = await radioCheckService.uploadAudio(file);
      await radioCheckService.reply(entry.id, { audioUrl, clientMsgId: newId() });
      afterReply(t("radio.sent", "Reporte enviado"));
    } catch {
      present({ message: t("radio.sendFailed", "No se pudo enviar. Reintenta."), duration: 2400, position: "top" });
    } finally { setSubmitting(false); }
  };

  const abortRecord = () => { cancelRecording(); setRecording(false); };

  const sendCanned = async () => {
    if (!entry || submitting) return;
    setSubmitting(true);
    try {
      await radioCheckService.reply(entry.id, { cannedText: t("radio.allClear", "Sin novedad"), clientMsgId: newId() });
      afterReply(t("radio.sent", "Reporte enviado"));
    } catch {
      present({ message: t("radio.sendFailed", "No se pudo enviar. Reintenta."), duration: 2400, position: "top" });
    } finally { setSubmitting(false); }
  };

  const sendText = async () => {
    const body = text.trim();
    if (!entry || submitting || !body) return;
    setSubmitting(true);
    try {
      await radioCheckService.reply(entry.id, { text: body, clientMsgId: newId() });
      afterReply(t("radio.sent", "Reporte enviado"));
    } catch {
      present({ message: t("radio.sendFailed", "No se pudo enviar. Reintenta."), duration: 2400, position: "top" });
    } finally { setSubmitting(false); }
  };

  return (
    <Screen back title={t("nav.radio", "Radio")} subtitle={channelName}>
      <div className="space-y-5">
        {/* Mode switch: Reportes (AI roll call) | Canal abierto (live PTT) */}
        <div className="flex rounded-xl bg-surface-2 p-1">
          <button onClick={() => setMode("reportes")} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === "reportes" ? "bg-gold text-navy" : "text-muted"}`}>{t("radio.reports", "Reportes")}</button>
          <button onClick={() => setMode("canal")} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === "canal" ? "bg-gold text-navy" : "text-muted"}`}>{t("radio.liveChannel", "Canal abierto")}</button>
        </div>

        {mode === "canal" ? <RadioLiveChannel /> : (<>
        {/* Channel header */}
        <div className="card-elev flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
            <Radio size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-eyebrow">{t("radio.channel", "Canal")}</p>
            <p className="truncate text-[15px] font-semibold text-ink">{channelName}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-online/40 bg-online/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-online">
            <Wifi size={12} /> {t("radio.online", "En línea")}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted" /></div>
        ) : entry ? (
          /* ---------- Active radio-check request ---------- */
          <div className="card-elev space-y-4 border border-gold/30 p-5">
            <div className="flex items-center gap-2 text-gold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
              </span>
              <p className="text-[13px] font-bold uppercase tracking-wide">{t("radio.checkRequest", "Pase de novedades")}</p>
            </div>
            <p className="text-[15px] text-ink">{entry.promptText || t("radio.defaultPrompt", "¿Alguna novedad o incidente en el puesto?")}</p>

            {/* Record / stop */}
            <div className="flex flex-col items-center py-2">
              <button
                onClick={recording ? finishRecord : beginRecord}
                disabled={submitting}
                className="relative grid h-32 w-32 place-items-center rounded-full disabled:opacity-60"
                aria-label={recording ? t("radio.stop", "Detener") : t("radio.record", "Grabar")}
              >
                <span className={`absolute inset-0 rounded-full ${recording ? "bg-critical/20 animate-ping" : "bg-gold/15"}`} />
                <span className={`relative grid h-20 w-20 place-items-center rounded-full text-navy shadow-[0_8px_40px_-8px_rgba(212,160,23,0.7)] ${recording ? "bg-critical text-white" : "bg-gold"}`}>
                  {submitting ? <Loader2 size={32} className="animate-spin" /> : recording ? <Square size={30} /> : <Mic size={34} strokeWidth={2.2} />}
                </span>
              </button>
              <p className="mt-3 text-sm font-semibold text-ink">
                {recording ? `${t("radio.recording", "Grabando")} · ${mmss(elapsed)}` : submitting ? t("radio.sending", "Enviando…") : t("radio.tapToRecord", "Toca para grabar tu reporte")}
              </p>
              {recording && (
                <button onClick={abortRecord} className="mt-1 text-xs text-muted underline">{t("common.cancel", "Cancelar")}</button>
              )}
            </div>

            {/* Quick replies */}
            {!recording && (
              <div className="space-y-2">
                <button
                  onClick={sendCanned}
                  disabled={submitting}
                  className="btn-xl flex w-full items-center justify-center gap-2 bg-online/15 text-online active:bg-online/25 disabled:opacity-50"
                >
                  <CheckCircle2 size={18} /> {t("radio.allClear", "Sin novedad")}
                </button>

                {showText ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={t("radio.typeReport", "Escribe tu novedad…")}
                      rows={2}
                      className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line-2 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
                    />
                    <button onClick={sendText} disabled={submitting || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50">
                      <Send size={18} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowText(true)} className="w-full rounded-xl border border-line py-2.5 text-sm text-muted active:bg-white/10">
                    {t("radio.writeInstead", "Escribir en su lugar")}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ---------- Idle ---------- */
          <>
            <div className="card-elev flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-muted"><Radio size={28} /></span>
              <p className="text-[15px] font-semibold text-ink">{t("radio.idleTitle", "Sin pases pendientes")}</p>
              <p className="text-xs text-muted">{t("radio.idleHint", "Cuando la central inicie un pase de novedades, aparecerá aquí para que respondas.")}</p>
            </div>
            <div className="card-elev divide-y divide-line overflow-hidden">
              <button onClick={() => history.push("/guard/notices")} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.04]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10 text-gold"><Bell size={18} /></span>
                <span className="flex-1"><span className="block text-[15px] font-semibold text-ink">{t("radio.notices", "Avisos del puesto")}</span><span className="block text-xs text-muted">{t("radio.noticesSub", "Memos y comunicados")}</span></span>
              </button>
              <button onClick={() => history.push("/guard/incidents")} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.04]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-critical/10 text-critical"><AlertTriangle size={18} /></span>
                <span className="flex-1"><span className="block text-[15px] font-semibold text-ink">{t("radio.report", "Reportar incidente")}</span><span className="block text-xs text-muted">{t("radio.reportSub", "Novedad o emergencia")}</span></span>
              </button>
            </div>
          </>
        )}
        </>)}
      </div>
    </Screen>
  );
}
