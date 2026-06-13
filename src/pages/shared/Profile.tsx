import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Settings,
  Copy,
  MapPin,
  ShieldCheck,
  CalendarDays,
  Phone,
  Mail,
  CircleCheckBig,
  BadgeCheck,
  Clock,
  Star,
  User,
  CalendarOff,
  Bell,
  Globe,
  Bug,
  Check,
  Trash2,
  X,
  LogOut,
  Loader2,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/ui";
import {
  SectionCard,
  SectionHeader,
  MenuList,
  MenuRow,
  MetricTile,
  InfoCell,
  StatusPill,
  IconTile,
  Button,
  Tone,
} from "@/components/ui/kit";
import { useAuth } from "@/context/AuthContext";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { loadGuardPerformance, Performance } from "@/lib/performance";
import { SUPERVISOR_ROLE } from "@/lib/roles";
import { getErrorLog, clearErrorLog, type LogEntry } from "@/lib/errorLog";

const APP_VERSION = "2.0.0";

function fmtDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, role, signOut } = useAuth();
  const history = useHistory();

  // Real profile + station data.
  const { data, reload } = useAsync(() => guardService.dashboard().catch(() => null));
  const { data: perf } = useAsync<Performance | null>(() =>
    loadGuardPerformance(30).catch(() => null),
  );

  const guard = (data as any)?.guard || {};
  const stations: any[] = (data as any)?.stations || [];
  const isClockedIn = !!(data as any)?.isClockedIn;
  const station = stations[0] || {};

  const name = guard.fullName || user?.fullName || user?.name || user?.email || "—";
  // Profile picture: the guard's profileImage (CRM), then the clock-in selfie
  // persisted as the user avatar.
  const avatarSrc =
    (guard as any)?.photoUrl ||
    (user as any)?.avatars?.[0]?.downloadUrl ||
    (guard as any)?.avatars?.[0]?.downloadUrl ||
    null;
  const email = guard.email || user?.email || "—";
  const phone = guard.phone || "—";
  const isSupervisor = role === SUPERVISOR_ROLE;
  const roleLabel = isSupervisor
    ? t("profile.roleSupervisor", "Supervisor de Seguridad")
    : t("profile.roleGuard", "Oficial de Seguridad");
  const employeeId = guard.employeeId || guard.guardId?.slice?.(0, 8)?.toUpperCase?.() || "—";
  // Assigned post: prefer the station-junction assignment, then fall back to the
  // guard's current/next scheduled shift station (guards are often assigned via
  // shifts rather than the station junction).
  const shiftStation =
    (data as any)?.currentShift?.station ||
    (data as any)?.nextShift?.station ||
    null;
  const stationLabel =
    station.stationName ||
    station.name ||
    shiftStation?.stationName ||
    shiftStation?.name ||
    t("profile.noStation", "Sin puesto asignado");

  // Bottom-sheet router for the menu actions.
  const [sheet, setSheet] = useState<null | "phone" | "lang" | "logs">(null);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(employeeId);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Performance metrics — real data from the score engine, gracefully empty.
  const comp = (k: string) => perf?.components?.find((c) => c.key === k)?.score;
  const metrics: { tone: Tone; icon: any; value: string; label: string }[] = [
    {
      tone: "green",
      icon: <CircleCheckBig size={20} />,
      value: comp("rondas") != null ? `${Math.round(comp("rondas")!)}%` : "—",
      label: t("profile.metricPatrols", "Rondas completas"),
    },
    {
      tone: "blue",
      icon: <BadgeCheck size={20} />,
      // Consignas compliance when available; otherwise fall back to the overall
      // compliance base so the tile isn't empty when a guard has no consignas.
      value:
        comp("consignas") != null
          ? `${Math.round(comp("consignas")!)}%`
          : perf?.base != null
          ? `${Math.round(perf.base)}%`
          : "—",
      label: t("profile.metricCompliance", "Cumplimiento"),
    },
    {
      tone: "purple",
      icon: <Clock size={20} />,
      value: comp("punctuality") != null ? `${Math.round(comp("punctuality")!)}%` : "—",
      label: t("profile.metricPunctuality", "Puntualidad"),
    },
    {
      tone: "amber",
      icon: <Star size={20} />,
      value: perf?.score != null ? (perf.score / 20).toFixed(1) : "—",
      label: t("profile.metricScore", "Calificación"),
    },
  ];

  return (
    <Screen
      title={t("nav.profile")}
      right={
        <button
          onClick={() => setSheet("lang")}
          aria-label={t("profile.settings", "Ajustes")}
          className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted active:bg-surface-2"
        >
          <Settings size={18} />
        </button>
      }
    >
      <div className="space-y-4 pb-2">
        {/* ---------- Identity ---------- */}
        <SectionCard>
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <Avatar name={name} src={avatarSrc} className="h-16 w-16 text-base" />
              <span
                className={`absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full border-2 border-surface ${
                  isClockedIn ? "bg-online" : "bg-faint"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-ink">{name}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-info">
                <ShieldCheck size={14} />
                {roleLabel}
              </p>
              <button
                onClick={copyId}
                className="mt-1 flex items-center gap-1.5 text-xs text-muted active:text-ink"
              >
                {t("profile.employeeId", "ID de empleado")}: {employeeId}
                <Copy size={12} />
              </button>
            </div>
          </div>

          <div className="hairline my-3.5" />

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm text-ink">
              <MapPin size={14} className="shrink-0 text-gold" />
              {stationLabel}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-ink">
              <Mail size={14} className="shrink-0 text-gold" />
              <span className="break-all">{email}</span>
            </p>
          </div>
        </SectionCard>

        {/* ---------- Quick info strip ---------- */}
        <SectionCard className="flex divide-x divide-line">
          <InfoCell
            icon={<ShieldCheck size={18} />}
            tone={isClockedIn ? "green" : "neutral"}
            label={t("profile.status", "Estado")}
            value={
              <span className={isClockedIn ? "text-online" : "text-muted"}>
                {isClockedIn ? t("onduty.onDuty", "En turno") : t("profile.offDuty", "Fuera")}
              </span>
            }
          />
          <InfoCell
            icon={<CalendarDays size={18} />}
            tone="blue"
            label={t("profile.joined", "Ingreso")}
            value={fmtDate(guard.joinedAt)}
          />
          <InfoCell
            icon={<Phone size={18} />}
            tone="purple"
            label={t("profile.phone", "Teléfono")}
            value={phone}
          />
        </SectionCard>

        {/* ---------- Performance ---------- */}
        <div>
          <SectionHeader title={t("profile.performance", "Resumen de desempeño")} />
          <SectionCard>
            <div className="grid grid-cols-4 gap-2">
              {metrics.map((m, i) => (
                <MetricTile key={i} tone={m.tone} icon={m.icon} value={m.value} label={m.label} />
              ))}
            </div>
          </SectionCard>
        </div>

        {/* ---------- Menu: account ---------- */}
        <div>
          <SectionHeader title={t("profile.groupAccount", "Mi cuenta")} />
          <MenuList>
            <MenuRow
              tone="green"
              icon={<User size={18} />}
              title={t("profile.personalInfo", "Información personal")}
              subtitle={t("profile.personalInfoSub", "Actualiza tus datos de contacto")}
              onClick={() => setSheet("phone")}
            />
            <MenuRow
              tone="blue"
              icon={<CalendarDays size={18} />}
              title={t("nav.schedule", "Horario")}
              subtitle={t("profile.scheduleSub", "Tus próximos turnos")}
              onClick={() => history.push("/guard/schedule")}
            />
            <MenuRow
              tone="amber"
              icon={<Bell size={18} />}
              title={t("nav.notices", "Avisos")}
              subtitle={t("profile.noticesSub", "Memos y comunicados")}
              onClick={() => history.push("/guard/notices")}
            />
            <MenuRow
              tone="purple"
              icon={<CalendarOff size={18} />}
              title={t("profile.timeOff", "Tiempo libre")}
              subtitle={t("profile.timeOffSub", "Saldo y solicitudes")}
              onClick={() => history.push("/guard/time-off")}
            />
          </MenuList>
        </div>

        {/* ---------- Menu: device & app ---------- */}
        <div>
          <SectionHeader title={t("profile.groupDevice", "Dispositivo y app")} />
          <MenuList>
            <MenuRow
              tone="green"
              icon={<ShieldCheck size={18} />}
              title={t("profile.permissions", "Permisos del dispositivo")}
              subtitle={t("profile.permissionsSub", "Ubicación, cámara y notificaciones")}
              onClick={() => history.push("/guard/permissions")}
            />
            <MenuRow
              tone="blue"
              icon={<Globe size={18} />}
              title={t("profile.language", "Idioma")}
              subtitle={t("profile.languageSub", "Español / English")}
              onClick={() => setSheet("lang")}
            />
            <MenuRow
              tone="amber"
              icon={<Bug size={18} />}
              title={t("profile.diagnostics", "Diagnóstico")}
              subtitle={t("profile.diagnosticsSub", "Registro de errores del dispositivo")}
              onClick={() => setSheet("logs")}
            />
          </MenuList>
        </div>

        {/* ---------- Log out ---------- */}
        <Button variant="danger" full onClick={signOut}>
          <LogOut size={18} />
          {t("auth.signOut")}
        </Button>

        <p className="text-center text-[11px] text-faint">
          {t("profile.version")} {APP_VERSION}
        </p>
      </div>

      {/* ---------- Sheets ---------- */}
      {sheet === "phone" && (
        <PhoneSheet
          current={guard.phone || ""}
          onClose={() => setSheet(null)}
          onSaved={async () => {
            setSheet(null);
            await reload();
          }}
        />
      )}
      {sheet === "lang" && <LangSheet i18n={i18n} t={t} onClose={() => setSheet(null)} />}
      {sheet === "logs" && <LogsSheet t={t} onClose={() => setSheet(null)} />}
    </Screen>
  );
}

/* ---------------------------------------------------------------- BottomSheet */

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted active:text-ink" aria-label="close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PhoneSheet({
  current,
  onClose,
  onSaved,
}: {
  current: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState(current);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await guardService.updateProfile({ phone });
      onSaved();
    } catch {
      setBusy(false);
    }
  };
  return (
    <BottomSheet title={t("profile.personalInfo", "Información personal")} onClose={onClose}>
      <label className="label-eyebrow mb-1.5 block">{t("profile.phone", "Teléfono")}</label>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
        placeholder="+593 ..."
        className="mb-4 w-full rounded-xl border border-line bg-navy-50 px-3.5 py-3 text-ink outline-none focus:border-gold/50"
      />
      <Button variant="primary" full disabled={busy} onClick={save}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : t("app.save", "Guardar")}
      </Button>
    </BottomSheet>
  );
}

function LangSheet({ i18n, t, onClose }: { i18n: any; t: any; onClose: () => void }) {
  const current = localStorage.getItem("appLangChoice") || "auto";
  const opts = [
    { id: "auto", label: t("profile.languageAuto", "Automático") },
    { id: "es", label: t("profile.spanish", "Español") },
    { id: "en", label: t("profile.english", "English") },
  ];
  const change = (id: string) => {
    if (id === "auto") {
      localStorage.removeItem("appLangChoice");
      const nav = (navigator.language || "es").slice(0, 2);
      i18n.changeLanguage(nav === "en" ? "en" : "es");
    } else {
      localStorage.setItem("appLangChoice", id);
      i18n.changeLanguage(id);
    }
    onClose();
  };
  return (
    <BottomSheet title={t("profile.language", "Idioma")} onClose={onClose}>
      <div className="space-y-1">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => change(o.id)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm text-ink active:bg-surface-2"
          >
            {o.label}
            {current === o.id && <Check size={18} className="text-gold" />}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

function LogsSheet({ t, onClose }: { t: any; onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>(getErrorLog());
  const copy = async () => {
    const text = logs.map((l) => `${l.t} [${l.ctx}] ${l.msg}`).join("\n");
    try {
      await navigator.clipboard.writeText(text || "(empty)");
    } catch {
      /* ignore */
    }
  };
  const wipe = () => {
    clearErrorLog();
    setLogs([]);
  };
  return (
    <BottomSheet title={t("profile.diagnostics", "Diagnóstico")} onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <IconTile tone="amber" size="sm">
          <Bug size={15} />
        </IconTile>
        <span className="flex-1 text-xs text-muted">
          {logs.length} {t("profile.logsCount", "registros")}
        </span>
        <button onClick={copy} className="rounded-lg border border-line p-2 text-muted active:bg-surface-2">
          <Copy size={15} />
        </button>
        <button onClick={wipe} className="rounded-lg border border-line p-2 text-muted active:bg-surface-2">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="py-6 text-center text-xs text-faint">
            {t("profile.noLogs", "Sin errores registrados")}
          </p>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="rounded-lg border border-line bg-navy-50 p-2">
              <p className="flex items-center justify-between text-[10px] text-faint">
                <span className="font-semibold text-gold">{l.ctx}</span>
                <span>{l.t.slice(11, 19)}</span>
              </p>
              <p className="mt-0.5 break-words text-[11px] text-ink">{l.msg}</p>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
