import { Card, SeverityBadge, StatusBadge } from "./ui";
import { normalizeSeverity, normalizeStatus, pick } from "@/lib/normalize";
import { relativeTime } from "@/lib/format";

export function IncidentRow({ incident }: { incident: any }) {
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

  return (
    <Card className="p-4">
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
