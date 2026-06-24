import { useMemo, useState } from "react";
import { IonModal, IonItemSliding, IonItem, IonItemOptions, IonItemOption, IonAlert } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isToday, isYesterday } from "date-fns";
import {
  Bell,
  BellOff,
  X,
  CheckCheck,
  Trash2,
  CheckCircle2,
  Clock,
  MessageSquare,
  Radio,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import { useNotifications, AppNotification } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { SkeletonList, ErrorState, EmptyState } from "@/components/ui";
import { SUPERVISOR_ROLE } from "@/lib/roles";
import type { WorkerRole } from "@/lib/roles";
import { relativeTime } from "@/lib/format";
import i18n from "@/i18n";
import fb from "@/lib/feedback";

/**
 * Enterprise notification center — a bottom-sheet IonModal (matching the app's
 * other modals: initialBreakpoint 1, breakpoints [0,1]). Reads everything from
 * the notification context; this component is pure presentation + routing.
 */
export default function NotificationCenter({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  const { role } = useAuth();
  const {
    items,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    remove,
    clearAll,
  } = useNotifications();
  const [confirmClear, setConfirmClear] = useState(false);

  const hasItems = items.length > 0;

  // Group newest-first into day buckets (Hoy / Ayer / locale date). Items are
  // assumed already newest-first from the context; we sort defensively anyway.
  const groups = useMemo(() => groupByDay(items), [items]);

  const onRowTap = async (n: AppNotification) => {
    fb.tap();
    if (!n.read) void markRead(n.id);
    onClose();
    const route = routeForNotification(n, role);
    if (route) history.push(route);
  };

  return (
    <IonModal isOpen={open} onDidDismiss={onClose} initialBreakpoint={1} breakpoints={[0, 1]}>
      <div className="flex h-full flex-col bg-background safe-bottom">
        {/* ----------------------------------------------------------- Header */}
        <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="flex-1 text-base font-semibold text-ink">
            {t("notifications.title", "Notificaciones")}
          </h2>
          <button
            type="button"
            aria-label={t("notifications.markAllRead", "Marcar todo como leído")}
            disabled={!hasItems}
            onClick={() => {
              fb.press();
              void markAllRead();
            }}
            className="pressable rounded-full p-1.5 text-muted disabled:opacity-30"
          >
            <CheckCheck size={20} />
          </button>
          <button
            type="button"
            aria-label={t("notifications.clear", "Limpiar")}
            disabled={!hasItems}
            onClick={() => {
              fb.tap();
              setConfirmClear(true);
            }}
            className="pressable rounded-full p-1.5 text-muted disabled:opacity-30"
          >
            <Trash2 size={20} />
          </button>
          <button
            type="button"
            aria-label={t("common.close", "Cerrar")}
            onClick={() => {
              fb.tap();
              onClose();
            }}
            className="pressable rounded-full p-1.5 text-muted"
          >
            <X size={22} />
          </button>
        </div>

        {/* ------------------------------------------------------------ Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-4">
              <SkeletonList rows={6} />
            </div>
          ) : error ? (
            <ErrorState
              title={t("notifications.error", "No se pudieron cargar las notificaciones")}
              onRetry={() => {
                fb.tap();
                void refresh();
              }}
              retryLabel={t("notifications.retry", "Reintentar")}
            />
          ) : !hasItems ? (
            <EmptyState
              icon={<BellOff size={26} />}
              title={t("notifications.empty", "No tienes notificaciones")}
            />
          ) : (
            <div className="pb-6">
              {groups.map((g) => (
                <section key={g.key}>
                  <p className="label-eyebrow px-4 pb-1.5 pt-4">{g.label}</p>
                  {g.items.map((n) => (
                    <NotificationItem key={n.id} n={n} onTap={onRowTap} onRemove={remove} />
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Destructive confirm for "Limpiar" (clear all). */}
      <IonAlert
        isOpen={confirmClear}
        onDidDismiss={() => setConfirmClear(false)}
        header={t("notifications.clearConfirmTitle", "¿Limpiar notificaciones?")}
        message={t(
          "notifications.clearConfirmBody",
          "Se eliminarán todas tus notificaciones. Esta acción no se puede deshacer.",
        )}
        buttons={[
          { text: t("common.cancel", "Cancelar"), role: "cancel" },
          {
            text: t("notifications.clear", "Limpiar"),
            role: "destructive",
            handler: () => {
              fb.warning();
              void clearAll();
            },
          },
        ]}
      />
    </IonModal>
  );
}

/* --------------------------------------------------------------------- Row */

function NotificationItem({
  n,
  onTap,
  onRemove,
}: {
  n: AppNotification;
  onTap: (n: AppNotification) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { Icon, tone } = iconFor(n.type);
  return (
    <IonItemSliding>
      <IonItem button detail={false} lines="none" onClick={() => onTap(n)} className="--background-transparent">
        <div className="flex w-full items-start gap-3 py-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">
                {n.title}
              </p>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />}
            </div>
            {n.body && (
              <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">{n.body}</p>
            )}
            <p className="mt-1 text-xs text-faint">{relativeTime(n.createdAt)}</p>
          </div>
        </div>
      </IonItem>
      <IonItemOptions side="end">
        <IonItemOption
          color="danger"
          onClick={() => {
            fb.press();
            void onRemove(n.id);
          }}
        >
          <Trash2 size={18} className="mr-1.5" />
          {t("common.delete", "Eliminar")}
        </IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );
}

/* --------------------------------------------------------- icon mapping */

/**
 * Map a notification `type` (eventType) to an icon + tinted tile classes.
 * Matches on the prefix before the first dot so new sub-events inherit the
 * family icon. Tones reuse the same tokens as the UI kit's IconTile.
 */
export function iconFor(type: string): {
  Icon: typeof Bell;
  tone: string;
} {
  const family = (type || "").split(".")[0];
  switch (family) {
    case "attendance":
      return { Icon: CheckCircle2, tone: "bg-online/15 text-online" };
    case "message":
      return { Icon: MessageSquare, tone: "bg-info/15 text-info" };
    case "radio_check":
      return { Icon: Radio, tone: "bg-route/15 text-route" };
    case "shift":
      return { Icon: CalendarDays, tone: "bg-gold/15 text-gold" };
    case "incident":
      return { Icon: AlertTriangle, tone: "bg-critical/15 text-critical" };
    default:
      return { Icon: Bell, tone: "bg-surface-2 text-muted" };
  }
}
// `Clock` is exported as the alternate attendance glyph in case the integration
// agent prefers it for clock-in/out specifically; keep the import referenced.
void Clock;

/* ----------------------------------------------------- deep-link routing */

/**
 * Map a notification to an in-app route from its `type` + `data` payload.
 *
 * Role-aware: guards and supervisors live under different route trees
 * (`/guard/*` vs `/supervisor/*`) and do NOT share the same set of screens.
 * A route is only returned when it actually exists for the current role
 * (verified against GuardTabs.tsx / SupervisorTabs.tsx); otherwise this
 * returns null and the center just marks-read + closes with NO navigation —
 * never a blank screen or crash.
 *
 * Guard routes (GuardTabs.tsx):
 *   /guard/messages, /guard/messages/:conversationId, /guard/incidents,
 *   /guard/radio, /guard/schedule, /guard/shift
 * Supervisor routes (SupervisorTabs.tsx) — note: NO messages/radio/shift-detail:
 *   /supervisor/incidents, /supervisor/schedule
 */
export function routeForNotification(
  n: AppNotification,
  role?: WorkerRole | null,
): string | null {
  const d = n.data || {};
  const family = (n.type || "").split(".")[0];
  const convoId = d.conversationId ?? d.conversation_id ?? d.threadId ?? d.thread_id;

  if (role === SUPERVISOR_ROLE) {
    // Supervisors only have a subset of destinations. Anything without a real
    // supervisor route returns null (no navigation).
    switch (family) {
      case "incident":
        return "/supervisor/incidents";
      case "shift":
        return "/supervisor/schedule";
      default:
        // message / radio_check / attendance have no supervisor screen.
        return null;
    }
  }

  // Guard (default).
  switch (family) {
    case "message":
      return convoId ? `/guard/messages/${convoId}` : "/guard/messages";
    case "incident":
      return "/guard/incidents";
    case "radio_check":
      return "/guard/radio";
    case "shift":
      return "/guard/schedule";
    case "attendance":
      return "/guard/shift";
    default:
      return null;
  }
}

/* ------------------------------------------------------------- grouping */

type DayGroup = { key: string; label: string; items: AppNotification[] };

function groupByDay(items: AppNotification[]): DayGroup[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-ES";
  const out: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();

  for (const n of sorted) {
    const dt = new Date(n.createdAt);
    const key = Number.isNaN(dt.getTime()) ? "unknown" : dt.toDateString();
    let g = byKey.get(key);
    if (!g) {
      const label =
        key === "unknown"
          ? ""
          : isToday(dt)
            ? i18n.language?.startsWith("en")
              ? "Today"
              : "Hoy"
            : isYesterday(dt)
              ? i18n.language?.startsWith("en")
                ? "Yesterday"
                : "Ayer"
              : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(dt);
      g = { key, label, items: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.items.push(n);
  }
  return out;
}
