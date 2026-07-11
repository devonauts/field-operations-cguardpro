import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, AlertTriangle, X, ChevronsRight } from "lucide-react";
import fb from "@/lib/feedback";
import { Button } from "@/components/ui/kit";
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

/* Error state with a retry — the canonical "couldn't load, try again" surface.
   Use this anywhere a fetch can fail so a network error is never shown as an
   empty list. Pair with: data === null ? <ErrorState onRetry={load}/> : ... */
export function ErrorState({
  title,
  hint,
  onRetry,
  retryLabel,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<AlertTriangle size={26} />}
      title={title || t("app.loadError", "No se pudo cargar")}
      hint={hint || t("app.loadErrorHint", "Revisa tu conexión e inténtalo de nuevo.")}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {retryLabel || t("app.retry", "Reintentar")}
          </Button>
        ) : undefined
      }
    />
  );
}

/* Shimmer placeholder — the ONE loading primitive (driven by `.skeleton` in
   index.css). Compose these for skeleton screens instead of spinners. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* A skeleton card row matching the standard list-item height. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-card" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom sheet — the ONE reusable sheet primitive                     */
/* ------------------------------------------------------------------ */

/* Slide-up bottom sheet rendered in a portal. Backdrop tap + Esc close.
   Reuse for confirmations, pickers, detail panels — do not hand-roll sheets. */
export function Sheet({
  open,
  onClose,
  children,
  title,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  // Keep the sheet mounted through its slide-DOWN exit before unmounting, so closing
  // animates like a native modal instead of vanishing.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
    } else if (render) {
      setClosing(true);
      const id = setTimeout(() => { setRender(false); setClosing(false); }, 260);
      return () => clearTimeout(id);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!render) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className={`sheet-backdrop absolute inset-0 bg-black/60 ${closing ? "sheet-backdrop-out" : ""}`} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`sheet-panel safe-bottom relative max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface ${closing ? "sheet-panel-out" : ""} ${className}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-surface/95 px-5 pb-2 pt-3 backdrop-blur">
          <div className="mx-auto h-1 w-9 rounded-full bg-line-2" aria-hidden />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pb-1">
            <h3 className="text-base font-bold text-ink">{title}</h3>
            <button onClick={onClose} className="pressable -mr-1 p-1 text-muted" aria-label={t("common.close", "Cerrar")}>
              <X size={20} />
            </button>
          </div>
        )}
        <div className="px-5 pb-5 pt-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* A result/confirmation sheet (success or error) with an icon, title, optional
   detail lines, and up to two actions. Use for clock-in/out confirmations and
   any "it worked / it failed — retry" moment. Built on <Sheet>. */
export function ResultSheet({
  open,
  onClose,
  variant = "success",
  title,
  lines,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "success" | "error" | "warning";
  title: string;
  lines?: ReactNode[];
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  useEffect(() => {
    if (open) variant === "success" ? fb.success() : fb.error();
  }, [open, variant]);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex flex-col items-center pb-2 text-center">
        <span
          className={`mb-3 grid h-16 w-16 place-items-center rounded-full ${
            variant === "success"
              ? "bg-online/15 text-online"
              : variant === "warning"
                ? "bg-gold/15 text-gold"
                : "bg-critical/15 text-critical"
          }`}
        >
          {variant === "success" ? <CheckCircle2 size={34} /> : <AlertTriangle size={34} />}
        </span>
        <p className="text-lg font-bold text-ink">{title}</p>
        {lines && lines.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {lines.map((l, i) => (
              <p key={i} className="text-sm text-muted">{l}</p>
            ))}
          </div>
        )}
        <div className="mt-5 w-full space-y-2">
          {onPrimary && (
            <Button variant={variant === "error" ? "danger" : "primary"} full onClick={onPrimary}>
              {primaryLabel || "OK"}
            </Button>
          )}
          {onSecondary && (
            <Button variant="outline" full onClick={onSecondary}>
              {secondaryLabel || "Cerrar"}
            </Button>
          )}
          {!onPrimary && !onSecondary && (
            <Button variant="primary" full onClick={onClose}>
              {primaryLabel || "OK"}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* Slide-to-confirm — a deliberate, hard-to-misfire action (panic/SOS, end shift).
   Drag the knob to the end to fire onConfirm. Reusable; tone sets the color. */
export function SlideToConfirm({
  label,
  onConfirm,
  tone = "critical",
}: {
  label: string;
  onConfirm: () => void;
  tone?: "critical" | "gold";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);
  const dragging = useRef(false);
  const KNOB = 52;

  const toneBg = tone === "critical" ? "bg-critical" : "bg-gold-strong";
  const toneText = tone === "critical" ? "text-critical" : "text-gold";

  const maxX = () => (trackRef.current?.offsetWidth || 260) - KNOB - 8;

  const move = (clientX: number) => {
    if (!dragging.current || done) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.max(0, Math.min(maxX(), clientX - rect.left - KNOB / 2));
    setX(nx);
    if (nx >= maxX() - 4) {
      dragging.current = false;
      setDone(true);
      fb.warning();
      onConfirm();
    }
  };

  const end = () => {
    dragging.current = false;
    if (!done) setX(0);
  };

  return (
    <div
      ref={trackRef}
      className="relative h-[60px] w-full select-none overflow-hidden rounded-full border border-line-2 bg-surface-2"
      onPointerMove={(e) => move(e.clientX)}
      onPointerUp={end}
      onPointerLeave={end}
    >
      <span className={`pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold uppercase tracking-wide ${toneText}`}>
        {label}
      </span>
      <button
        type="button"
        aria-label={label}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          dragging.current = true;
        }}
        style={{ transform: `translateX(${x}px)` }}
        className={`no-press absolute left-1 top-1 grid h-[52px] w-[52px] place-items-center rounded-full text-on-accent shadow-lg ${toneBg}`}
      >
        <ChevronsRight size={24} />
      </button>
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
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
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
