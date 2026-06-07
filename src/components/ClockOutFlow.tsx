import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { guardService } from "@/lib/services";
import { getCurrentPosition } from "@/lib/geo";
import { Button } from "@/components/ui/kit";
import { EarlyClockOutModal } from "@/components/EarlyClockOutModal";
import { ClockOutReportModal } from "@/components/ClockOutReportModal";

/**
 * Self-contained clock-out flow: the clock-out button (with the early-out
 * approval gate), the end-of-shift report modal, and the early-out reason
 * modal — all wired to the guard endpoints. Drop it anywhere the guard should
 * be able to end their shift (the shift-detail screen). `reload` refreshes the
 * caller after a successful punch/request.
 */
export function ClockOutFlow({
  data,
  reload,
}: {
  data: any;
  reload: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [earlyOutOpen, setEarlyOutOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const handleClockOut = async (summary?: string) => {
    setBusy(true);
    try {
      let coords: { latitude?: number; longitude?: number } = {};
      try {
        if (import.meta.env.VITE_DISABLE_GEOLOCATION !== "true") {
          const pos = await getCurrentPosition();
          coords = { latitude: pos.latitude, longitude: pos.longitude };
        }
      } catch {
        /* GPS optional on clock-out */
      }
      const res = await guardService.clockOut({ ...coords, observations: summary });
      // Early clock-out needs supervisor approval first.
      if (res && res.success === false && res.error === "approval_required") {
        setReportOpen(false);
        setGpsError(null);
        setEarlyOutOpen(true);
        return;
      }
      setReportOpen(false);
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const submitEarlyOut = async (reason: string) => {
    setBusy(true);
    setGpsError(null);
    try {
      await guardService.requestClockOut({ reason });
      setEarlyOutOpen(false);
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const resendEarlyOut = async () => {
    setBusy(true);
    setGpsError(null);
    try {
      await guardService.requestClockOut();
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const cancelEarlyOut = async () => {
    setBusy(true);
    setGpsError(null);
    try {
      await guardService.cancelClockOutRequest();
      await reload();
    } catch (e: any) {
      setGpsError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ClockOutControl
        data={data}
        busy={busy}
        onClockOut={() => {
          setGpsError(null);
          setReportOpen(true);
        }}
        onRequestClockOut={() => {
          setGpsError(null);
          setEarlyOutOpen(true);
        }}
        onResendRequest={resendEarlyOut}
        onCancelRequest={cancelEarlyOut}
      />
      {gpsError && <p className="mt-3 text-center text-xs text-critical">{gpsError}</p>}

      <EarlyClockOutModal
        isOpen={earlyOutOpen}
        busy={busy}
        onCancel={() => setEarlyOutOpen(false)}
        onSubmit={submitEarlyOut}
      />
      <ClockOutReportModal
        isOpen={reportOpen}
        busy={busy}
        onCancel={() => setReportOpen(false)}
        onSubmit={(summary) => handleClockOut(summary)}
      />
    </>
  );
}

/**
 * Clock-out control with the early-out approval gate. Early-vs-normal is decided
 * by the backend from the TURNO (single source of truth) — the worker renders it.
 */
function ClockOutControl({
  data,
  busy,
  onClockOut,
  onRequestClockOut,
  onResendRequest,
  onCancelRequest,
}: {
  data: any;
  busy: boolean;
  onClockOut: () => void;
  onRequestClockOut: () => void;
  onResendRequest?: () => void;
  onCancelRequest?: () => void;
}) {
  const { t } = useTranslation();
  const status: string | undefined = data?.clockOutRequest?.status;
  const isEarly = !!data?.isEarlyClockOut;
  const endLabel: string | null = data?.scheduledEndLabel || null;
  const minsToEnd: number | null =
    data?.minutesToScheduledEnd != null ? Number(data.minutesToScheduledEnd) : null;
  const canClockOut = !isEarly || status === "approved";
  const pending = isEarly && status === "pending";

  if (canClockOut) {
    const approved = status === "approved";
    return (
      <Button variant={approved ? "primary" : "danger"} full disabled={busy} onClick={onClockOut}>
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          t(approved ? "onduty.clockOutApproved" : "onduty.clockOut")
        )}
      </Button>
    );
  }

  if (pending) {
    return (
      <div className="space-y-2">
        <div className="btn-xl w-full cursor-default border border-gold/40 bg-gold/5 text-gold">
          <Loader2 size={16} className="animate-spin" />
          {t("onduty.clockOutPending")}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" full disabled={busy} onClick={() => onResendRequest?.()}>
            {t("onduty.resendRequest", "Reenviar")}
          </Button>
          <Button variant="danger" full disabled={busy} onClick={() => onCancelRequest?.()}>
            {t("onduty.cancelRequest", "Cancelar")}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted">
          {t("onduty.pendingHint", "Esperando aprobación del supervisor. Puedes reenviar o cancelar la solicitud.")}
        </p>
      </div>
    );
  }

  const remaining =
    minsToEnd != null && minsToEnd > 0
      ? `${Math.floor(minsToEnd / 60)}h ${minsToEnd % 60}m`
      : null;
  return (
    <div className="space-y-2">
      {status === "rejected" && (
        <p className="text-center text-xs text-critical">{t("onduty.clockOutRejected")}</p>
      )}
      {endLabel && (
        <p className="text-center text-xs text-muted">
          {t("onduty.turnoEndsAt", "Tu turno termina a las {{time}}", { time: endLabel })}
          {remaining ? ` · ${t("onduty.remaining", "faltan {{r}}", { r: remaining })}` : ""}
        </p>
      )}
      <button
        onClick={onRequestClockOut}
        disabled={busy}
        className="btn-xl w-full bg-high text-white active:opacity-80 disabled:opacity-50"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : t("onduty.requestEarlyOut")}
      </button>
      <p className="text-center text-[11px] text-muted">{t("onduty.earlyOutHint")}</p>
    </div>
  );
}
