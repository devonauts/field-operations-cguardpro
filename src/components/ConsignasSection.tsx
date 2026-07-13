/**
 * Consignas de hoy (órdenes permanentes del puesto) — dashboard section.
 * Lists today's due consignas for the guard's station(s) with completion
 * state; tapping a pending one opens the existing ConsignaComplete modal.
 * The backend (/guard/me/orders) was live since the consignas feature but
 * this list was never wired into a screen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { consignasService, ConsignaItem } from "@/lib/rondas";
import { ConsignaComplete } from "@/components/ConsignaComplete";

const PRIO_DOT: Record<string, string> = {
  alta: "bg-critical",
  media: "bg-gold",
  baja: "bg-info",
};

export function ConsignasSection() {
  const { t } = useTranslation();
  const { data, reload } = useAsync<ConsignaItem[]>(
    () => consignasService.orders().catch(() => [] as ConsignaItem[]),
    [],
  );
  const [open, setOpen] = useState<ConsignaItem | null>(null);

  const items = data || [];
  if (items.length === 0) return null;

  const pending = items.filter((c) => !c.done);

  return (
    <>
      <Card className="p-4">
        <SectionTitle
          icon={<ClipboardCheck size={16} />}
          right={
            pending.length > 0 ? (
              <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-semibold text-gold">
                {t("consignas.pendingCount", { defaultValue: "{{n}} pendiente(s)", n: pending.length })}
              </span>
            ) : (
              <span className="text-[11px] text-online">
                {t("consignas.allDone", { defaultValue: "Completadas" })}
              </span>
            )
          }
        >
          {t("consignas.title", { defaultValue: "Consignas de hoy" })}
        </SectionTitle>
        <div className="space-y-2">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => { if (!c.done) setOpen(c); }}
              disabled={c.done}
              className="flex w-full items-center gap-3 rounded-lg border border-line p-3 text-left disabled:opacity-70"
            >
              {c.done ? (
                <CheckCircle2 size={18} className="shrink-0 text-online" />
              ) : (
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIO_DOT[c.priority] || "bg-gold"}`} />
              )}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${c.done ? "text-muted line-through" : "text-ink"}`}>
                  {c.title}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  {c.time && (
                    <>
                      <Clock size={11} />
                      {c.time}
                    </>
                  )}
                  {c.stationName && <span className="truncate">· {c.stationName}</span>}
                </p>
              </div>
              {!c.done && <ChevronRight size={16} className="shrink-0 text-muted" />}
            </button>
          ))}
        </div>
      </Card>

      <ConsignaComplete
        isOpen={!!open}
        consigna={open}
        onClose={() => setOpen(null)}
        onDone={() => { setOpen(null); reload(); }}
      />
    </>
  );
}
