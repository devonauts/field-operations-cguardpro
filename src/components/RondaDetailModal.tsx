import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import { Navigation, X, Loader2, CheckCircle2, Circle } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { rondasService } from "@/lib/rondas";
import { fetchTokenUrl } from "@/lib/fileUrl";
import { fmtDateTime } from "@/lib/format";

/**
 * Read-only detail of one round (ronda): every checkpoint — scanned or missed — with
 * its scan time, note, photo and geo verdict. `staff` picks the supervisor endpoint
 * (any round) vs the guard's own-rounds endpoint.
 */
export default function RondaDetailModal({
  assignmentId,
  onClose,
  staff = false,
}: {
  assignmentId: string;
  onClose: () => void;
  staff?: boolean;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (staff ? rondasService.rondaDetail(assignmentId) : rondasService.patrolDetail(assignmentId))
      .then((d: any) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [assignmentId, staff]);

  const cps: any[] = detail?.checkpoints || [];

  return (
    <IonModal isOpen onDidDismiss={onClose}>
      <div className="flex h-full flex-col bg-background">
        <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
          <Navigation size={18} className="text-gold" />
          <h2 className="flex-1 truncate text-base font-semibold text-ink">{detail?.tour?.name || t("rondas.title")}</h2>
          <button onClick={onClose} className="text-muted" aria-label={t("app.close", "Cerrar")}><X size={22} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-gold" /></div>
          ) : !detail ? (
            <EmptyState title={t("rondas.noHistory", "Sin datos")} />
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink">{detail.station?.name || ""}</span>
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${detail.assignment?.status === "completed" ? "border-online/40 bg-online/5 text-online" : "border-line-2 text-muted"}`}>
                    {detail.assignment?.status === "completed" ? t("rondas.scanStatus.completed") : t("rondas.inProgress")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {fmtDateTime(detail.assignment?.startAt || detail.assignment?.createdAt)}
                  {detail.assignment?.endAt ? ` → ${fmtDateTime(detail.assignment.endAt)}` : ""}
                </p>
                <p className="mt-1 text-xs text-faint">
                  {detail.scanCount}/{detail.totalCheckpoints} {t("rondas.allCheckpoints").toLowerCase()}
                  {detail.guard?.name ? ` · ${detail.guard.name}` : ""}
                </p>
              </Card>

              <div className="space-y-2">
                {cps.map((cp) => (
                  <div key={cp.id} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      {cp.scanned ? <CheckCircle2 size={17} className="shrink-0 text-online" /> : <Circle size={17} className="shrink-0 text-faint" />}
                      <span className="flex-1 truncate text-sm font-semibold text-ink">{cp.name}</span>
                      {cp.scanned && cp.scan?.scannedAt && <span className="shrink-0 text-[11px] text-faint">{fmtDateTime(cp.scan.scannedAt)}</span>}
                    </div>
                    {!cp.scanned && <p className="mt-1 pl-6 text-xs text-faint">{t("rondas.notScanned", "No escaneado")}</p>}
                    {cp.scanned && cp.scan && (
                      <div className="mt-2 space-y-1.5 pl-6">
                        {cp.scan.scannedData?.notes && <p className="text-xs text-ink">{cp.scan.scannedData.notes}</p>}
                        <ScanPhoto sd={cp.scan.scannedData} />
                        <p className="text-[11px] text-faint">
                          {cp.scan.validLocation ? t("rondas.validLocation", "Ubicación válida") : t("rondas.invalidLocation", "Ubicación fuera de rango")}
                          {typeof cp.scan.distanceMeters === "number" ? ` · ${Math.round(cp.scan.distanceMeters)} m` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </IonModal>
  );
}

/** Resolves a scan's private photo to a token URL for display. */
function ScanPhoto({ sd }: { sd: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const priv = sd?.photoPrivateUrl;
    if (!priv) return;
    fetchTokenUrl(priv).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [sd]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="" className="h-24 w-24 rounded-lg border border-line object-cover" />
    </a>
  );
}
