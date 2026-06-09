import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Camera, Bell, Check, X, Loader2, RefreshCw } from "lucide-react";
import { Screen } from "@/components/Screen";
import { registerPush } from "@/lib/push";

type Status = "granted" | "denied" | "prompt" | "unsupported" | "unknown";
type Kind = "location" | "camera" | "notifications";

/** Check one permission via its Capacitor plugin; never throws. */
async function checkOne(kind: Kind): Promise<Status> {
  try {
    if (kind === "location") {
      const { Geolocation } = await import("@capacitor/geolocation");
      const p = await Geolocation.checkPermissions();
      return (p.location as Status) || "unknown";
    }
    if (kind === "camera") {
      const { Camera: Cam } = await import("@capacitor/camera");
      const p = await Cam.checkPermissions();
      return (p.camera as Status) || "unknown";
    }
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const p = await FirebaseMessaging.checkPermissions();
    return (p.receive as Status) || "unknown";
  } catch {
    return "unsupported";
  }
}

/** Request one permission (prompts when state is 'prompt'); returns new status. */
async function requestOne(kind: Kind): Promise<Status> {
  try {
    if (kind === "location") {
      const { Geolocation } = await import("@capacitor/geolocation");
      const r = await Geolocation.requestPermissions();
      return (r.location as Status) || "unknown";
    }
    if (kind === "camera") {
      const { Camera: Cam } = await import("@capacitor/camera");
      const r = await Cam.requestPermissions({ permissions: ["camera"] });
      return (r.camera as Status) || "unknown";
    }
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const r = await FirebaseMessaging.requestPermissions();
    const s = (r.receive as Status) || "unknown";
    if (s === "granted") {
      // Register the device token so CRM → guard push is deliverable.
      await registerPush().catch(() => {});
    }
    return s;
  } catch {
    return "unsupported";
  }
}

export default function GuardPermissions() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Record<Kind, Status>>({ location: "unknown", camera: "unknown", notifications: "unknown" });
  const [busy, setBusy] = useState<Kind | "all" | null>(null);

  const checkAll = useCallback(async () => {
    setBusy("all");
    const [location, camera, notifications] = await Promise.all([checkOne("location"), checkOne("camera"), checkOne("notifications")]);
    setStatus({ location, camera, notifications });
    setBusy(null);
  }, []);

  useEffect(() => { checkAll(); }, [checkAll]);

  const request = async (kind: Kind) => {
    setBusy(kind);
    const s = await requestOne(kind);
    setStatus((prev) => ({ ...prev, [kind]: s }));
    setBusy(null);
  };

  const items: { kind: Kind; icon: any; title: string; why: string }[] = [
    { kind: "location", icon: <MapPin size={20} />, title: t("perm.location", "Ubicación (GPS)"), why: t("perm.locationWhy", "Necesaria para marcar entrada/salida en tu puesto.") },
    { kind: "camera", icon: <Camera size={20} />, title: t("perm.camera", "Cámara"), why: t("perm.cameraWhy", "Necesaria para la selfie de marcación y reportes.") },
    { kind: "notifications", icon: <Bell size={20} />, title: t("perm.notifications", "Notificaciones"), why: t("perm.notificationsWhy", "Necesaria para recibir mensajes y avisos de la empresa.") },
  ];

  const pill = (s: Status) => {
    const map: Record<Status, { label: string; cls: string; icon: any }> = {
      granted: { label: t("perm.granted", "Permitido"), cls: "bg-online/15 text-online", icon: <Check size={13} /> },
      denied: { label: t("perm.denied", "Bloqueado"), cls: "bg-critical/15 text-critical", icon: <X size={13} /> },
      prompt: { label: t("perm.prompt", "Pendiente"), cls: "bg-gold/15 text-gold", icon: null },
      unsupported: { label: t("perm.web", "No aplica"), cls: "bg-surface-2 text-faint", icon: null },
      unknown: { label: "…", cls: "bg-surface-2 text-faint", icon: null },
    };
    const m = map[s];
    return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${m.cls}`}>{m.icon}{m.label}</span>;
  };

  return (
    <Screen
      back
      title={t("perm.title", "Permisos")}
      subtitle={t("perm.subtitle", "Activa los permisos del dispositivo")}
      right={
        <button onClick={checkAll} disabled={busy === "all"} aria-label="Actualizar" className="rounded-full p-2 text-muted active:bg-white/10">
          {busy === "all" ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
      }
    >
      <p className="mb-3 text-xs text-muted">
        {t("perm.intro", "Si no marcas entrada o no llegan los mensajes, revisa que estos permisos estén activados.")}
      </p>
      <div className="space-y-3">
        {items.map((it) => {
          const s = status[it.kind];
          const needsAction = s === "prompt" || s === "unknown";
          const blocked = s === "denied";
          return (
            <div key={it.kind} className="card-elev p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">{it.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-ink">{it.title}</p>
                    {pill(s)}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{it.why}</p>
                </div>
              </div>
              {(needsAction || blocked) && (
                <div className="mt-3">
                  {blocked ? (
                    <p className="rounded-lg bg-critical/5 px-3 py-2 text-[11px] text-critical">
                      {t("perm.blockedHelp", "Está bloqueado. Ábrelo en Ajustes del teléfono → esta app → Permisos, y actívalo.")}
                    </p>
                  ) : (
                    <button
                      onClick={() => request(it.kind)}
                      disabled={busy === it.kind}
                      className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50"
                    >
                      {busy === it.kind ? <Loader2 size={18} className="animate-spin" /> : t("perm.allow", "Permitir")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Screen>
  );
}
