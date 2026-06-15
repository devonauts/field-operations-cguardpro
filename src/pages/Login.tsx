import { useState, FormEvent } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AuthService } from "@/lib/auth";
import { fb } from "@/lib/feedback";
import brandLogo from "../assets/brand-logo.png";

export default function Login() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onForgot = async () => {
    fb.tap();
    if (!email.trim()) {
      setError(t("auth.forgot.needEmail", "Escribe tu correo arriba y vuelve a tocar aquí."));
      return;
    }
    setError(null);
    try {
      await AuthService.sendPasswordResetEmail(email.trim());
    } catch {
      /* don't reveal whether the email exists */
    }
    setForgotSent(true);
  };
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    fb.press();
    setError(null);
    setSubmitting(true);
    const res = await signIn({ email: email.trim(), password });
    if (!res.success) {
      fb.error();
      setError(res.error || t("auth.errorGeneric"));
    } else {
      fb.success();
    }
    setSubmitting(false);
  };

  return (
    <IonPage>
      <IonContent>
        <div className="safe-top safe-bottom flex min-h-full flex-col justify-center px-6 py-10">
          <div className="mx-auto w-full max-w-sm">
            {/* Brand */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/30 bg-surface-2">
                <img src={brandLogo} alt="CGuardPro" className="h-14 w-14 object-contain" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                CGUARD<span className="text-gold">PRO</span>
              </h1>
              <p className="mt-1 text-sm text-muted">{t("auth.subtitle")}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label-eyebrow mb-1.5 block">
                  {t("auth.email")}
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60"
                />
              </div>

              <div>
                <label className="label-eyebrow mb-1.5 block">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("auth.passwordPlaceholder")}
                    className="w-full rounded-xl border border-line bg-surface px-4 py-3 pr-11 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60"
                  />
                  <button
                    type="button"
                    onClick={() => { fb.tap(); setShowPw((s) => !s); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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
                    {t("auth.signingIn")}
                  </>
                ) : (
                  t("auth.signIn")
                )}
              </button>

              <button
                type="button"
                onClick={onForgot}
                className="w-full rounded-xl pt-1 text-center text-sm font-medium text-gold-strong"
              >
                {forgotSent
                  ? t("auth.forgot.sent", "Si el correo existe, te enviamos un enlace.")
                  : t("auth.forgot.link", "¿Olvidaste tu contraseña?")}
              </button>
            </form>

            <p className="mt-8 text-center text-[11px] text-faint">
              {t("auth.errorNotAllowed")}
            </p>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
