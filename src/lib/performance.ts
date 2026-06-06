import { api, tenantPath } from "./api";

/**
 * Performance model — kept in sync with the backend guardPerformanceService.
 * Eight factors: seven weighted "quality" factors form a base, faltas y atrasos
 * apply a logarithmic penalty, and backup activity adds a capped bonus.
 */

export type ComponentKey =
  | "punctuality"
  | "uniform"
  | "inventory"
  | "consignas"
  | "rondas"
  | "quiz"
  | "training";

export type Tier = "excellent" | "good" | "fair" | "needs_improvement";
export type SubjectType = "guard" | "supervisor";

export interface PerfComponent {
  key: ComponentKey;
  score: number;
  weight: number;
}

export interface Performance {
  score: number;
  base: number;
  tier: Tier;
  hasData: boolean;
  subjectType: SubjectType;
  components: PerfComponent[];
  penalty: { points: number; absences: number; tardies: number };
  bonus: {
    points: number;
    volunteerCount: number;
    coverCount: number;
    cap: number;
  };
  stats: {
    hoursWorked: number;
    shiftsScheduled: number;
    shiftsWorked: number;
    onTimeShifts: number;
    attendanceRate: number | null;
    avgLatenessMin: number;
    absences: number;
    tardies: number;
    uniformAvg: number | null;
    inventoryRate: number | null;
    consignasRate: number | null;
    consignasDue: number;
    consignasDone: number;
    rondasRate: number | null;
    quizAvg: number | null;
    trainingRate: number | null;
  };
  tips: ComponentKey[];
  source: "backend" | "client";
}

// Keep in sync with backend DEFAULT_WEIGHTS.
export const WEIGHTS: Record<ComponentKey, number> = {
  punctuality: 0.18,
  uniform: 0.14,
  inventory: 0.14,
  consignas: 0.16,
  rondas: 0.16,
  quiz: 0.12,
  training: 0.1,
};

export function tierFor(score: number): Tier {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "fair";
  return "needs_improvement";
}

const EMPTY_STATS: Performance["stats"] = {
  hoursWorked: 0,
  shiftsScheduled: 0,
  shiftsWorked: 0,
  onTimeShifts: 0,
  attendanceRate: null,
  avgLatenessMin: 0,
  absences: 0,
  tardies: 0,
  uniformAvg: null,
  inventoryRate: null,
  consignasRate: null,
  consignasDue: 0,
  consignasDone: 0,
  rondasRate: null,
  quizAvg: null,
  trainingRate: null,
};

function emptyPerformance(
  source: "backend" | "client",
  subjectType: SubjectType = "guard",
): Performance {
  return {
    score: 0,
    base: 0,
    tier: "needs_improvement",
    hasData: false,
    subjectType,
    components: [],
    penalty: { points: 0, absences: 0, tardies: 0 },
    bonus: { points: 0, volunteerCount: 0, coverCount: 0, cap: 0 },
    stats: { ...EMPTY_STATS },
    tips: [],
    source,
  };
}

/** Normalize a raw backend payload into a fully-shaped Performance. */
function normalize(r: any, source: "backend" | "client"): Performance {
  const base = emptyPerformance(source, r.subjectType || "guard");
  return {
    ...base,
    ...r,
    penalty: { ...base.penalty, ...(r.penalty || {}) },
    bonus: { ...base.bonus, ...(r.bonus || {}) },
    stats: { ...base.stats, ...(r.stats || {}) },
    components: Array.isArray(r.components) ? r.components : [],
    tips: Array.isArray(r.tips) ? r.tips : [],
    source,
  };
}

/**
 * Load performance for the authenticated guard. Prefers the backend endpoint
 * (full 8-factor algorithm). Falls back to an honest "no data" object if the
 * endpoint isn't reachable, so the Panel degrades gracefully.
 */
export async function loadGuardPerformance(
  periodDays = 30,
): Promise<Performance> {
  try {
    const r = await api.get(
      tenantPath(`/guard/me/performance?period=${periodDays}`),
    );
    if (r && typeof r.score === "number") return normalize(r, "backend");
  } catch {
    /* endpoint unreachable → degrade gracefully */
  }
  return emptyPerformance("client");
}

/** Supervisor performance (admin/supervisor view of a staff user id). */
export async function loadSupervisorPerformance(
  userId: string,
  periodDays = 30,
): Promise<Performance> {
  const r = await api.get(
    tenantPath(`/supervisor/${userId}/performance?period=${periodDays}`),
  );
  return normalize(r, "backend");
}
