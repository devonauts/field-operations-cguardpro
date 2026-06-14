import { useState } from "react";
import { IonModal } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { CalendarOff, Plus, X, Loader2 } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { asRows } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { normalizeStatus } from "@/lib/normalize";
import { fb } from "@/lib/feedback";

const TYPES = ["vacation", "medical", "personal", "family", "other"] as const;

const STATUS_STYLE: Record<string, string> = {
  pending: "border-gold/40 bg-gold/5 text-gold",
  approved: "border-online/40 bg-online/5 text-online",
  rejected: "border-critical/40 bg-critical/5 text-critical",
};

function statusKey(raw: any): "pending" | "approved" | "rejected" {
  const v = String(raw ?? "").toLowerCase();
  if (["approved", "aprobado", "aprobada"].includes(v)) return "approved";
  if (["rejected", "rechazado", "rechazada", "denied"].includes(v)) return "rejected";
  return "pending";
}

export default function GuardTimeOff() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useAsync(() =>
    guardService.timeOff().catch(() => [])
  );
  const rows = asRows(data);

  return (
    <Screen
      title={t("timeoff.title")}
      subtitle={t("timeoff.subtitle")}
      onRefresh={reload}
      right={
        <button
          onClick={() => { fb.tap(); setOpen(true); }}
          className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-gold-strong px-4 text-xs font-semibold text-navy active:bg-gold-hover"
        >
          <Plus size={16} />
          {t("timeoff.request")}
        </button>
      }
    >
      {loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarOff size={28} />} title={t("timeoff.empty")} />
      ) : (
        <div className="space-y-3">
          {rows.map((r: any, i: number) => {
            const sk = statusKey(r.status);
            const typeKey = (TYPES as readonly string[]).includes(
              String(r.type).toLowerCase()
            )
              ? String(r.type).toLowerCase()
              : null;
            return (
              <Card key={r.id || i} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {typeKey ? t(`timeoff.types.${typeKey}`) : r.type || "—"}
                  </p>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[sk]}`}
                  >
                    {t(`timeoff.status.${sk}`)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {fmtDate(r.startDate)} — {fmtDate(r.endDate)}
                </p>
                {r.reason && <p className="mt-1 text-xs text-faint">{r.reason}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <RequestModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onCreated={reload}
      />
    </Screen>
  );
}

function RequestModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<string>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!startDate || !endDate || busy) return;
    fb.press();
    setBusy(true);
    setError(null);
    try {
      await guardService.requestTimeOff({ type, startDate, endDate, reason: reason || undefined });
      setStartDate("");
      setEndDate("");
      setReason("");
      fb.success();
      onCreated();
      onClose();
    } catch (e: any) {
      fb.error();
      setError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60";

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={1} breakpoints={[0, 1]}>
      <div className="flex h-full flex-col bg-navy safe-bottom">
        <div className="safe-top flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold text-ink">{t("timeoff.newRequest")}</h2>
          <button onClick={() => { fb.tap(); onClose(); }} className="rounded-full p-1 text-muted">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("timeoff.type")}</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((ty) => (
                <button
                  key={ty}
                  onClick={() => { fb.select(); setType(ty); }}
                  className={`rounded-lg border py-2.5 text-xs font-semibold ${
                    type === ty ? "border-gold bg-gold/10 text-gold" : "border-line text-muted"
                  }`}
                >
                  {t(`timeoff.types.${ty}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("timeoff.startDate")}</label>
              <input type="date" className={input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("timeoff.endDate")}</label>
              <input type="date" className={input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("timeoff.reason")}</label>
            <textarea rows={3} className={`${input} resize-none`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-critical">{error}</p>}
        </div>
        <div className="border-t border-line px-4 py-3">
          <button
            onClick={submit}
            disabled={busy || !startDate || !endDate}
            className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : t("timeoff.submit")}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
