import i18n from "@/i18n";

const locale = () => (i18n.language?.startsWith("en") ? "en-US" : "es-ES");

/**
 * Single source of truth for displaying times: the tenant timezone (set from
 * the backend's `timezone` field). When set, all times render in the tenant's
 * local time regardless of the device timezone — so a 7am shift shows as 7am
 * for every guard. Falls back to the device timezone when unknown.
 */
let APP_TZ: string | undefined;
export function setAppTimeZone(tz?: string | null) {
  if (!tz || typeof tz !== "string") return;
  const clean = tz.trim();
  if (!clean) return;
  try {
    // Only adopt a VALID IANA zone — Intl throws RangeError otherwise. A bad
    // tenant value (e.g. "GMT-5", a display name) must never poison APP_TZ, or
    // every unguarded Intl call (like the clock-in selfie stamp) would crash.
    new Intl.DateTimeFormat("en-US", { timeZone: clean });
    APP_TZ = clean;
  } catch {
    /* invalid timezone — keep the device timezone */
  }
}
export function getAppTimeZone(): string | undefined {
  return APP_TZ;
}
/** Reset the tenant timezone (e.g. on sign-out) so the next session starts clean. */
export function clearAppTimeZone() {
  APP_TZ = undefined;
}

export function fmtTime(v: any): string {
  if (!v) return "—";
  try {
    return new Intl.DateTimeFormat(locale(), {
      hour: "2-digit",
      minute: "2-digit",
      ...(APP_TZ ? { timeZone: APP_TZ } : {}),
    }).format(new Date(v));
  } catch {
    return String(v);
  }
}

export function fmtDateTime(v: any): string {
  if (!v) return "—";
  try {
    return new Intl.DateTimeFormat(locale(), {
      dateStyle: "short",
      timeStyle: "short",
      ...(APP_TZ ? { timeZone: APP_TZ } : {}),
    }).format(new Date(v));
  } catch {
    return String(v);
  }
}

export function fmtDate(v: any): string {
  if (!v) return "—";
  try {
    return new Intl.DateTimeFormat(locale(), {
      dateStyle: "medium",
      ...(APP_TZ ? { timeZone: APP_TZ } : {}),
    }).format(new Date(v));
  } catch {
    return String(v);
  }
}

export function relativeTime(v: any): string {
  if (!v) return "—";
  const then = new Date(v).getTime();
  if (Number.isNaN(then)) return String(v);
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  const isEn = i18n.language?.startsWith("en");
  if (mins < 1) return isEn ? "just now" : "ahora";
  if (mins < 60) return isEn ? `${mins} min ago` : `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24)
    return isEn
      ? `${hrs}h ${rem}m ago`
      : `hace ${hrs}h ${rem}m`;
  const days = Math.floor(hrs / 24);
  return isEn ? `${days}d ago` : `hace ${days}d`;
}
