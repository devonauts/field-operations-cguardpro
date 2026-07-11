import { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Radio as RadioIcon, Mic, Square, X } from "lucide-react";
import { radioCheckService } from "@/lib/services";
import { startRecording, stopRecording, cancelRecording, isRecordingSupported } from "@/lib/audioRecorder";
import { onPush } from "@/lib/pushEvents";
import { useRadio } from "@/context/RadioContext";
import fb from "@/lib/feedback";

const newId = () =>
  globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`;

type Mode = "idle" | "recording" | "uploading";

/**
 * Global "pase de novedades" action. The moment a roll call reaches THIS guard —
 * from ANY screen — it takes over the FULL SCREEN with a live countdown so the
 * pase is impossible to miss, and lets the guard complete the report right there
 * (voice clip recorded inline, or one-tap "Sin novedad") without navigating away.
 *
 * Driven by BOTH the FCM push (radio.check_request) for an instant wake and an 8s
 * poll of /guard/me/radio-check/pending as a fallback when push delivery fails.
 *
 * RECOVERABILITY: an entry is only marked "handled" once the guard actually
 * submits a reply (or after the window expires and they close it). Navigating
 * around the app NEVER consumes the check — while the server still reports it
 * pending, the poll re-surfaces this takeover. (Previously "Reportar por voz"
 * pushed to /guard/radio and pre-marked the entry handled, so a guard who got
 * distracted lost the check entirely.)
 *
 * Hidden only on the Radio screen itself (which has its own inline flow).
 */
export default function RadioCheckAlert() {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const { resume } = useRadio();

  const [entry, setEntry] = useState<any>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [mode, setMode] = useState<Mode>("idle");
  const [recStartMs, setRecStartMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Entry ids the guard has actually completed (replied) or closed after expiry —
  // never re-popped. NOT added on navigation.
  const handledRef = useRef<Set<string>>(new Set());
  const buzzedRef = useRef<string | null>(null);

  const onRadioScreen = location.pathname.startsWith("/guard/radio");

  const refresh = useCallback(async () => {
    try {
      const res: any = await radioCheckService.pending();
      const e = res?.entry || null;
      if (!e || handledRef.current.has(e.id)) {
        setEntry((prev: any) => (prev && (!e || prev.id !== e.id) ? null : prev));
        return;
      }
      setEntry(e);
    } catch {
      /* keep prior state */
    }
  }, []);

  // Poll fallback + instant push wake. Tight cadence (8s) — the response window is
  // only ~60s, so a missed push must still surface fast.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    const off = onPush((d: any) => {
      if (d?.type === "radio.check_request") refresh();
    });
    return () => {
      clearInterval(id);
      off();
    };
  }, [refresh]);

  // A new pase replaces any prior state — and tears down a recording in flight so
  // the mic never stays hot across entries.
  useEffect(() => {
    if (!entry?.id) return;
    if (buzzedRef.current === entry.id) return;
    buzzedRef.current = entry.id;
    cancelRecording();
    setMode("idle");
    setError(null);
    try { fb.warning(); } catch { /* ignore */ }
  }, [entry?.id]);

  // Stop the mic if this component unmounts mid-recording.
  useEffect(() => () => cancelRecording(), []);

  // 1-second tick drives the countdown + the recording timer while up.
  useEffect(() => {
    if (!entry || onRadioScreen) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry, onRadioScreen]);

  const remainingSec = entry?.timeoutAt
    ? Math.max(0, Math.ceil((new Date(entry.timeoutAt).getTime() - nowMs) / 1000))
    : null;
  const expired = remainingSec != null && remainingSec <= 0;
  const fmtClock = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const countdown = remainingSec != null ? fmtClock(remainingSec) : null;
  const recSec = mode === "recording" ? Math.floor((nowMs - recStartMs) / 1000) : 0;

  const close = useCallback(() => {
    if (entry?.id) handledRef.current.add(entry.id);
    cancelRecording();
    setMode("idle");
    setEntry(null);
  }, [entry?.id]);

  const replyAllClear = useCallback(async () => {
    if (!entry || mode !== "idle") return;
    setMode("uploading");
    try {
      await radioCheckService.reply(entry.id, {
        cannedText: t("radio.allClear", "Sin novedad"),
        clientMsgId: newId(),
      });
      handledRef.current.add(entry.id);
      fb.success();
      setEntry(null);
      setMode("idle");
    } catch {
      setError(t("radio.replyError", "No se pudo enviar. Intenta de nuevo."));
      fb.warning();
      setMode("idle");
    }
  }, [entry, mode, t]);

  const startVoice = useCallback(async () => {
    if (!isRecordingSupported()) {
      setError(t("radio.micUnavailable", "La grabación no está disponible en este dispositivo."));
      return;
    }
    setError(null);
    try {
      try { resume(); } catch { /* ignore */ }
      await startRecording();
      setRecStartMs(Date.now());
      setMode("recording");
      fb.press();
    } catch {
      setError(t("radio.micDenied", "No se pudo acceder al micrófono. Revisa los permisos."));
      fb.warning();
    }
  }, [resume, t]);

  const sendVoice = useCallback(async () => {
    if (!entry || mode !== "recording") return;
    setMode("uploading");
    try {
      const rec = await stopRecording();
      const audioUrl = await radioCheckService.uploadAudio(rec.file);
      await radioCheckService.reply(entry.id, { audioUrl, clientMsgId: newId() });
      handledRef.current.add(entry.id);
      fb.success();
      setEntry(null);
      setMode("idle");
    } catch {
      setError(t("radio.replyError", "No se pudo enviar. Intenta de nuevo."));
      fb.warning();
      setMode("idle");
    }
  }, [entry, mode, t]);

  const cancelVoice = useCallback(() => {
    cancelRecording();
    setMode("idle");
  }, []);

  if (!entry || onRadioScreen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="safe-top safe-bottom fixed inset-0 z-[9999] flex flex-col bg-surface text-ink"
      style={{ animation: "rcaFade .18s ease-out" }}
    >
      <style>{`@keyframes rcaFade{from{opacity:0}to{opacity:1}}@keyframes rcaPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}`}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/30" />
            <RadioIcon size={20} className="relative" />
          </span>
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide text-gold">
              {t("radio.checkRequest", "Pase de novedades")}
            </p>
            {entry.stationName && <p className="text-xs text-muted">{entry.stationName}</p>}
          </div>
        </div>
        {countdown != null && (
          <span
            className={`rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
              expired ? "bg-critical/15 text-critical" : "bg-gold/15 text-gold"
            }`}
          >
            {expired ? t("radio.timeUp", "Tiempo agotado") : countdown}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {mode === "recording" ? (
          <>
            <span
              className="mb-5 flex h-28 w-28 items-center justify-center rounded-full bg-critical/15 text-critical"
              style={{ animation: "rcaPulse 1.2s ease-in-out infinite" }}
            >
              <Mic size={44} />
            </span>
            <p className="font-mono text-3xl font-bold tabular-nums text-ink">{fmtClock(recSec)}</p>
            <p className="mt-2 text-sm text-muted">{t("radio.recording", "Grabando tu reporte…")}</p>
          </>
        ) : mode === "uploading" ? (
          <>
            <Loader2 size={48} className="mb-4 animate-spin text-gold" />
            <p className="text-sm text-muted">{t("radio.sending", "Enviando…")}</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-ink">
              {entry.promptText || t("radio.defaultPrompt", "¿Alguna novedad o incidente en el puesto?")}
            </p>
            <p className="mt-3 max-w-xs text-sm text-muted">
              {t("radio.actionHint", "Responde el pase de novedades para no perder tu marca.")}
            </p>
          </>
        )}

        {error && <p className="mt-5 text-sm text-critical">{error}</p>}
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t border-line px-5 pb-2 pt-3">
        {mode === "recording" ? (
          <>
            <button
              onClick={sendVoice}
              className="btn-xl flex w-full items-center justify-center gap-2 bg-gold-strong text-on-accent active:bg-gold-hover"
            >
              <Square size={18} />
              {t("radio.stopAndSend", "Detener y enviar")}
            </button>
            <button
              onClick={cancelVoice}
              className="btn-xl flex w-full items-center justify-center gap-2 border border-line-2 text-muted active:bg-surface-2"
            >
              {t("common.cancel", "Cancelar")}
            </button>
          </>
        ) : expired ? (
          <button
            onClick={close}
            className="btn-xl flex w-full items-center justify-center gap-2 border border-line-2 text-ink active:bg-surface-2"
          >
            <X size={18} />
            {t("common.close", "Cerrar")}
          </button>
        ) : (
          <>
            <button
              onClick={replyAllClear}
              disabled={mode !== "idle"}
              className="btn-xl flex w-full items-center justify-center gap-2 bg-online/15 text-online active:bg-online/25 disabled:opacity-50"
            >
              <CheckCircle2 size={20} />
              {t("radio.allClear", "Sin novedad")}
            </button>
            <button
              onClick={startVoice}
              disabled={mode !== "idle"}
              className="btn-xl flex w-full items-center justify-center gap-2 bg-gold/15 text-gold active:bg-gold/25 disabled:opacity-50"
            >
              <Mic size={20} />
              {t("radio.reportByVoice", "Reportar por voz")}
            </button>
            <button
              onClick={() => { try { resume(); } catch { /* ignore */ } history.push("/guard/radio"); }}
              className="flex w-full items-center justify-center gap-1.5 py-1.5 text-xs text-muted active:text-ink"
            >
              <RadioIcon size={14} />
              {t("radio.openRadio", "Abrir pantalla de radio")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
