import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, ExternalLink, Clock, User, FileText } from "lucide-react";
import { Card, SeverityBadge, StatusBadge, Sheet, ResultSheet } from "./ui";
import { Button } from "./ui/kit";
import {
  normalizeSeverity,
  normalizeStatus,
  pick,
  IncidentStatus,
} from "@/lib/normalize";
import { relativeTime, fmtDateTime } from "@/lib/format";
import { useFileUrl } from "@/lib/fileUrl";
import { incidentService, INCIDENT_STATUS_VALUE } from "@/lib/services";
import { fb } from "@/lib/feedback";

export function IncidentRow({
  incident,
  onClick,
}: {
  incident: any;
  onClick?: (incident: any) => void;
}) {
  const title =
    pick<string>(incident, "subject", "title", "name") || "—";
  const where = pick<string>(
    incident,
    "location",
    "stationName"
  ) || incident.station?.stationName;
  const guard =
    incident.guardName?.fullName ||
    incident.guard?.fullName ||
    pick<string>(incident, "callerName");
  const when = pick(incident, "incidentAt", "dateTime", "createdAt");

  // Card already adds button semantics (role/tabIndex + Enter/Space) and the
  // pressable affordance when given an onClick; we only add the haptic tap.
  const handleClick = onClick
    ? () => {
        fb.tap();
        onClick(incident);
      }
    : undefined;

  return (
    <Card className="p-4" onClick={handleClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {[where, guard].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="mt-1 text-[11px] text-faint">{relativeTime(when)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <SeverityBadge severity={normalizeSeverity(pick(incident, "priority", "severity"))} />
          <StatusBadge status={normalizeStatus(incident.status)} />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Incident photo thumbnail (resolves a token URL for a file object).  */
/* ------------------------------------------------------------------ */
function IncidentPhoto({ file }: { file: any }) {
  const url = useFileUrl(file);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block shrink-0">
      <img
        src={url}
        alt=""
        className="h-20 w-20 rounded-xl border border-line object-cover"
      />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Incident detail sheet — read-only summary + optional status actions */
/* (Guard passes no actions → pure read-only; Supervisor wires         */
/* updateStatus via the workflow buttons).                             */
/* ------------------------------------------------------------------ */
const STATUS_FLOW: { next: IncidentStatus; labelKey: string }[] = [
  { next: "inProgress", labelKey: "incidents.actionAcknowledge" },
  { next: "resolved", labelKey: "incidents.actionResolve" },
];

export function IncidentDetailSheet({
  incident,
  open,
  onClose,
  canManage = false,
  onUpdated,
}: {
  incident: any | null;
  open: boolean;
  onClose: () => void;
  /** Show status-transition actions (supervisor). Guard view leaves false. */
  canManage?: boolean;
  /** Called after a successful status change so the list can refresh. */
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<IncidentStatus | null>(null);
  const [result, setResult] = useState<
    { variant: "success" | "error"; title: string } | null
  >(null);

  if (!incident) return null;

  const title = pick<string>(incident, "subject", "title", "name") || "—";
  const description =
    pick<string>(incident, "description", "content", "comments") || "";
  const where =
    pick<string>(incident, "location", "stationName") ||
    incident.station?.stationName;
  const reporter =
    incident.guardName?.fullName ||
    incident.guard?.fullName ||
    pick<string>(incident, "callerName");
  const when = pick(incident, "incidentAt", "dateTime", "createdAt");
  const typeName =
    incident.incidentType?.name ||
    incident.incidentType?.title ||
    pick<string>(incident, "incidentTypeName", "type");
  const sev = normalizeSeverity(pick(incident, "priority", "severity"));
  const status = normalizeStatus(incident.status);

  // Evidence can live on imageUrl (admin) or idPhoto (guard endpoint).
  const photoSrc = incident.imageUrl || incident.idPhoto;
  const photos: any[] = Array.isArray(photoSrc)
    ? photoSrc
    : photoSrc
      ? [photoSrc]
      : [];

  // GPS for a "Ver en mapa" deep link, if the incident captured one.
  const lat = Number(pick(incident, "latitude", "lat"));
  const lng = Number(pick(incident, "longitude", "lng", "lon"));
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  // Only offer transitions that move the incident forward, and never for a
  // terminal (resolved/closed) incident.
  const actions =
    canManage && status !== "resolved" && status !== "closed"
      ? STATUS_FLOW.filter((a) => a.next !== status)
      : [];

  const transition = async (next: IncidentStatus) => {
    if (busy) return;
    setBusy(next);
    try {
      await incidentService.updateStatus(
        incident.id,
        INCIDENT_STATUS_VALUE[next] || next,
        note,
      );
      setResult({
        variant: "success",
        title: t("incidents.statusUpdated", "Estado actualizado"),
      });
      onUpdated?.();
    } catch {
      setResult({
        variant: "error",
        title: t("incidents.statusUpdateFailed", "No se pudo actualizar"),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={title}>
        <div className="space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={sev} />
            <StatusBadge status={status} />
            {typeName && (
              <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted">
                {typeName}
              </span>
            )}
          </div>

          {/* Evidence near the top */}
          {photos.length > 0 && (
            <div>
              <p className="label-eyebrow mb-1.5">{t("incidents.evidence")}</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  <IncidentPhoto key={i} file={p} />
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {description && (
            <div>
              <p className="label-eyebrow mb-1.5 flex items-center gap-1.5">
                <FileText size={13} /> {t("incidents.description")}
              </p>
              <p className="whitespace-pre-wrap text-sm text-ink">{description}</p>
            </div>
          )}

          {/* Meta */}
          <div className="space-y-2.5 rounded-xl border border-line bg-surface-2/40 p-3.5">
            {when && (
              <MetaLine icon={<Clock size={14} />} value={fmtDateTime(when)} />
            )}
            {reporter && (
              <MetaLine icon={<User size={14} />} value={reporter} />
            )}
            {where && (
              <MetaLine icon={<MapPin size={14} />} value={where} />
            )}
            {hasGeo && (
              <a
                href={`https://maps.google.com/?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
                className="pressable flex items-center gap-1.5 text-sm font-medium text-gold"
              >
                <ExternalLink size={14} />
                {t("incidents.viewOnMap", "Ver en mapa")}
              </a>
            )}
          </div>

          {/* Status actions (supervisor) */}
          {actions.length > 0 && (
            <div className="space-y-3 border-t border-line pt-4">
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("incidents.noteOptional", "Nota (opcional)")}
                className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-faint outline-none focus:border-gold/60"
              />
              <div className="space-y-2">
                {actions.map((a) => (
                  <Button
                    key={a.next}
                    full
                    variant={a.next === "resolved" ? "primary" : "outline"}
                    disabled={busy != null}
                    onClick={() => transition(a.next)}
                  >
                    {t(a.labelKey, a.next === "resolved" ? "Resolver" : "En proceso")}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <ResultSheet
        open={result != null}
        onClose={() => {
          const ok = result?.variant === "success";
          setResult(null);
          if (ok) onClose();
        }}
        variant={result?.variant || "success"}
        title={result?.title || ""}
      />
    </>
  );
}

function MetaLine({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink">
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}
