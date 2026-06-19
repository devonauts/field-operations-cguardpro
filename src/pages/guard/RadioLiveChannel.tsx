import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useIonViewWillEnter, useIonViewWillLeave } from "@ionic/react";
import { Mic, Loader2, Users, Volume2 } from "lucide-react";
import { useRadio } from "@/context/RadioContext";

/**
 * Open live channel (Canal abierto) screen — half-duplex PTT. The connection +
 * floor state live in the app-level RadioProvider (so the channel keeps working
 * from the floating button across screens, and only while on duty); this screen
 * is a full-size view over that shared state.
 */
export default function RadioLiveChannel() {
  const { t } = useTranslation();
  const { state, roster, speaker, talking, hint, myId, someoneElseTalking, onDuty, setScreenActive, resume, pressTalk, releaseTalk } = useRadio();

  // Hide the app-wide floating button while this full screen is open (one button).
  // Use Ionic's view lifecycle, NOT mount/unmount: Ionic CACHES tab pages, so
  // an unmount-based cleanup wouldn't fire when navigating away — which would
  // leave screenActive=true and the floating button hidden everywhere.
  useIonViewWillEnter(() => setScreenActive(true));
  useIonViewWillLeave(() => setScreenActive(false));
  useEffect(() => {
    setScreenActive(true);
    return () => setScreenActive(false);
  }, [setScreenActive]);

  const connecting = state === "connecting";

  const onPttDown = (e: React.PointerEvent) => {
    resume();
    if (connecting || someoneElseTalking) return;
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressTalk();
  };
  const onPttUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    releaseTalk();
  };

  if (!onDuty) {
    return (
      <div className="card-elev flex flex-col items-center gap-2 p-6 text-center">
        <Volume2 size={26} className="text-muted" />
        <p className="text-sm font-semibold text-ink">{t("radio.offDutyTitle", "Radio disponible en servicio")}</p>
        <p className="text-[12px] text-muted">{t("radio.offDutyHint", "Marca tu entrada para conectarte al canal.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" onPointerDown={resume}>
      {/* Status */}
      <div className="card-elev flex items-center gap-3 p-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${state === "connected" ? "bg-online/15 text-online" : "bg-surface-2 text-muted"}`}>
          {connecting ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-eyebrow">{t("radio.liveChannel", "Canal abierto")}</p>
          <p className="truncate text-[15px] font-semibold text-ink">
            {connecting ? t("radio.connecting", "Conectando…") : state === "connected" ? t("radio.live", "En vivo") : t("radio.offline", "Sin conexión")}
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted">
          <Users size={12} /> {roster.length}
        </span>
      </div>

      {/* Who's talking — fixed height so its text never reflows the layout */}
      <div className={`flex min-h-11 items-center justify-center rounded-xl border p-3 text-center text-sm font-semibold ${speaker ? "border-gold/40 bg-gold/10 text-gold" : "border-line bg-surface-2 text-muted"}`}>
        {speaker
          ? `${speaker.userId === myId ? t("radio.youTalking", "Estás hablando") : `${speaker.name} ${t("radio.isTalking", "está hablando")}`}…`
          : t("radio.channelClear", "Canal libre")}
      </div>

      {/* PTT */}
      <div className="flex flex-col items-center py-3">
        <button
          onPointerDown={onPttDown}
          onPointerUp={onPttUp}
          onPointerCancel={onPttUp}
          onContextMenu={(e) => e.preventDefault()}
          disabled={connecting || someoneElseTalking}
          style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as any}
          className="no-press relative grid h-48 w-48 place-items-center rounded-full disabled:opacity-50"
          aria-label={t("radio.holdToTalk", "Mantén para hablar")}
        >
          <span className={`absolute inset-0 rounded-full ${talking ? "bg-critical/20 animate-ping" : "bg-gold/15"}`} />
          <span className="absolute inset-4 rounded-full border border-gold/30" />
          <span className={`relative grid h-36 w-36 place-items-center rounded-full text-on-accent shadow-[0_8px_40px_-8px_rgba(212,160,23,0.7)] ${talking ? "bg-critical text-white scale-105" : "bg-gold"} transition-transform`}>
            <Mic size={52} strokeWidth={2.2} />
          </span>
        </button>
        {/* Status + hint live in a fixed-height block so pressing the mic (which
            flips the label and can surface a hint) never reflows / shifts the
            button under the user's finger. */}
        <div className="mt-4 flex h-11 flex-col items-center justify-start">
          <p className="text-sm font-semibold text-ink">
            {talking ? t("radio.transmitting", "Transmitiendo…") : someoneElseTalking ? t("radio.channelBusy", "Canal ocupado") : t("radio.holdToTalk", "Mantén para hablar")}
          </p>
          {hint && <p className="mt-1 line-clamp-2 text-center text-[11px] text-muted">{hint}</p>}
        </div>
      </div>

      {/* Roster */}
      {roster.length > 0 && (
        <div className="card-elev overflow-hidden">
          <p className="label-eyebrow px-4 pt-3">{t("radio.onChannel", "En el canal")}</p>
          <div className="divide-y divide-line">
            {roster.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`h-2 w-2 rounded-full ${speaker?.userId === m.userId ? "bg-gold animate-pulse" : "bg-online"}`} />
                <span className="flex-1 truncate text-sm text-ink">{m.name}{m.userId === myId ? ` (${t("radio.you", "tú")})` : ""}</span>
                {speaker?.userId === m.userId && <Mic size={14} className="text-gold" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
