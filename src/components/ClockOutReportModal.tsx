import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import { X, FileText, Send, Loader2, Mic, Square } from "lucide-react";
import { useSpeechToText } from "@/lib/useSpeechToText";
import { ErrorState } from "@/components/ui";

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };

/**
 * Mandatory end-of-shift report shown when a guard/supervisor clocks out. The
 * summary is required and supports voice dictation (speech-to-text) via the
 * native recognizer (with a Web Speech API fallback). The summary travels as the
 * clock-out `observations`.
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
  /** A failed clock-out surfaces here so the error shows INSIDE the modal
   *  (instead of behind it) and the guard can retry without re-typing. */
  error?: string | null;
  onCancel: () => void;
  onSubmit: (summary: string) => void;
}) {
  // Mount the body (and the speech-to-text hook + its native listeners) only
  // while the modal is on screen — matching IncidentForm/VisitorModal.
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
  onSubmit: (summary: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState("");
  const [touched, setTouched] = useState(false);

  const lang = i18n.language?.startsWith("en") ? "en-US" : "es-ES";
  const { supported, listening, interim, toggle, stop } = useSpeechToText({
    lang,
    onResult: (txt) =>
      setSummary((s) => (s.trim() ? `${s.trim()} ${txt}` : txt)),
  });

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
    onSubmit(s);
  };

  return (
    <div className="flex h-full flex-col bg-background">
        <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
          <FileText size={18} className="text-gold" />
          <h2 className="flex-1 text-base font-semibold text-ink">
            {t("clockOutReport.title", "Reporte de salida")}
          </h2>
          <button
            onClick={close}
            className="text-muted"
            aria-label={t("app.cancel", "Cancelar")}
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-sm text-muted">
            {t(
              "clockOutReport.hint",
              "Describe cómo transcurrió tu turno antes de marcar la salida.",
            )}
          </p>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-muted">
                {t("clockOutReport.summaryLabel", "Resumen del turno")}
              </label>
              {supported && (
                <button
                  type="button"
                  onClick={toggle}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    listening
                      ? "bg-critical/15 text-critical"
                      : "bg-gold/10 text-gold"
                  }`}
                  aria-label={t("clockOutReport.dictate", "Dictar")}
                >
                  {listening ? (
                    <>
                      <Square size={13} className="animate-pulse" />
                      {t("clockOutReport.listening", "Escuchando…")}
                    </>
                  ) : (
                    <>
                      <Mic size={13} />
                      {t("clockOutReport.dictate", "Dictar")}
                    </>
                  )}
                </button>
              )}
            </div>

            <textarea
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60"
              rows={6}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t(
                "clockOutReport.summaryPlaceholder",
                "Ej. Turno sin novedades. Rondas completadas. Sin incidentes…",
              )}
            />

            {listening && (
              <p className="mt-1.5 text-xs italic text-gold/80">
                {interim || t("clockOutReport.speakNow", "Habla ahora…")}
              </p>
            )}
            {touched && !summary.trim() && (
              <p className="mt-1 text-xs text-critical">
                {t("clockOutReport.required", "El resumen es obligatorio.")}
              </p>
            )}
          </div>

          {/* A failed clock-out is shown HERE (inside the open modal) with a
              working retry — the modal stays open so the report isn't lost. */}
          {error && !busy && (
            <ErrorState
              title={t("clockOutReport.failedTitle", "No se pudo marcar salida")}
              hint={error}
              onRetry={submit}
              retryLabel={t("app.retry", "Reintentar")}
            />
          )}
        </div>

        <div className="border-t border-line px-4 pt-3" style={footerStyle}>
          <button
            onClick={submit}
            disabled={busy}
            className="btn-xl w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <Send size={18} />
                {t("clockOutReport.submit", "Enviar y marcar salida")}
              </>
            )}
          </button>
        </div>
      </div>
  );
}
