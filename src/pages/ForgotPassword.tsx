import { useEffect, useRef, useState, FormEvent } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Loader2, ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { AuthService } from "@/lib/auth";
import { ApiError, isNetworkError, CONFIG_ERROR_STATUS } from "@/lib/api";
import { fb } from "@/lib/feedback";
import brandLogo from "../assets/brand-logo.png";

/** Basic email shape check — non-empty, single @, a dot in the domain. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Seconds the confirmation screen waits before auto-returning to sign-in. */
const AUTO_DISMISS_MS = 3000;

/**
 * Native "forgot password" flow. A dedicated branded screen with an email input
 * that requests a reset link, then a neutral confirmation screen that does NOT
 * reveal whether the account exists.
 *
 * Navigation is local (two steps: "form" → "sent"). `onBack` returns to the
 * sign-in screen; `initialEmail` prefills whatever the user already typed there.
 */
export default function ForgotPassword({
  onBack,
  initialEmail = "",
}: {
  onBack: () => void;
  initialEmail?: string;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<"form" | "sent">("form");
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const value = email.trim();
    if (!looksLikeEmail(value)) {
      fb.error();
      setError(t("auth.forgot.invalidEmail", "Escribe un correo electrónico válido."));
      return;
    }
    fb.press();
    setError(null);
    setSubmitting(true);
    try {
      await AuthService.sendPasswordResetEmail(value);
      fb.success();
      setStep("sent");
    } catch (err) {
      // Keep it secure: a missing account (404) yields the SAME neutral
      // confirmation as a success — never reveal whether the email exists.
      if (err instanceof ApiError && err.status === 404) {
        fb.success();
        setStep("sent");
        return;
      }
      // Genuine failures (offline / 5xx / client config) stay on this screen
      // with an inline error so the user can retry.
      const real =
        isNetworkError(err) ||
        (err instanceof ApiError &&
          (err.status >= 500 || err.status === CONFIG_ERROR_STATUS));
      if (real) {
        fb.error();
        setError(
          t(
            "auth.forgot.error",
            "No pudimos procesar tu solicitud. Revisa tu conexión e inténtalo de nuevo."
          )
        );
        return;
      }
      // Any other 4xx (e.g. validation) is treated as neutral so we still never
      // leak account existence.
      fb.success();
      setStep("sent");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "sent") {
    return <Confirmation onContinue={onBack} />;
  }

  return (
    <IonPage>
      <IonContent>
        <div className="safe-top safe-bottom flex min-h-full flex-col px-6 py-10">
          <button
            type="button"
            onClick={() => { fb.tap(); onBack(); }}
            className="-ml-1.5 flex items-center gap-1 self-start rounded-full p-1.5 text-sm font-medium text-muted active:bg-surface-2"
          >
            <ArrowLeft size={18} />
            {t("auth.forgot.back", "Iniciar sesión")}
          </button>

          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
            {/* Brand */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/30 bg-surface-2">
                <img src={brandLogo} alt="CGuardPro" className="h-14 w-14 object-contain" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                {t("auth.forgot.title", "Restablecer contraseña")}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {t(
                  "auth.forgot.subtitle",
                  "Escribe tu correo y te enviaremos un enlace para restablecer tu contraseña."
                )}
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label-eyebrow mb-1.5 block">{t("auth.email")}</label>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gold-strong px-4 py-4 text-base font-semibold leading-none text-on-accent transition active:bg-gold-hover disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {t("auth.forgot.sending", "Enviando…")}
                  </>
                ) : (
                  <>
                    <Mail size={18} />
                    {t("auth.forgot.send", "Enviar enlace")}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}

/**
 * Neutral confirmation screen. Auto-dismisses back to sign-in after 3s AND
 * offers a "Continuar" button that returns immediately — whichever happens
 * first. The timer is cleared on unmount (and the button tap unmounts us).
 */
function Confirmation({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  // Guard against double-invoking onContinue (timer + tap racing).
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onContinue();
  };

  useEffect(() => {
    const id = window.setTimeout(finish, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
    // finish is stable for the lifetime of this mount; run the timer once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IonPage>
      <IonContent>
        <div className="safe-top safe-bottom flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mx-auto w-full max-w-sm space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold-strong">
              <CheckCircle2 size={36} />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-ink">
                {t("auth.forgot.sentTitle", "Revisa tu correo")}
              </h1>
              <p className="text-sm text-muted">
                {t(
                  "auth.forgot.sentBody",
                  "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { fb.tap(); finish(); }}
              className="flex min-h-[54px] w-full items-center justify-center rounded-xl bg-gold-strong px-4 py-4 text-base font-semibold text-on-accent transition active:bg-gold-hover"
            >
              {t("auth.forgot.continue", "Continuar")}
            </button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
