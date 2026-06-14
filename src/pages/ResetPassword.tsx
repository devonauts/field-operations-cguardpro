import { useState, FormEvent } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Loader2, Eye, EyeOff, CheckCircle2, ShieldCheck } from "lucide-react";
import { AuthService } from "@/lib/auth";
import { fb } from "@/lib/feedback";
import brandLogo from "../assets/brand-logo.png";

/**
 * Reset-password screen reached via a deep link (cguardpro://reset-password?token=…
 * or https://app.cguardpro.com/guard-reset?token=…). Sets a new password from the
 * token, then returns the guard to the login screen.
 */
export default function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError(t("auth.reset.tooShort", "La contraseña debe tener al menos 8 caracteres."));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.reset.mismatch", "Las contraseñas no coinciden."));
      return;
    }
    fb.press();
    setSubmitting(true);
    try {
      await AuthService.resetPassword(token, password);
      fb.success();
      setDone(true);
    } catch (err: any) {
      fb.error();
      setError(err?.message || t("auth.reset.error", "El enlace es inválido o expiró. Pide uno nuevo."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IonPage>
      <IonContent>
        <div className="safe-top safe-bottom flex min-h-full flex-col justify-center px-6 py-10">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/30 bg-navy-50">
                <img src={brandLogo} alt="CGuardPro" className="h-14 w-14 object-contain" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                {t("auth.reset.title", "Restablecer contraseña")}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {t("auth.reset.subtitle", "Crea una nueva contraseña para tu cuenta.")}
              </p>
            </div>

            {done ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold-strong">
                  <CheckCircle2 size={30} />
                </div>
                <p className="text-base text-ink">
                  {t("auth.reset.success", "Tu contraseña se actualizó. Ya puedes iniciar sesión.")}
                </p>
                <button
                  onClick={() => { fb.tap(); onDone(); }}
                  className="flex min-h-[54px] w-full items-center justify-center rounded-xl bg-gold-strong px-4 py-4 text-base font-semibold text-navy active:bg-gold-hover"
                >
                  {t("auth.reset.goLogin", "Ir a iniciar sesión")}
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label-eyebrow mb-1.5 block">{t("auth.reset.newPassword", "Nueva contraseña")}</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-line bg-surface px-4 py-3 pr-11 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60"
                    />
                    <button type="button" onClick={() => { fb.tap(); setShowPw((s) => !s); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted" tabIndex={-1}>
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label-eyebrow mb-1.5 block">{t("auth.reset.confirm", "Confirmar contraseña")}</label>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60"
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gold-strong px-4 py-4 text-base font-semibold leading-none text-navy active:bg-gold-hover disabled:opacity-60"
                >
                  {submitting ? <><Loader2 size={18} className="animate-spin" />{t("auth.reset.saving", "Guardando…")}</> : (
                    <><ShieldCheck size={18} />{t("auth.reset.submit", "Guardar contraseña")}</>
                  )}
                </button>

                <button type="button" onClick={() => { fb.tap(); onDone(); }} className="w-full rounded-xl pt-1 text-center text-sm text-muted">
                  {t("auth.reset.cancel", "Cancelar")}
                </button>
              </form>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
