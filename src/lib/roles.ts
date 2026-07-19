// Roles allowed to use the worker app. GUARDS ONLY — supervisors use the
// supervisor app, admins use the CRM. The backend also enforces this
// (app:'worker' only accepts securityGuard); this is the client-side mirror.
export const GUARD_ROLE = "securityGuard";
export const SUPERVISOR_ROLE = "securitySupervisor";

export const ALLOWED_ROLES = [GUARD_ROLE] as const;
export type WorkerRole = (typeof ALLOWED_ROLES)[number];

const normalize = (r: any): string => {
  if (!r) return "";
  if (typeof r === "string") return r;
  return r.name || r.key || r.slug || r.id || "";
};

/** Collect every role string attached to a user, across global + tenant scope. */
export function collectRoles(user: any): string[] {
  if (!user) return [];
  const out: string[] = [];
  const push = (raw: any) => {
    if (Array.isArray(raw)) raw.forEach((r) => out.push(normalize(r)));
    else if (raw) out.push(normalize(raw));
  };
  push(user.roles ?? user.role);
  if (Array.isArray(user.tenants)) {
    user.tenants.forEach((t: any) => push(t.roles ?? t.role));
  }
  if (user.tenant) push(user.tenant.roles ?? user.tenant.role);
  return out.filter(Boolean);
}

/** Whether the user holds any role permitted in this app. */
export function hasAllowedRole(user: any): boolean {
  const roles = collectRoles(user);
  return roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r));
}

/** Resolve the effective worker role. Guards only — a guard+supervisor dual
 *  holder is served the guard experience here (supervisor uses the other app). */
export function resolveWorkerRole(user: any): WorkerRole | null {
  const roles = collectRoles(user);
  if (roles.includes(GUARD_ROLE)) return GUARD_ROLE;
  return null;
}

/** First tenant id found on the user object. */
export function resolveTenantId(user: any): string | null {
  if (!user || !Array.isArray(user.tenants) || user.tenants.length === 0)
    return null;
  const t = user.tenants[0];
  return t.tenantId || (t.tenant && (t.tenant.id || t.tenant.tenantId)) || null;
}
