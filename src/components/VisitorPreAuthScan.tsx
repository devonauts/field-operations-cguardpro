import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  QrCode,
  User,
  Car,
  Building2,
  Fingerprint,
  Clock,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { RondaQRScanner } from "./RondaQRScanner";
import { Button } from "./ui/kit";
import {
  scanVisitorPreAuth,
  PreAuthScanResult,
  PreAuthFailReason,
} from "@/lib/visitors";
import { isNetworkError } from "@/lib/api";

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };

const FAIL_REASONS: PreAuthFailReason[] = [
  "already_used",
  "revoked",
  "not_yet_valid",
  "expired",
  "station_mismatch",
  "not_found",
];

/** Local, non-API states layered on top of the backend's PreAuthScanResult. */
type Phase =
  | { kind: "scanning" }
  | { kind: "validating" }
  | { kind: "success"; result: Extract<PreAuthScanResult, { valid: true }> }
  | { kind: "failure"; reason: PreAuthFailReason }
  | { kind: "error"; message: string };

/**
 * Visitor pre-authorization scanner flow.
 *
 * Reuses {@link RondaQRScanner} for the camera + manual-entry fallback. When the
 * guard scans (or types) a token we validate it against the backend, which on
 * success has already created the visitor log. The result is shown as a clear
 * success / friendly-error card. On success we call `onRegistered` so the
 * visitor list behind this view refreshes.
 */
export function VisitorPreAuthScan({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered?: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  // Guard against a double submit: html5-qrcode can fire the same QR on two
  // consecutive frames, and the manual-entry button can be double-tapped.
  const submitting = useRef(false);

  const validate = async (qrToken: string) => {
    const token = qrToken.trim();
    if (!token || submitting.current) return;
    submitting.current = true;
    setPhase({ kind: "validating" });
    try {
      const res = await scanVisitorPreAuth(token);
      if (res.valid) {
        setPhase({ kind: "success", result: res });
        onRegistered?.();
      } else {
        const reason = FAIL_REASONS.includes(res.reason) ? res.reason : "not_found";
        setPhase({ kind: "failure", reason });
      }
    } catch (e) {
      setPhase({
        kind: "error",
        message: isNetworkError(e)
          ? t("visitor.preauth.networkError")
          : t("visitor.preauth.genericError"),
      });
    } finally {
      submitting.current = false;
    }
  };

  // Reset back to the scanner for another attempt (re-mounts RondaQRScanner so
  // its internal `handled` latch and camera restart cleanly).
  const rescan = () => {
    submitting.current = false;
    setPhase({ kind: "scanning" });
  };

  if (phase.kind === "scanning") {
    return <RondaQRScanner onScan={validate} onClose={onClose} />;
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-background"
      style={{ zIndex: 100000 }}
    >
      <div className="safe-top flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <QrCode size={18} className="text-gold" />
          {t("visitor.preauth.scanButton")}
        </h2>
        <button onClick={onClose} className="text-muted" aria-label={t("app.close")}>
          <X size={22} />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-5 py-6">
        {phase.kind === "validating" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
            <Loader2 size={32} className="animate-spin text-gold" />
            <p className="text-sm">{t("visitor.preauth.validating")}</p>
          </div>
        )}

        {phase.kind === "success" && (
          <SuccessCard visitor={phase.result.visitor} />
        )}

        {phase.kind === "failure" && (
          <ResultMessage
            tone="error"
            title={t("visitor.preauth.errorTitle")}
            message={t(`visitor.preauth.reasons.${phase.reason}`)}
          />
        )}

        {phase.kind === "error" && (
          <ResultMessage
            tone="error"
            title={t("visitor.preauth.errorTitle")}
            message={phase.message}
          />
        )}
      </div>

      {/* Action footer — success offers "scan another" + "done"; failures retry. */}
      {phase.kind === "success" && (
        <div
          className="flex gap-2 border-t border-line px-4 pt-3"
          style={footerStyle}
        >
          <Button variant="outline" onClick={rescan} className="flex-1">
            <QrCode size={18} />
            {t("visitor.preauth.scanAnother")}
          </Button>
          <Button variant="primary" onClick={onClose} className="flex-1">
            {t("visitor.preauth.done")}
          </Button>
        </div>
      )}
      {(phase.kind === "failure" || phase.kind === "error") && (
        <div
          className="flex gap-2 border-t border-line px-4 pt-3"
          style={footerStyle}
        >
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t("visitor.preauth.done")}
          </Button>
          <Button variant="primary" onClick={rescan} className="flex-1">
            <RotateCcw size={18} />
            {t("visitor.preauth.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- success -------------------------------- */
function SuccessCard({ visitor }: { visitor: import("@/lib/visitors").PreAuthVisitor }) {
  const { t } = useTranslation();
  const name = [visitor.firstName, visitor.lastName].filter(Boolean).join(" ") || "—";

  const rows: [React.ReactNode, string][] = [
    [<Fingerprint size={16} />, visitor.idNumber || ""],
    [<Building2 size={16} />, visitor.company || ""],
    [<Car size={16} />, visitor.vehiclePlate || ""],
    [<Clock size={16} />, visitor.reason || ""],
    [<MapPin size={16} />, visitor.stationName || ""],
  ];
  const visible = rows.filter(([, v]) => !!v);

  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-online/10 text-online">
        <CheckCircle2 size={36} />
      </span>
      <p className="mt-3 text-base font-bold text-online">
        {t("visitor.preauth.registered")}
      </p>
      <p className="mt-1 text-xs text-muted">{t("visitor.preauth.successHint")}</p>

      <div className="card mt-5 w-full p-5 text-left">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-muted">
            <User size={22} />
          </span>
          <h3 className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{name}</h3>
        </div>

        {visible.length > 0 && (
          <div className="mt-3 divide-y divide-line">
            {visible.map(([icon, value], i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <span className="shrink-0 text-faint">{icon}</span>
                <span className="min-w-0 flex-1 break-words text-[14px] font-medium text-ink">
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- error/result ---------------------------- */
function ResultMessage({
  tone,
  title,
  message,
}: {
  tone: "error";
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          tone === "error" ? "bg-critical/10 text-critical" : "bg-online/10 text-online"
        }`}
      >
        <XCircle size={36} />
      </span>
      <p className="mt-3 text-base font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{message}</p>
    </div>
  );
}
