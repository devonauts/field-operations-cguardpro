import { useTranslation } from "react-i18next";
import { Users, MapPin, ShieldCheck } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Loader } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardService, incidentService } from "@/lib/services";

const isOpenIncident = (i: any) => {
  const s = String(i?.status || "").toLowerCase();
  return s !== "cerrado" && s !== "closed" && s !== "resuelto";
};
const isCritical = (i: any) => {
  const p = String(i?.priority || "").toLowerCase();
  return i?.isPanic || p === "critical" || p === "alto" || p === "high";
};

type Zone = { name: string; status: "clear" | "patrol" | "alert" };

export default function GuardMap() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(() => guardService.dashboard());
  const { data: incRes } = useAsync<{ rows: any[]; count: number }>(
    () => incidentService.list({ limit: 25 }).catch(() => ({ rows: [], count: 0 })),
    [],
  );
  const { data: team, reload: reloadTeam } = useAsync<any>(
    () => guardService.team().catch(() => null),
    [],
  );

  const stations: any[] = data?.stations || [];
  const incidents = incRes?.rows || [];
  const members: any[] = team?.members || [];

  const zones: Zone[] = stations.map((st) => {
    const here = (i: any) => i.stationId === st.id || i.station?.id === st.id;
    const crit = incidents.some((i) => isOpenIncident(i) && isCritical(i) && here(i));
    const open = incidents.some((i) => isOpenIncident(i) && here(i));
    return { name: st.stationName || st.name, status: crit ? "alert" : open ? "patrol" : "clear" };
  });
  const activeCount = team?.count ?? zones.length ?? 1;

  const STATUS = {
    clear: { color: "#22c55e", label: t("onduty.zoneClear", "despejado") },
    patrol: { color: "#d4a017", label: t("onduty.zonePatrol", "ronda") },
    alert: { color: "#ef4444", label: t("onduty.zoneAlert", "alerta") },
  } as const;

  return (
    <Screen
      back
      title={t("onduty.teamOnDuty", "Equipo en servicio")}
      subtitle={
        team?.postSiteName
          ? `${team.postSiteName} · ${t("onduty.activeCount", "{{n}} activos", { n: activeCount })}`
          : t("onduty.activeCount", "{{n}} activos", { n: activeCount })
      }
      onRefresh={async () => {
        await Promise.all([reload(), reloadTeam()]);
      }}
    >
      {loading ? (
        <Loader />
      ) : (
        <div className="space-y-4">
          {/* Radar */}
          <div className="card-elev grid place-items-center p-5">
            <BigRadar zones={zones} />
          </div>

          {/* Zones */}
          <div>
            <p className="label-eyebrow mb-2">{t("map.zones", "Zonas")}</p>
            <div className="card-elev divide-y divide-line overflow-hidden">
              {(zones.length ? zones : [{ name: t("guard.noStations", "Sin puesto"), status: "clear" as const }]).map(
                (z, i) => {
                  const s = STATUS[z.status];
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2">
                        <MapPin size={16} style={{ color: s.color }} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{z.name}</span>
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: s.color, background: `${s.color}1f` }}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          {/* Team roster — guards on duty across this sitio's stations */}
          <div>
            <p className="label-eyebrow mb-2">{t("map.team", "Compañeros en servicio")}</p>
            <div className="card-elev divide-y divide-line overflow-hidden">
              {members.length > 0 ? (
                members.map((g: any, i: number) => (
                  <div key={g.securityGuardId || i} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-online/10 text-online">
                      <ShieldCheck size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">
                        {g.fullName || t("guard.guard", "Guardia")}
                        {g.isMe && (
                          <span className="ml-1.5 text-xs font-medium text-gold">
                            ({t("map.you", "tú")})
                          </span>
                        )}
                      </p>
                      {g.stationName && <p className="truncate text-xs text-muted">{g.stationName}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-online">
                      {t("guard.onDuty", "En servicio")}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-3 px-4 py-4 text-muted">
                  <Users size={16} className="shrink-0" />
                  <p className="text-sm">{t("map.noTeam", "No hay otros guardias en servicio en este sitio.")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function BigRadar({ zones }: { zones: Zone[] }) {
  const pts = [
    [62, 50],
    [150, 64],
    [50, 130],
    [156, 150],
    [104, 96],
  ];
  return (
    <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden>
      <rect x="1" y="1" width="208" height="208" rx="18" fill="#0d111a" stroke="#1f2630" />
      {[88, 64, 40, 18].map((r) => (
        <circle key={r} cx="105" cy="105" r={r} fill="none" stroke="#d4a017" strokeOpacity="0.16" />
      ))}
      <line x1="105" y1="17" x2="105" y2="193" stroke="#d4a017" strokeOpacity="0.1" />
      <line x1="17" y1="105" x2="193" y2="105" stroke="#d4a017" strokeOpacity="0.1" />
      {zones.slice(0, 5).map((z, i) => {
        const [x, y] = pts[i] || pts[0];
        const fill = z.status === "alert" ? "#ef4444" : z.status === "patrol" ? "#d4a017" : "#22c55e";
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="9" fill={fill} fillOpacity="0.18" />
            <circle cx={x} cy={y} r="4.5" fill={fill} />
          </g>
        );
      })}
      <circle cx="105" cy="105" r="6" fill="#d4a017" />
      <circle cx="105" cy="105" r="11" fill="none" stroke="#d4a017" strokeOpacity="0.5" />
    </svg>
  );
}
