import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import { X, FileText, Send, Loader2, Mic, Square, Plus, Trash2, ClipboardList, CheckCircle2 } from "lucide-react";
import { useSpeechToText } from "@/lib/useSpeechToText";
import { ErrorState } from "@/components/ui";

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };

export type PassdownInstruction = { text: string; priority: "alta" | "media" | "baja" };
export type PassdownPayload = { summary: string; instructions: PassdownInstruction[] };

/**
 * Mandatory PASE DE TURNO (shift passdown) shown when a guard clocks out. The guard
 * leaves the novedades (summary → clock-out `observations`) plus discrete INSTRUCTIONS
 * for the incoming guard — each becomes a task at the post. A one-tap "Sin novedad"
 * completes it when there's nothing to hand over. Summary supports voice dictation.
 */
export function ClockOutReportModal({
  isOpen,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  isOpen: boolean;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (payload: PassdownPayload) => void;
}) {
  const close = () => onCancel();
  return (
    <IonModal isOpen={isOpen} onDidDismiss={close}>
      {isOpen && <ReportBody busy={busy} error={error} onCancel={onCancel} onSubmit={onSubmit} />}
    </IonModal>
  );
}

function ReportBody({
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (payload: PassdownPayload) => void;
}) {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState("");
  const [touched, setTouched] = useState(false);
  const [instructions, setInstructions] = useState<PassdownInstruction[]>([]);

  const lang = i18n.language?.startsWith("en") ? "en-US" : "es-ES";
  const { supported, listening, interim, toggle, stop } = useSpeechToText({
    lang,
    onResult: (txt) => setSummary((s) => (s.trim() ? `${s.trim()} ${txt}` : txt)),
  });

  const cleanInstructions = () => instructions.filter((i) => i.text.trim()).map((i) => ({ text: i.text.trim(), priority: i.priority }));

  const close = () => {
    if (listening) stop();
    onCancel();
  };

  const submit = () => {
    const s = summary.trim();
    if (!s) {
      setTouched(true);
      return;
    }
    if (listening) stop();
    onSubmit({ summary: s, instructions: cleanInstructions() });
  };

  // One-tap: nothing to hand over.
  const submitSinNovedad = () => {
    if (listening) stop();
    onSubmit({ summary: t("passdown.noNews", "Sin novedad"), instructions: [] });
  };

  const addInstruction = () => setInstructions((p) => [...p, { text: "", priority: "media" }]);
  const setInstructionText = (i: number, text: string) => setInstructions((p) => p.map((it, j) => (j === i ? { ...it, text } : it)));
  const setInstructionPriority = (i: number, priority: PassdownInstruction["priority"]) => setInstructions((p) => p.map((it, j) => (j === i ? { ...it, priority } : it)));
  const removeInstruction = (i: number) => setInstructions((p) => p.filter((_, j) => j !== i));

  const PRIOS: PassdownInstruction["priority"][] = ["alta", "media", "baja"];
  const prioLabel = (p: string) => (p === "alta" ? t("passdown.high", "Alta") : p === "baja" ? t("passdown.low", "Baja") : t("passdown.medium", "Media"));

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
        <FileText size={18} className="text-gold" />
        <h2 className="flex-1 text-base font-semibold text-ink">{t("passdown.title", "Pase de turno")}</h2>
        <button onClick={close} className="text-muted" aria-label={t("app.cancel", "Cancelar")}>
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <p className="text-sm text-muted">
          {t("passdown.hint", "Deja las novedades e instrucciones para el guardia que entra. El siguiente turno las recibe automáticamente.")}
        </p>

        {/* Novedades (summary) */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-muted">{t("passdown.summaryLabel", "Novedades del turno")}</label>
            {supported && (
              <button
                type="button"
                onClick={toggle}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${listening ? "bg-critical/15 text-critical" : "bg-gold/10 text-gold"}`}
                aria-label={t("clockOutReport.dictate", "Dictar")}
              >
                {listening ? (
                  <><Square size={13} className="animate-pulse" />{t("clockOutReport.listening", "Escuchando…")}</>
                ) : (
                  <><Mic size={13} />{t("clockOutReport.dictate", "Dictar")}</>
                )}
              </button>
            )}
          </div>
          <textarea
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60"
            rows={5}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={t("clockOutReport.summaryPlaceholder", "Ej. Turno sin novedades. Rondas completadas. Sin incidentes…")}
          />
          {listening && <p className="mt-1.5 text-xs italic text-gold/80">{interim || t("clockOutReport.speakNow", "Habla ahora…")}</p>}
          {touched && !summary.trim() && <p className="mt-1 text-xs text-critical">{t("passdown.required", "Las novedades son obligatorias.")}</p>}
        </div>

        {/* Instrucciones → tareas para el guardia entrante */}
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <ClipboardList size={15} className="text-gold" />
            <label className="block text-xs font-medium text-muted">{t("passdown.instructionsLabel", "Instrucciones para el guardia entrante")}</label>
          </div>
          <p className="mb-2 text-[11px] text-faint">{t("passdown.instructionsHint", "Cada instrucción se convierte en una tarea para el próximo turno.")}</p>

          <div className="space-y-2.5">
            {instructions.map((ins, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface p-2.5">
                <div className="flex items-start gap-2">
                  <input
                    value={ins.text}
                    onChange={(e) => setInstructionText(i, e.target.value)}
                    placeholder={t("passdown.instructionPlaceholder", "Ej. Revisar bomba de agua a las 3am")}
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
                  />
                  <button onClick={() => removeInstruction(i)} className="shrink-0 text-muted" aria-label={t("app.remove", "Quitar")}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {PRIOS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setInstructionPriority(i, p)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${ins.priority === p ? (p === "alta" ? "bg-critical/15 text-critical" : p === "baja" ? "bg-surface-2 text-muted" : "bg-gold/15 text-gold") : "bg-surface-2 text-faint"}`}
                    >
                      {prioLabel(p)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button onClick={addInstruction} className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-sm font-semibold text-gold">
            <Plus size={16} />
            {t("passdown.addInstruction", "Agregar instrucción")}
          </button>
        </div>

        {error && !busy && (
          <ErrorState
            title={t("clockOutReport.failedTitle", "No se pudo marcar salida")}
            hint={error}
            onRetry={submit}
            retryLabel={t("app.retry", "Reintentar")}
          />
        )}
      </div>

      <div className="border-t border-line px-4 pt-3 space-y-2" style={footerStyle}>
        <button onClick={submit} disabled={busy} className="btn-xl w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <><Send size={18} />{t("passdown.submit", "Entregar turno y marcar salida")}</>}
        </button>
        <button onClick={submitSinNovedad} disabled={busy} className="btn-xl w-full border border-line bg-surface text-ink disabled:opacity-50">
          <CheckCircle2 size={18} />
          {t("passdown.noNewsSubmit", "Sin novedad y marcar salida")}
        </button>
      </div>
    </div>
  );
}
