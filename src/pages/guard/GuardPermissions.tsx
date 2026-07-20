import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Camera, Bell, Mic, Check, X, Loader2, RefreshCw } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/ui/kit";
import { registerPush } from "@/lib/push";
import { fb } from "@/lib/feedback";

type Status = "granted" | "denied" | "prompt" | "unsupported" | "unknown";
type Kind = "location" | "camera" | "microphone" | "notifications";

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
    if (kind === "microphone") {
      // Native: capacitor-voice-recorder requests the real OS RECORD_AUDIO
      // runtime permission (Capacitor's WebView won't do that for getUserMedia).
      // Web/dev: fall back to the Permissions API.
      try {
        const { VoiceRecorder } = await import("capacitor-voice-recorder");
        const r = await VoiceRecorder.hasAudioRecordingPermission();
        return r.value ? "granted" : "prompt";
      } catch {
        const anyNav = navigator as any;
        if (!anyNav.mediaDevices?.getUserMedia) return "unsupported";
        try {
          if (anyNav.permissions?.query) {
            const st = await anyNav.permissions.query({ name: "microphone" });
            return (st.state as Status) || "prompt";
          }
        } catch { /* not queryable on this platform */ }
        return "prompt";
      }
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
    if (kind === "microphone") {
      // Native: ask the OS for RECORD_AUDIO via the plugin. Web/dev: getUserMedia.
      try {
        const { VoiceRecorder } = await import("capacitor-voice-recorder");
        const r = await VoiceRecorder.requestAudioRecordingPermission();
        return r.value ? "granted" : "denied";
      } catch {
        const anyNav = navigator as any;
        if (!anyNav.mediaDevices?.getUserMedia) return "unsupported";
        try {
          const stream = await anyNav.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((tr: MediaStreamTrack) => tr.stop());
          return "granted";
        } catch (e: any) {
          if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) return "denied";
          return "prompt";
        }
      }
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
  const [status, setStatus] = useState<Record<Kind, Status>>({ location: "unknown", camera: "unknown", microphone: "unknown", notifications: "unknown" });
  const [busy, setBusy] = useState<Kind | "all" | null>(null);

  const checkAll = useCallback(async () => {
    setBusy("all");
    const [location, camera, microphone, notifications] = await Promise.all([checkOne("location"), checkOne("camera"), checkOne("microphone"), checkOne("notifications")]);
    setStatus({ location, camera, microphone, notifications });
    setBusy(null);
  }, []);

  useEffect(() => { checkAll(); }, [checkAll]);

  const request = async (kind: Kind) => {
    setBusy(kind);
    const s = await requestOne(kind);
    setStatus((prev) => ({ ...prev, [kind]: s }));
    if (s === "granted") fb.success();
    else if (s === "denied") fb.warning();
    setBusy(null);
  };

  const items: { kind: Kind; icon: any; title: string; why: string }[] = [
    { kind: "location", icon: <MapPin size={20} />, title: t("perm.location", "Ubicación (GPS)"), why: t("perm.locationWhy", "CGuardPro recopila tu ubicación mientras estás en turno para el seguimiento en vivo, tu recorrido de ronda y marcar entrada/salida, incluso con la app cerrada o la pantalla bloqueada. Se detiene al marcar salida. Elige “Permitir todo el tiempo”.") },
    { kind: "camera", icon: <Camera size={20} />, title: t("perm.camera", "Cámara"), why: t("perm.cameraWhy", "Necesaria para la selfie de marcación y reportes.") },
    { kind: "microphone", icon: <Mic size={20} />, title: t("perm.microphone", "Micrófono"), why: t("perm.microphoneWhy", "Necesario para los reportes de voz y el canal de radio en vivo.") },
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
        <button onClick={() => { fb.tap(); checkAll(); }} disabled={busy === "all"} aria-label={t("app.refresh", "Actualizar")} className="rounded-full p-2 text-muted active:bg-surface-2">
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
                    <Button
                      variant="primary"
                      full
                      onClick={() => request(it.kind)}
                      disabled={busy === it.kind}
                    >
                      {busy === it.kind ? <Loader2 size={18} className="animate-spin" /> : t("perm.allow", "Permitir")}
                    </Button>
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
