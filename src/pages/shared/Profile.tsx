import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Globe, Shield, Check, Bug, Trash2, Copy } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Avatar } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { SUPERVISOR_ROLE } from "@/lib/roles";
import { getErrorLog, clearErrorLog, type LogEntry } from "@/lib/errorLog";

const APP_VERSION = "0.1.0";

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, role, signOut, refreshUser } = useAuth();

  const name = user?.fullName || user?.name || user?.email || "—";
  const langOptions = [
    { id: "auto", label: t("profile.languageAuto") },
    { id: "es", label: t("profile.spanish") },
    { id: "en", label: t("profile.english") },
  ];
  // "appLangChoice" holds only an explicit choice; absent = Auto (follow device).
  const current = localStorage.getItem("appLangChoice") || "auto";

  const changeLang = (id: string) => {
    if (id === "auto") {
      // Drop the explicit choice → follow the device language (now + next launch).
      localStorage.removeItem("appLangChoice");
      const nav = (navigator.language || "es").slice(0, 2);
      i18n.changeLanguage(nav === "en" ? "en" : "es");
    } else {
      // Persist the explicit choice so it survives relaunches.
      localStorage.setItem("appLangChoice", id);
      i18n.changeLanguage(id);
    }
  };

  // --- Diagnostics (on-device error log) ---
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const refreshLogs = () => {
    setLogs(getErrorLog());
    setShowLogs(true);
  };
  const copyLogs = async () => {
    const text = getErrorLog()
      .map((l) => `${l.t} [${l.ctx}] ${l.msg}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text || "(empty)");
    } catch {
      /* clipboard unavailable */
    }
  };
  const wipeLogs = () => {
    clearErrorLog();
    setLogs([]);
  };

  return (
    <Screen title={t("profile.title")} onRefresh={refreshUser}>
      <div className="space-y-4">
        {/* Identity */}
        <Card className="flex items-center gap-3 p-4">
          <Avatar name={name} className="h-12 w-12 text-base" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{name}</p>
            <p className="flex items-center gap-1.5 text-xs text-gold">
              <Shield size={13} />
              {t(`roles.${role === SUPERVISOR_ROLE ? "securitySupervisor" : "securityGuard"}`)}
            </p>
            {user?.email && (
              <p className="truncate text-xs text-muted">{user.email}</p>
            )}
          </div>
        </Card>

        {/* Language */}
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Globe size={16} className="text-gold" />
            {t("profile.language")}
          </h3>
          <div className="space-y-1">
            {langOptions.map((o) => (
              <button
                key={o.id}
                onClick={() => changeLang(o.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-sm text-ink active:bg-surface-2"
              >
                {o.label}
                {current === o.id && <Check size={16} className="text-gold" />}
              </button>
            ))}
          </div>
        </Card>

        {/* Diagnostics — on-device error log */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Bug size={16} className="text-gold" />
              {t("profile.diagnostics", "Diagnóstico")}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={copyLogs}
                className="rounded-lg border border-line p-2 text-muted active:bg-surface-2"
                aria-label="copy"
              >
                <Copy size={15} />
              </button>
              <button
                onClick={wipeLogs}
                className="rounded-lg border border-line p-2 text-muted active:bg-surface-2"
                aria-label="clear"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          <button
            onClick={refreshLogs}
            className="w-full rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink active:bg-surface-2"
          >
            {t("profile.showLogs", "Ver errores")} ({getErrorLog().length})
          </button>
          {showLogs && (
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-center text-xs text-faint">
                  {t("profile.noLogs", "Sin errores registrados")}
                </p>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-line bg-surface p-2"
                  >
                    <p className="flex items-center justify-between text-[10px] text-faint">
                      <span className="font-semibold text-gold">{l.ctx}</span>
                      <span>{l.t.slice(11, 19)}</span>
                    </p>
                    <p className="mt-0.5 break-words text-[11px] text-ink">
                      {l.msg}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>

        {/* Account */}
        <Card className="p-2">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-critical active:bg-surface-2"
          >
            <LogOut size={18} />
            {t("auth.signOut")}
          </button>
        </Card>

        <p className="text-center text-[11px] text-faint">
          {t("profile.version")} {APP_VERSION}
        </p>
      </div>
    </Screen>
  );
}
