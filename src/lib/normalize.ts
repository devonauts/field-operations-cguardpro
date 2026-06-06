// Maps loose backend strings into the app's canonical severity/status enums.

export type Severity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "inProgress" | "resolved" | "closed";

export function normalizeSeverity(raw: any): Severity {
  const v = String(raw ?? "").toLowerCase().trim();
  if (["critical", "critico", "crítico", "urgent", "urgente"].includes(v))
    return "critical";
  if (["high", "alto", "alta"].includes(v)) return "high";
  if (["low", "bajo", "baja"].includes(v)) return "low";
  return "medium";
}

export function normalizeStatus(raw: any): IncidentStatus {
  const v = String(raw ?? "").toLowerCase().trim();
  if (["closed", "cerrado", "cerrada"].includes(v)) return "closed";
  if (["resolved", "resuelto", "resuelta"].includes(v)) return "resolved";
  if (["in_progress", "inprogress", "en proceso", "en_proceso", "proceso"].includes(v))
    return "inProgress";
  return "open";
}

// Tailwind utility classes per severity (text + soft bg + border).
export const severityClass: Record<Severity, string> = {
  critical: "text-critical border-critical/40 bg-critical/10",
  high: "text-high border-high/40 bg-high/10",
  medium: "text-medium border-medium/40 bg-medium/10",
  low: "text-low border-low/40 bg-low/10",
};

export const statusClass: Record<IncidentStatus, string> = {
  open: "text-critical border-critical/40 bg-critical/5",
  inProgress: "text-gold border-gold/40 bg-gold/5",
  resolved: "text-online border-online/40 bg-online/5",
  closed: "text-muted border-line-2 bg-surface-2",
};

export function initialsOf(name?: string): string {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function pick<T = any>(obj: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k] as T;
  }
  return undefined;
}

export interface ScheduleBlock {
  name?: string;
  startTime?: string;
  endTime?: string;
  guardsCount?: string | number;
  days: string[];
}

/**
 * `stationSchedule` arrives as a JSON string (or array) like
 * [{"nombre":"Matutina","startTime":"07:00","endTime":"19:00","days":["lun",...]}].
 * Parse it into a clean, displayable structure. Returns [] if not parseable.
 */
export function parseStationSchedule(raw: any): ScheduleBlock[] {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s.startsWith("[") && !s.startsWith("{")) {
      // Plain label like "Matutina" — wrap it.
      return [{ name: s, days: [] }];
    }
    try {
      arr = JSON.parse(s);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) arr = [arr];
  return arr
    .filter(Boolean)
    .map((b: any) => ({
      name: b.nombre || b.name || b.tipo,
      startTime: b.startTime || b.start,
      endTime: b.endTime || b.end,
      guardsCount: b.guardsCount,
      days: Array.isArray(b.days) ? b.days : [],
    }));
}

const DAY_LABELS: Record<string, string> = {
  lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb", dom: "Dom",
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export const formatDays = (days: string[]): string =>
  (days || []).map((d) => DAY_LABELS[String(d).toLowerCase()] || d).join(", ");
