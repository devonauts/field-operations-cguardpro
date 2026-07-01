import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { ClipboardList, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { guardService } from "@/lib/services";

/**
 * Shows the pase de turno left by the previous guard at this post, once, when the
 * incoming guard opens the on-duty home. Fetching it marks it received on the backend
 * (so it won't re-surface). The instructions also land in the guard's Tareas.
 */
export default function IncomingPassdownGate() {
  const { t } = useTranslation();
  const [pd, setPd] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res: any = await guardService.incomingPassdown();
        const passdown = res?.passdown;
        if (alive && passdown) {
          setPd(passdown);
          setOpen(true);
        }
      } catch {
        /* no passdown / offline — silent */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!pd || !open) return null;

  const prio = (p: string) => (p === "alta" ? "text-critical" : p === "baja" ? "text-muted" : "text-gold");

  return (
    <Sheet open onClose={() => setOpen(false)} title={t("passdown.receivedTitle", "Pase de turno recibido")}>
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
        <ArrowRightLeft size={18} className="text-gold" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{pd.shiftLabel || t("passdown.title", "Pase de turno")}</div>
          {pd.outgoingGuardName && (
            <div className="text-xs text-muted">{t("passdown.from", "De")}: {pd.outgoingGuardName}</div>
          )}
        </div>
      </div>

      {pd.notes && (
        <div className="mb-4">
          <div className="label-eyebrow mb-1.5 block">{t("passdown.summaryLabel", "Novedades del turno")}</div>
          <p className="whitespace-pre-wrap rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink">{pd.notes}</p>
        </div>
      )}

      {Array.isArray(pd.instructions) && pd.instructions.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <ClipboardList size={15} className="text-gold" />
            <span className="label-eyebrow">{t("passdown.instructionsLabel", "Instrucciones para el guardia entrante")}</span>
          </div>
          <div className="space-y-2">
            {pd.instructions.map((ins: any) => (
              <div key={ins.id} className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
                <CheckCircle2 size={15} className={`mt-0.5 shrink-0 ${prio(ins.priority)}`} />
                <span className="text-sm text-ink">{ins.taskToDo}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-faint">{t("passdown.instructionsInTasks", "Estas instrucciones también están en tus Tareas.")}</p>
        </div>
      )}

      {Array.isArray(pd.passdownImages) && pd.passdownImages.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {pd.passdownImages.map((img: any, i: number) => {
            const url = img.downloadUrl || img.publicUrl;
            return url ? (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" className="h-20 w-20 rounded-xl border border-line object-cover" />
              </a>
            ) : null;
          })}
        </div>
      )}

      <Button variant="primary" full onClick={() => setOpen(false)}>
        <CheckCircle2 size={18} />
        {t("passdown.acknowledge", "Entendido")}
      </Button>
    </Sheet>
  );
}
