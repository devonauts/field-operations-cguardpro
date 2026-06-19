import { ReactNode } from "react";
import { ChevronRight, Check } from "lucide-react";
import fb from "@/lib/feedback";

/**
 * Enterprise UI kit — reusable, theme-driven primitives for the worker app.
 *
 * Every accent comes from a semantic `tone` that maps to a design token in
 * index.css (@theme). Re-skinning the app = editing those tokens, not these
 * components. Build screens by composing these, not by hand-rolling markup.
 */

export type Tone = "green" | "blue" | "amber" | "purple" | "teal" | "red" | "gold" | "neutral";

/** tone → tinted icon-tile classes (soft bg + solid foreground). */
const TONE_TILE: Record<Tone, string> = {
  green: "bg-online/15 text-online",
  blue: "bg-info/15 text-info",
  amber: "bg-gold/15 text-gold",
  purple: "bg-route/15 text-route",
  teal: "bg-teal/15 text-teal",
  red: "bg-critical/15 text-critical",
  gold: "bg-gold/15 text-gold",
  neutral: "bg-surface-2 text-muted",
};

/** tone → solid text color (for values/labels). */
export const TONE_TEXT: Record<Tone, string> = {
  green: "text-online",
  blue: "text-info",
  amber: "text-gold",
  purple: "text-route",
  teal: "text-teal",
  red: "text-critical",
  gold: "text-gold",
  neutral: "text-ink",
};

/* ----------------------------------------------------------------- Surfaces */

export function SectionCard({
  children,
  className = "",
  inset = true,
}: {
  children: ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <div className={`card-elev ${inset ? "p-5" : ""} ${className}`}>{children}</div>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <p className="label-eyebrow">{title}</p>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- Tiles */

export function IconTile({
  tone = "gold",
  size = "md",
  children,
  className = "",
}: {
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
}) {
  const dim =
    size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl ${dim} ${TONE_TILE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** A navigable list row: icon tile · title + subtitle · trailing/chevron. */
export function MenuRow({
  icon,
  tone = "neutral",
  title,
  subtitle,
  trailing,
  onClick,
  showChevron = true,
}: {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  showChevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick ? () => { fb.select(); onClick(); } : undefined}
      className="pressable flex w-full items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-5 text-left active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2"
    >
      <IconTile tone={tone}>{icon}</IconTile>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {trailing}
      {showChevron && <ChevronRight size={18} className="shrink-0 text-faint" />}
    </button>
  );
}

/** A list of MenuRows inside one elevated card with hairline separators. */
export function MenuList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>;
}

/** A KPI tile: circular tinted icon, big value, caption. */
export function MetricTile({
  tone = "gold",
  icon,
  value,
  label,
}: {
  tone?: Tone;
  icon: ReactNode;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className={`mb-2 grid h-12 w-12 place-items-center rounded-full ${TONE_TILE[tone]}`}
      >
        {icon}
      </span>
      <span className="text-xl font-bold tabular-nums text-ink">{value}</span>
      <span className="mt-0.5 text-[11px] leading-tight text-muted">{label}</span>
    </div>
  );
}

/** A compact labelled cell (status/joined/phone/email strip). */
export function InfoCell({
  icon,
  tone = "neutral",
  label,
  value,
}: {
  icon: ReactNode;
  tone?: Tone;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-2 text-center">
      <span className={TONE_TEXT[tone]}>{icon}</span>
      <span className="label-eyebrow">{label}</span>
      <span className="truncate text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Pills */

export function StatusPill({
  tone = "green",
  children,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${TONE_TILE[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------- Verification chip */

/** A status verification chip (e.g. "Inside Geofence ✓"). */
export function StatusChip({
  icon,
  label,
  ok = true,
}: {
  icon: ReactNode;
  label: string;
  ok?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center justify-center gap-1.5 text-[12px] font-medium">
      <span className={ok ? "text-online" : "text-faint"}>{icon}</span>
      <span className="text-ink/85">{label}</span>
      {ok && <Check size={13} className="text-online" />}
    </div>
  );
}

/* ------------------------------------------------------- Quick-action tile */

/** A large tap target for a primary screen action (Visitors / Patrol / …). */
export function QuickActionTile({
  icon,
  label,
  tone = "gold",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  const ring: Record<Tone, string> = {
    green: "border-online/25",
    blue: "border-info/25",
    amber: "border-gold/25",
    purple: "border-route/25",
    teal: "border-teal/25",
    red: "border-critical/30 bg-critical/5",
    gold: "border-gold/25",
    neutral: "border-line",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable flex min-h-26 flex-col items-center justify-center gap-2.5 rounded-2xl border bg-surface p-3 ${ring[tone]}`}
    >
      <span className={TONE_TEXT[tone]}>{icon}</span>
      <span className="text-sm font-semibold text-ink">{label}</span>
    </button>
  );
}

/* ----------------------------------------------------------- Activity row */

/** A timeline-style activity row: tinted ring icon · title + subtitle · time. */
export function ActivityRow({
  icon,
  tone = "neutral",
  title,
  subtitle,
  time,
}: {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  subtitle?: string;
  time?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${TONE_TEXT[tone]} ${
          tone === "neutral" ? "border-line" : "border-current/30"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {time && <span className="shrink-0 text-xs text-muted">{time}</span>}
    </div>
  );
}

/* ----------------------------------------------------------------- Button */

export function Button({
  variant = "primary",
  full,
  disabled,
  onClick,
  children,
  className = "",
  type = "button",
}: {
  variant?: "primary" | "outline" | "ghost" | "danger";
  full?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
}) {
  const base =
    "btn-xl pressable disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<string, string> = {
    primary: "bg-gold-strong text-on-accent hover:bg-gold-hover",
    outline: "border border-line-2 text-ink hover:bg-surface-2",
    ghost: "text-ink hover:bg-surface-2",
    danger: "border border-critical/40 text-critical hover:bg-critical/10",
  };
  const handleClick = () => {
    if (variant === "primary" || variant === "danger") fb.press();
    else fb.tap();
    onClick?.();
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={handleClick}
      className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
