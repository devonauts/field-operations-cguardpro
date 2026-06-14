import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Severity,
  IncidentStatus,
  severityClass,
  statusClass,
  initialsOf,
} from "@/lib/normalize";

/* Card surface.
   When given an `onClick`, the Card automatically becomes a native-feeling
   press target: it gains the `.pressable` affordance (scale + fade on tap, no
   gray tap-highlight), a pointer cursor, and button semantics (role/tabIndex +
   Enter/Space activation) for accessibility. A Card without onClick is an inert
   surface and is left completely unchanged. */
export function Card({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  if (!onClick) {
    return <div className={`card ${className}`}>{children}</div>;
  }
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`card pressable cursor-pointer ${className}`}
    >
      {children}
    </div>
  );
}

/* Uppercase eyebrow label */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="label-eyebrow">{children}</p>;
}

/* KPI stat card (dashboard / reports) */
export function StatCard({
  label,
  value,
  sub,
  accent = "ink",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "ink" | "gold" | "online" | "critical" | "info";
  icon?: ReactNode;
}) {
  const accentText = {
    ink: "text-ink",
    gold: "text-gold",
    online: "text-online",
    critical: "text-critical",
    info: "text-info",
  }[accent];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>{label}</Eyebrow>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${accentText}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

/* Severity pill */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${severityClass[severity]}`}
    >
      {t(`incidents.severity.${severity}`)}
    </span>
  );
}

/* Status pill */
export function StatusBadge({ status }: { status: IncidentStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass[status]}`}
    >
      {t(`incidents.statusLabel.${status}`)}
    </span>
  );
}

/* Avatar with initials */
export function Avatar({
  name,
  src,
  className = "",
}: {
  name?: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || ""}
        className={`shrink-0 rounded-full bg-surface-2 object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted ${className}`}
    >
      {initialsOf(name)}
    </div>
  );
}

/* Colored status dot */
export function Dot({ color = "muted" }: { color?: string }) {
  const map: Record<string, string> = {
    online: "bg-online",
    gold: "bg-gold",
    critical: "bg-critical",
    muted: "bg-low",
    info: "bg-info",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[color] || map.muted}`} />;
}

/* Centered spinner */
export function Loader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="animate-spin text-gold" size={30} />
    </div>
  );
}

/* Empty / error state */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-low">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* Circular score gauge (0–100) */
export function ScoreRing({
  score,
  color,
  label,
  size = 132,
}: {
  score: number;
  color: string;
  label?: string;
  size?: number;
}) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1f2630" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-ink">{Math.round(score)}</span>
        {label && <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>}
      </div>
    </div>
  );
}

/* Labeled progress bar (component breakdown) */
export function MeterBar({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-ink">{Math.round(score)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: color, transition: "width 500ms ease" }}
        />
      </div>
    </div>
  );
}

/* Section heading inside content */
export function SectionTitle({
  icon,
  children,
  right,
}: {
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon && <span className="text-gold">{icon}</span>}
        {children}
      </h3>
      {right}
    </div>
  );
}
