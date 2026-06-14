import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Loader2, Users, Volume2 } from "lucide-react";
import { apiOrigin, getToken, getTenantId } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { VoiceChannel, type VoiceMember, type VoiceSpeaker, type VoiceState } from "@/lib/voiceChannel";
import { ensureMicPermission } from "@/lib/micPermission";

/**
 * Open live channel (Canal abierto) — half-duplex PTT. Hold to talk; everyone on
 * the channel hears it live. The floor is server-controlled (one talker at a time).
 */
export default function RadioLiveChannel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const myId = user?.id;

  const vcRef = useRef<VoiceChannel | null>(null);
  const [state, setState] = useState<VoiceState>("connecting");
  const [roster, setRoster] = useState<VoiceMember[]>([]);
  const [speaker, setSpeaker] = useState<VoiceSpeaker>(null);
  const [talking, setTalking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    // `user` populates asynchronously (AuthContext fetches the profile after mount).
    // Wait for a resolved id before connecting so selfId is never captured as
    // undefined — otherwise the guard would hear a chirp for their own
    // transmissions and self labels ('tú' / 'Estás hablando') would mis-identify.
    if (!myId) return;
    const vc = new VoiceChannel();
    vcRef.current = vc;
    vc.connect(
      { url: apiOrigin, path: "/api/socket.io", token: getToken() || "", tenantId: getTenantId(), selfId: myId },
      {
        onState: setState,
        onPresence: setRoster,
        onSpeaker: setSpeaker,
        onError: (m) => setHint(m),
      },
    );
    let alive = true;
    let id: ReturnType<typeof setInterval> | null = null;
    const tryJoin = () => {
      vc.join().then(({ roster, speaker }) => {
        if (alive) { setRoster(roster); setSpeaker(speaker); }
        // Joined — stop the retry poll so it doesn't keep waking every 400ms.
        if (id !== null) { clearInterval(id); id = null; }
      }).catch(() => {});
    };
    // Retry join until connected+joined, then the poll clears itself.
    id = setInterval(() => { if (vc.connected && !vc.joined) tryJoin(); }, 400);
    return () => { alive = false; if (id !== null) clearInterval(id); vc.disconnect(); };
  }, [myId]);

  const someoneElseTalking = !!speaker && speaker.userId !== myId;
  const pressedRef = useRef(false);

  // Acquiring the floor is async (mic permission + getUserMedia). pressedRef tracks
  // whether the finger is still down so an early release can't leave the floor held.
  const beginTalk = async () => {
    if (!(await ensureMicPermission())) {
      pressedRef.current = false;
      setHint(t("radio.micPerm", "Activa el permiso de micrófono en Perfil → Permisos."));
      return;
    }
    if (!pressedRef.current) return; // released during the permission prompt
    const r = await vcRef.current?.startTalk();
    if (!pressedRef.current) { vcRef.current?.stopTalk(); return; } // released mid-acquire
    if (r?.ok) setTalking(true);
    else if (r?.busyWith) setHint(`${r.busyWith} ${t("radio.isTalking", "está hablando")}`);
    else setHint(r?.error || t("radio.micDenied", "No se pudo acceder al micrófono."));
  };

  const onPttDown = (e: React.PointerEvent) => {
    if (state === "connecting" || someoneElseTalking) {
      if (someoneElseTalking) setHint(`${speaker?.name} ${t("radio.isTalking", "está hablando")}`);
      return;
    }
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressedRef.current = true;
    setHint(null);
    void beginTalk();
  };
  const onPttUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressedRef.current = false;
    vcRef.current?.stopTalk();
    setTalking(false);
  };

  const connecting = state === "connecting";

  return (
    <div className="space-y-4" onPointerDown={() => vcRef.current?.resume()}>
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

      {/* Who's talking */}
      <div className={`rounded-xl border p-3 text-center text-sm font-semibold ${speaker ? "border-gold/40 bg-gold/10 text-gold" : "border-line bg-surface-2 text-muted"}`}>
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
          className="no-press relative grid h-40 w-40 place-items-center rounded-full disabled:opacity-50"
          aria-label={t("radio.holdToTalk", "Mantén para hablar")}
        >
          <span className={`absolute inset-0 rounded-full ${talking ? "bg-critical/20 animate-ping" : "bg-gold/15"}`} />
          <span className="absolute inset-4 rounded-full border border-gold/30" />
          <span className={`relative grid h-28 w-28 place-items-center rounded-full text-navy shadow-[0_8px_40px_-8px_rgba(212,160,23,0.7)] ${talking ? "bg-critical text-white scale-105" : "bg-gold"} transition-transform`}>
            <Mic size={44} strokeWidth={2.2} />
          </span>
        </button>
        <p className="mt-4 text-sm font-semibold text-ink">
          {talking ? t("radio.transmitting", "Transmitiendo…") : someoneElseTalking ? t("radio.channelBusy", "Canal ocupado") : t("radio.holdToTalk", "Mantén para hablar")}
        </p>
        {hint && <p className="mt-1 text-center text-[11px] text-muted">{hint}</p>}
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
