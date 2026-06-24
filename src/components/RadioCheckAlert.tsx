import { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Radio as RadioIcon, X } from "lucide-react";
import { radioCheckService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import { useRadio } from "@/context/RadioContext";
import fb from "@/lib/feedback";

const newId = () =>
  globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`;

/**
 * Global "pase de novedades" alert. Surfaces a full-screen prompt with a live
 * countdown the moment a roll call reaches THIS guard — from ANY screen — so the
 * pase is impossible to miss. It is driven by BOTH channels:
 *   1. the FCM push (radio.check_request) for an instant wake, and
 *   2. a short poll of /guard/me/radio-check/pending as a fallback, so the popup
 *      still appears within seconds even when push delivery fails (the exact
 *      symptom we're fixing on iOS).
 * Mounted inside <RadioProvider> so it can resume the live channel audio when the
 * guard chooses to report by voice. Hidden on the Radio screen itself (which has
 * its own inline card) to avoid a double prompt.
 */
export default function RadioCheckAlert() {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const { resume } = useRadio();

  const [entry, setEntry] = useState<any>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  // Entry ids the guard already dealt with (replied/dismissed) — never re-popped.
  const handledRef = useRef<Set<string>>(new Set());
  const buzzedRef = useRef<string | null>(null);

  const onRadioScreen = location.pathname.startsWith("/guard/radio");

  const refresh = useCallback(async () => {
    try {
      const res: any = await radioCheckService.pending();
      const e = res?.entry || null;
      // Ignore an entry we've already handled, or one whose window already closed.
      if (!e || handledRef.current.has(e.id)) {
        setEntry((prev: any) => (prev && (!e || prev.id !== e.id) ? null : prev));
        return;
      }
      setEntry(e);
    } catch {
      /* keep prior state */
    }
  }, []);

  // Poll fallback + instant push wake. Poll cadence is tight (8s) because the
  // response window is only ~60s — a missed push must still surface fast.
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

  // Buzz + chirp once per new pase so the guard physically feels it arrive.
  useEffect(() => {
    if (!entry?.id || onRadioScreen) return;
    if (buzzedRef.current === entry.id) return;
    buzzedRef.current = entry.id;
    try { fb.warning(); } catch { /* ignore */ }
  }, [entry?.id, onRadioScreen]);

  // 1-second tick drives the countdown while the popup is up.
  useEffect(() => {
    if (!entry?.timeoutAt || onRadioScreen) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry?.timeoutAt, onRadioScreen]);

  const remainingSec = entry?.timeoutAt
    ? Math.max(0, Math.ceil((new Date(entry.timeoutAt).getTime() - nowMs) / 1000))
    : null;
  const countdown =
    remainingSec != null
      ? `${String(Math.floor(remainingSec / 60)).padStart(2, "0")}:${String(remainingSec % 60).padStart(2, "0")}`
      : null;

  const dismiss = useCallback(() => {
    if (entry?.id) handledRef.current.add(entry.id);
    setEntry(null);
  }, [entry?.id]);

  const replyAllClear = useCallback(async () => {
    if (!entry || submitting) return;
    setSubmitting(true);
    try {
      await radioCheckService.reply(entry.id, {
        cannedText: t("radio.allClear", "Sin novedad"),
        clientMsgId: newId(),
      });
      handledRef.current.add(entry.id);
      fb.success();
      setEntry(null);
    } catch {
      fb.warning();
    } finally {
      setSubmitting(false);
    }
  }, [entry, submitting, t]);

  const reportByVoice = useCallback(() => {
    if (entry?.id) handledRef.current.add(entry.id);
    fb.press();
    try { resume(); } catch { /* ignore */ }
    setEntry(null);
    history.push("/guard/radio");
  }, [entry?.id, history, resume]);

  if (!entry || onRadioScreen) return null;

  const expired = (remainingSec ?? 1) <= 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center"
      style={{ animation: "rcaFade .18s ease-out" }}
    >
      <style>{`@keyframes rcaFade{from{opacity:0}to{opacity:1}}@keyframes rcaRise{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div
        className="card-elev w-full max-w-md space-y-4 border border-gold/40 bg-surface p-5"
        style={{ animation: "rcaRise .22s cubic-bezier(.2,.8,.2,1)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/30" />
              <RadioIcon size={20} className="relative" />
            </span>
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide text-gold">
                {t("radio.checkRequest", "Pase de novedades")}
              </p>
              {entry.stationName && (
                <p className="text-xs text-muted">{entry.stationName}</p>
              )}
            </div>
          </div>
          {countdown != null && (
            <span
              className={`rounded-lg px-2.5 py-1 font-mono text-[15px] font-bold tabular-nums ${
                expired ? "bg-critical/15 text-critical" : "bg-gold/15 text-gold"
              }`}
            >
              {expired ? t("radio.timeUp", "Tiempo agotado") : countdown}
            </span>
          )}
        </div>

        <p className="text-[15px] text-ink">
          {entry.promptText || t("radio.defaultPrompt", "¿Alguna novedad o incidente en el puesto?")}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={replyAllClear}
            disabled={submitting}
            className="btn-xl flex items-center justify-center gap-2 bg-online/15 text-online active:bg-online/25 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            {t("radio.allClear", "Sin novedad")}
          </button>
          <button
            onClick={reportByVoice}
            disabled={submitting}
            className="btn-xl flex items-center justify-center gap-2 bg-gold/15 text-gold active:bg-gold/25 disabled:opacity-50"
          >
            <RadioIcon size={18} />
            {t("radio.reportByVoice", "Reportar por voz")}
          </button>
        </div>

        <button
          onClick={dismiss}
          className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-muted active:text-ink"
        >
          <X size={14} />
          {t("common.dismiss", "Descartar")}
        </button>
      </div>
    </div>
  );
}
