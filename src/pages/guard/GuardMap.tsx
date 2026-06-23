import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Users, MapPin, ShieldCheck, ExternalLink } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Loader } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardService, guardsService, incidentService } from "@/lib/services";
import { staticMapUrl } from "@/lib/station";
import { relativeTime } from "@/lib/format";
import { pick } from "@/lib/normalize";

const isOpenIncident = (i: any) => {
  const s = String(i?.status || "").toLowerCase();
  return s !== "cerrado" && s !== "closed" && s !== "resuelto";
};
const isCritical = (i: any) => {
  const p = String(i?.priority || "").toLowerCase();
  return i?.isPanic || p === "critical" || p === "alto" || p === "high";
};

type Zone = { name: string; status: "clear" | "patrol" | "alert" };

/** Numeric coordinate pair from a loose object, or null if absent/zeroed. */
function coordsOf(o: any): { lat: number; lng: number } | null {
  const lat = Number(pick(o, "latitude", "lat"));
  const lng = Number(pick(o, "longitude", "lng", "lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0))
    return null;
  return { lat, lng };
}

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
  // Real GPS-backed positions (punch-in coordinates) for guards currently on
  // duty — the only coordinate source the API exposes. Best-effort; merged into
  // the roster by securityGuard id so each row can show coords + a map link.
  const { data: locs, reload: reloadLocs } = useAsync<any[]>(
    () => guardsService.activeLocations().catch(() => []),
    [],
  );

  const stations: any[] = data?.stations || [];
  const incidents = incRes?.rows || [];
  const members: any[] = team?.members || [];

  // Index live coordinates by guard id for an O(1) merge onto roster rows.
  const locById = useMemo(() => {
    const m = new Map<string, any>();
    for (const l of locs || []) {
      const id = l.securityGuardId || l.id || l.guardId;
      if (id) m.set(String(id), l);
    }
    return m;
  }, [locs]);

  // Roster rows enriched with real coordinates + last-seen time where known.
  const roster = useMemo(() => {
    const base = members.length
      ? members.map((g) => {
          const loc = locById.get(String(g.securityGuardId));
          return {
            id: g.securityGuardId,
            fullName: g.fullName,
            stationName: g.stationName,
            isMe: g.isMe,
            punchInTime: g.punchInTime || loc?.punchInTime,
            coords: coordsOf(loc),
          };
        })
      : (locs || []).map((l) => ({
          id: l.securityGuardId || l.id,
          fullName: l.fullName,
          stationName: l.stationName,
          isMe: false,
          punchInTime: l.punchInTime,
          coords: coordsOf(l),
        }));
    return base;
  }, [members, locs, locById]);

  // Site backdrop: a real (static) Google map of the first station with coords.
  const siteCoords = useMemo(() => {
    for (const st of stations) {
      const c = coordsOf(st) || coordsOf(st.postSite) || coordsOf(st.station);
      if (c) return c;
    }
    return null;
  }, [stations]);
  const heroMap = siteCoords ? staticMapUrl(siteCoords.lat, siteCoords.lng, 640, 300) : null;

  const zones: Zone[] = useMemo(() => {
    const openStations = new Set<string>();
    const critStations = new Set<string>();
    for (const i of incidents) {
      if (!isOpenIncident(i)) continue;
      const sid = i.stationId ?? i.station?.id;
      if (sid == null) continue;
      openStations.add(sid);
      if (isCritical(i)) critStations.add(sid);
    }
    return stations.map((st) => ({
      name: st.stationName || st.name,
      status: critStations.has(st.id) ? "alert" : openStations.has(st.id) ? "patrol" : "clear",
    }));
  }, [stations, incidents]);
  const activeCount = team?.count ?? roster.length ?? 1;

  const STATUS = useMemo(() => ({
    clear: { color: "var(--online)", label: t("onduty.zoneClear", "despejado") },
    patrol: { color: "var(--gold)", label: t("onduty.zonePatrol", "ronda") },
    alert: { color: "var(--critical)", label: t("onduty.zoneAlert", "alerta") },
  } as const), [t]);

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
        await Promise.all([reload(), reloadTeam(), reloadLocs()]);
      }}
    >
      {loading ? (
        <Loader />
      ) : (
        <div className="space-y-4">
          {/* Real site map (static Google map) when the site has coordinates;
              a "Ver en mapa" deep-link opens the device's interactive map. */}
          {heroMap && siteCoords && (
            <div className="card-elev overflow-hidden">
              <img src={heroMap} alt="" className="h-40 w-full object-cover" />
              <a
                href={`https://maps.google.com/?q=${siteCoords.lat},${siteCoords.lng}`}
                target="_blank"
                rel="noreferrer"
                className="pressable flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-gold"
              >
                <ExternalLink size={15} />
                {t("map.openInMaps", "Ver en mapa")}
              </a>
            </div>
          )}

          {/* Zones (real station status from open incidents) */}
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
                        style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          {/* Team roster — guards on duty, with real coords + last-seen time */}
          <div>
            <p className="label-eyebrow mb-2">{t("map.team", "Compañeros en servicio")}</p>
            <div className="card-elev divide-y divide-line overflow-hidden">
              {roster.length > 0 ? (
                roster.map((g: any, i: number) => (
                  <div key={g.id || i} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-online/10 text-online">
                      <ShieldCheck size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">
                        {g.fullName || t("guard.guard", "Vigilante")}
                        {g.isMe && (
                          <span className="ml-1.5 text-xs font-medium text-gold">
                            ({t("map.you", "tú")})
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[
                          g.stationName,
                          g.punchInTime
                            ? t("map.lastSeen", "visto {{ago}}", { ago: relativeTime(g.punchInTime) })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {g.coords ? (
                      <a
                        href={`https://maps.google.com/?q=${g.coords.lat},${g.coords.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="pressable flex shrink-0 items-center gap-1 text-[11px] font-semibold text-gold"
                      >
                        <MapPin size={13} />
                        {t("map.locate", "Mapa")}
                      </a>
                    ) : (
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-online">
                        {t("guard.onDuty", "En servicio")}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-3 px-4 py-4 text-muted">
                  <Users size={16} className="shrink-0" />
                  <p className="text-sm">{t("map.noTeam", "No hay otros vigilantes en servicio en este sitio.")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
