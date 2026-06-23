import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIonToast } from "@ionic/react";
import { CheckCircle2, Loader2, Mic } from "lucide-react";
import { Screen } from "@/components/Screen";
import { radioCheckService } from "@/lib/services";
import { onPush } from "@/lib/pushEvents";
import RadioLiveChannel from "./RadioLiveChannel";
import fb from "@/lib/feedback";

const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`);

/**
 * Radio = a single general channel (Canal general). Opening it joins the live
 * open channel immediately (RadioLiveChannel auto-connects). A "pase de
 * novedades" from central appears as a prompt ON this same channel — guards
 * answer by holding the PTT and speaking, or tap a quick acknowledgement. There
 * is no second channel/screen, so everyone runs on one frequency.
 */
export default function GuardRadio() {
  const { t } = useTranslation();
  const [present] = useIonToast();
  const [entry, setEntry] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const lastSpokenEntry = useRef<string | null>(null);

  // 1-second tick to drive the report countdown while a pase is active.
  useEffect(() => {
    if (!entry?.timeoutAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry?.timeoutAt]);

  const remainingSec = entry?.timeoutAt
    ? Math.max(0, Math.ceil((new Date(entry.timeoutAt).getTime() - nowMs) / 1000))
    : null;
  const countdown = remainingSec != null
    ? `${String(Math.floor(remainingSec / 60)).padStart(2, "0")}:${String(remainingSec % 60).padStart(2, "0")}`
    : null;

  const load = useCallback(async () => {
    try {
      const res: any = await radioCheckService.pending();
      setEntry(res?.entry || null);
    } catch {
      /* keep prior */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Play the AI dispatcher's spoken call ("Puesto X, adelante con su pase…")
  // once per entry, so the guard HEARS central instead of just reading text.
  useEffect(() => {
    const url = entry?.promptAudioUrl;
    const id = entry?.id;
    if (!url || !id || lastSpokenEntry.current === id) return;
    lastSpokenEntry.current = id;
    try { const a = new Audio(url); a.play().catch(() => {}); } catch { /* ignore */ }
  }, [entry?.id, entry?.promptAudioUrl]);

  // Wake on push + poll while open. A new pase de novedades buzzes the device.
  useEffect(() => {
    const off = onPush((d: any) => {
      if (d?.type === "radio.check_request") { fb.warning(); load(); }
    });
    const id = setInterval(load, 12000);
    return () => { off(); clearInterval(id); };
  }, [load]);

  const reply = async (payload: any, msg: string) => {
    if (!entry || submitting) return;
    setSubmitting(true);
    try {
      await radioCheckService.reply(entry.id, { ...payload, clientMsgId: newId() });
      setEntry(null);
      fb.success();
      present({ message: msg, duration: 1800, position: "top" });
      setTimeout(load, 800);
    } catch {
      present({ message: t("radio.sendFailed", "No se pudo enviar. Reintenta."), duration: 2400, position: "top" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen back title={t("nav.radio", "Radio")} subtitle={t("radio.generalChannel", "Canal general")}>
      <div className="space-y-4">
        {/* Active pase de novedades — answered ON the open channel itself. */}
        {entry && (
          <div className="card-elev space-y-3 border border-gold/40 bg-gold/[0.06] p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-gold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
                </span>
                <p className="text-[13px] font-bold uppercase tracking-wide">
                  {t("radio.checkRequest", "Pase de novedades")}
                </p>
              </div>
              {countdown && (
                <span
                  className={`rounded-lg px-2.5 py-1 font-mono text-[15px] font-bold tabular-nums ${
                    (remainingSec ?? 0) > 0 ? "bg-gold/15 text-gold" : "bg-critical/15 text-critical"
                  }`}
                >
                  {(remainingSec ?? 0) > 0 ? countdown : t("radio.timeUp", "Tiempo agotado")}
                </span>
              )}
            </div>
            <p className="text-[15px] text-ink">
              {entry.promptText || t("radio.defaultPrompt", "¿Alguna novedad o incidente en el puesto?")}
            </p>
            <p className="text-xs text-muted">
              {t("radio.respondOnChannel", "Mantén el botón del canal para reportar por voz, o marca aquí:")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  fb.press();
                  reply({ cannedText: t("radio.allClear", "Sin novedad") }, t("radio.sent", "Reporte enviado"));
                }}
                disabled={submitting}
                className="btn-xl flex items-center justify-center gap-2 bg-online/15 text-online active:bg-online/25 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                {t("radio.allClear", "Sin novedad")}
              </button>
              <button
                onClick={() => {
                  fb.press();
                  reply({ text: t("radio.reportedByVoice", "Novedad reportada por voz en el canal.") }, t("radio.sent", "Reporte enviado"));
                }}
                disabled={submitting}
                className="btn-xl flex items-center justify-center gap-2 bg-gold/15 text-gold active:bg-gold/25 disabled:opacity-50"
              >
                <Mic size={18} />
                {t("radio.haveNews", "Con novedad")}
              </button>
            </div>
          </div>
        )}

        {/* The single general channel — opens immediately. */}
        <RadioLiveChannel />
      </div>
    </Screen>
  );
}
