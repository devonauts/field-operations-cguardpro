import { useMemo, useRef, useState } from "react";
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
  LogOut,
  Loader2,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  Camera,
  Images,
} from "lucide-react";
import { compressImage, takeNativePhoto, isNative, CapturedImage } from "@/lib/capture";
import { Screen } from "@/components/Screen";
import { Avatar, Sheet } from "@/components/ui";
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
import { useTheme } from "@/context/ThemeContext";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import { useFileUrl } from "@/lib/fileUrl";
import { loadGuardPerformance, Performance } from "@/lib/performance";
import { getErrorLog, clearErrorLog, type LogEntry } from "@/lib/errorLog";
import fb, { soundsEnabled, setSoundsEnabled, setHapticsEnabled } from "@/lib/feedback";

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
  const { theme, setTheme } = useTheme();
  const history = useHistory();

  // Real profile + station data.
  const { data, reload } = useAsync(() => guardService.dashboard().catch(() => null));
  const { data: perf, reload: reloadPerf } = useAsync<Performance | null>(() =>
    loadGuardPerformance(30).catch(() => null),
  );

  const guard = (data as any)?.guard || {};
  const stations: any[] = (data as any)?.stations || [];
  const isClockedIn = !!(data as any)?.isClockedIn;
  const station = stations[0] || {};

  const name = guard.fullName || user?.fullName || user?.name || user?.email || "—";
  // Profile picture: the guard's profileImage (CRM), then the clock-in selfie
  // persisted as the user avatar.
  // Profile picture source: the guard's CRM photoUrl (absolute), then the
  // clock-in selfie persisted as the user/guard avatar. Avatars are resolved
  // through the file helper so a token-based downloadUrl is preferred and a raw
  // privateUrl is exchanged for a token (never served raw).
  const avatarSource =
    (guard as any)?.photoUrl ||
    (user as any)?.avatars?.[0] ||
    (guard as any)?.avatars?.[0] ||
    null;
  const avatarSrc = useFileUrl(avatarSource) || null;
  const email = guard.email || user?.email || "—";
  const phone = guard.phone || "—";
  // Guards only — the worker app no longer serves supervisors (lib/roles.ts).
  const roleLabel = t("profile.roleGuard", "Oficial de Seguridad");
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
  const [sheet, setSheet] = useState<null | "phone" | "lang" | "logs" | "avatar">(null);
  // Sound + haptic feedback toggle.
  const [fbOn, setFbOn] = useState(soundsEnabled());

  // ── Profile photo picker ────────────────────────────────────────────────
  // Take a selfie / pick from the gallery, upload via the multipart credentials
  // flow, then the backend links the stored descriptor to securityGuard.profileImage.
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const webResolver = useRef<((file: File | null) => void) | null>(null);

  const pickFile = (source: "camera" | "gallery"): Promise<CapturedImage | null> => {
    // Native uses the Capacitor camera (FRONT camera for a selfie); web falls
    // back to a hidden <input type="file"> (capture="user" → front camera).
    if (isNative()) return takeNativePhoto(source, { front: source === "camera" }).catch(() => null);
    return new Promise((resolve) => {
      webResolver.current = async (file) => {
        if (!file) return resolve(null);
        try { resolve(await compressImage(file)); } catch { resolve(null); }
      };
      (source === "camera" ? cameraInput : galleryInput).current?.click();
    });
  };

  const onWebPick = (file?: File | null) => {
    const r = webResolver.current;
    webResolver.current = null;
    r?.(file || null);
  };

  const chooseAvatar = async (source: "camera" | "gallery") => {
    setSheet(null);
    const img = await pickFile(source);
    if (!img) return;
    setAvatarBusy(true);
    setAvatarErr(null);
    try {
      await guardService.uploadProfileImage(img.file);
      fb.success();
      await reload();
    } catch {
      setAvatarErr(t("profile.photoError", "No se pudo subir la foto. Intenta de nuevo."));
      fb.error();
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setSheet(null);
    setAvatarBusy(true);
    setAvatarErr(null);
    try {
      await guardService.updateProfile({ profileImage: [] });
      fb.success();
      await reload();
    } catch {
      setAvatarErr(t("profile.photoError", "No se pudo subir la foto. Intenta de nuevo."));
      fb.error();
    } finally {
      setAvatarBusy(false);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(employeeId);
      fb.success();
    } catch {
      /* clipboard unavailable */
    }
  };

  // Performance metrics — real data from the score engine, gracefully empty.
  const metrics = useMemo<{ tone: Tone; icon: any; value: string; label: string }[]>(() => {
    const comp = (k: string) => perf?.components?.find((c) => c.key === k)?.score;
    return [
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
  }, [perf, t]);

  return (
    <Screen
      root
      title={t("nav.profile")}
      onRefresh={async () => {
        await Promise.all([reload(), reloadPerf()]);
      }}
      right={
        <button
          onClick={() => {
            fb.tap();
            setSheet("lang");
          }}
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
            <button
              type="button"
              onClick={() => { fb.tap(); setSheet("avatar"); }}
              disabled={avatarBusy}
              aria-label={t("profile.changePhoto", "Cambiar foto de perfil")}
              className="pressable relative shrink-0"
            >
              <Avatar name={name} src={avatarSrc} className="h-16 w-16 text-base" />
              {/* On-duty status dot */}
              <span
                className={`absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full border-2 border-surface ${
                  isClockedIn ? "bg-online" : "bg-faint"
                }`}
              />
              {/* Edit affordance */}
              <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-surface bg-gold-strong text-on-accent">
                <Camera size={12} />
              </span>
              {/* Upload-in-progress overlay */}
              {avatarBusy && (
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45">
                  <Loader2 size={20} className="animate-spin text-white" />
                </span>
              )}
            </button>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => { onWebPick(e.target.files?.[0]); e.target.value = ""; }}
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { onWebPick(e.target.files?.[0]); e.target.value = ""; }}
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-ink">{name}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-info">
                <ShieldCheck size={14} />
                {roleLabel}
              </p>
              <button
                onClick={copyId}
                className="mt-1 flex items-center gap-1.5 rounded-xl text-xs text-muted active:text-ink"
              >
                {t("profile.employeeId", "ID de empleado")}: {employeeId}
                <Copy size={12} />
              </button>
            </div>
          </div>

          {avatarErr && <p className="mt-3 text-xs text-critical">{avatarErr}</p>}

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
              icon={theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
              title={t("profile.theme", "Tema")}
              subtitle={t("profile.themeSub", "Apariencia de la app")}
              showChevron={false}
              trailing={
                <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5">
                  {(
                    [
                      ["light", t("profile.themeLight", "Claro"), <Sun size={13} key="l" />],
                      ["dark", t("profile.themeDark", "Oscuro"), <Moon size={13} key="d" />],
                    ] as const
                  ).map(([id, label, icon]) => {
                    const active = theme === id;
                    return (
                      <span
                        key={id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (theme !== id) {
                            fb.select();
                            setTheme(id);
                          }
                        }}
                        role="button"
                        className={`pressable inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          active
                            ? "bg-gold-strong text-on-accent"
                            : "text-muted"
                        }`}
                      >
                        {icon}
                        {label}
                      </span>
                    );
                  })}
                </div>
              }
            />
            <MenuRow
              tone="purple"
              icon={fbOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              title={t("profile.sounds", "Sonidos y vibración")}
              subtitle={t("profile.soundsSub", "Tonos y haptics de la app")}
              showChevron={false}
              trailing={
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    fbOn ? "bg-online/15 text-online" : "bg-surface-2 text-muted"
                  }`}
                >
                  {fbOn ? t("app.on", "Activado") : t("app.off", "Desactivado")}
                </span>
              }
              onClick={() => {
                const next = !fbOn;
                setFbOn(next);
                setSoundsEnabled(next);
                setHapticsEnabled(next);
                if (next) fb.success();
              }}
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
      {sheet === "avatar" && (
        <AvatarSheet
          hasPhoto={!!avatarSrc}
          onPick={chooseAvatar}
          onRemove={removeAvatar}
          onClose={() => setSheet(null)}
        />
      )}
    </Screen>
  );
}

function AvatarSheet({
  hasPhoto,
  onPick,
  onRemove,
  onClose,
}: {
  hasPhoto: boolean;
  onPick: (source: "camera" | "gallery") => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet title={t("profile.changePhoto", "Foto de perfil")} onClose={onClose}>
      <div className="space-y-2">
        <Button variant="primary" full onClick={() => onPick("camera")}>
          <Camera size={18} />
          {t("profile.takeSelfie", "Tomar selfie")}
        </Button>
        <Button variant="outline" full onClick={() => onPick("gallery")}>
          <Images size={18} />
          {t("profile.choosePhoto", "Elegir de galería")}
        </Button>
        {hasPhoto && (
          <Button variant="danger" full onClick={onRemove}>
            <Trash2 size={18} />
            {t("profile.removePhoto", "Quitar foto")}
          </Button>
        )}
      </div>
    </BottomSheet>
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
  // These sheets are conditionally rendered (mounted only while open), so the
  // shared <Sheet> primitive is always open while this component is mounted.
  return (
    <Sheet open onClose={onClose} title={title}>
      {children}
    </Sheet>
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
        className="mb-4 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-ink outline-none focus:border-gold/50"
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
    fb.select();
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
  // Seeded fresh each time the sheet mounts (it is conditionally rendered, so
  // opening it re-reads the log). Lazy initializer avoids calling getErrorLog()
  // on every render of this component.
  const [logs, setLogs] = useState<LogEntry[]>(() => getErrorLog());
  const copy = async () => {
    try {
      const text = logs.map((l) => `${l.t} [${l.ctx}] ${l.msg}`).join("\n");
      await navigator.clipboard.writeText(text || "(empty)");
      fb.success();
    } catch {
      /* ignore */
    }
  };
  const wipe = () => {
    fb.tap();
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
            <div key={i} className="rounded-lg border border-line bg-surface-2 p-2">
              <p className="flex items-center justify-between text-xs text-faint">
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
