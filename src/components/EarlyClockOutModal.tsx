import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import { modalEnterAnimation, modalLeaveAnimation } from "@/lib/modalAnimation";
import { X, Clock, Send, Loader2 } from "lucide-react";

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };

/**
 * Prompts the guard for a reason before requesting supervisor approval to clock
 * out early. Mirrors the ConsignaComplete modal pattern. The reason is required;
 * it travels with the clockOutRequest so the supervisor can approve/reject with
 * context in the CRM.
 */
export function EarlyClockOutModal({
  isOpen,
  busy,
  onCancel,
  onSubmit,
}: {
  isOpen: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  // Reset whenever the modal (re)opens.
  useEffect(() => {
    if (isOpen) { setReason(""); setTouched(false); }
  }, [isOpen]);

  const submit = () => {
    const r = reason.trim();
    if (!r) { setTouched(true); return; }
    onSubmit(r);
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onCancel} enterAnimation={modalEnterAnimation} leaveAnimation={modalLeaveAnimation}>
      <div className="flex h-full flex-col bg-background">
        <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
          <Clock size={18} className="text-gold" />
          <h2 className="flex-1 text-base font-semibold text-ink">
            {t("onduty.earlyOutReasonTitle")}
          </h2>
          <button onClick={onCancel} className="text-muted" aria-label={t("onduty.earlyOutCancel")}>
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-sm text-muted">{t("onduty.earlyOutHint")}</p>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              {t("onduty.earlyOutReasonLabel")}
            </label>
            <textarea
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60"
              rows={4}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("onduty.earlyOutReasonPlaceholder")}
            />
            {touched && !reason.trim() && (
              <p className="mt-1 text-xs text-critical">{t("onduty.earlyOutReasonRequired")}</p>
            )}
          </div>
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
              <><Send size={18} />{t("onduty.earlyOutReasonSubmit")}</>
            )}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
