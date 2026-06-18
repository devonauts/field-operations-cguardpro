import { Mic, Loader2, Volume2 } from "lucide-react";
import { useRadio } from "@/context/RadioContext";

/**
 * App-wide floating push-to-talk button for the live radio (Canal abierto).
 * Visible ONLY while on duty; lets the guard hold-to-talk and keep listening from
 * any screen without opening the radio page. Off duty it renders nothing (the
 * provider is disconnected, so there's no audio either).
 */
export default function FloatingRadioButton() {
  const { onDuty, screenActive, state, speaker, talking, hint, myId, someoneElseTalking, resume, pressTalk, releaseTalk } = useRadio();

  // Only one button: hide the floating one while the full radio screen is open.
  if (!onDuty || screenActive) return null;

  const connecting = state === "connecting";

  const down = (e: React.PointerEvent) => {
    resume();
    if (connecting || someoneElseTalking) return;
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressTalk();
  };
  const up = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    releaseTalk();
  };

  // Status bubble text above the button.
  const status =
    talking ? "Transmitiendo…"
    : speaker ? `${speaker.userId === myId ? "Hablando" : `${speaker.name} hablando`}…`
    : connecting ? "Conectando…"
    : hint || null;

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {status && (
        <div className={`max-w-[60vw] truncate rounded-full px-3 py-1 text-[11px] font-semibold shadow-lg ${
          talking ? "bg-critical text-white" : speaker ? "bg-gold/90 text-on-accent" : "bg-surface-2 text-muted"
        }`}>
          {status}
        </div>
      )}

      <button
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        disabled={connecting || someoneElseTalking}
        style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as any}
        className="no-press relative grid h-16 w-16 place-items-center rounded-full disabled:opacity-60"
        aria-label="Mantén para hablar en el canal"
      >
        <span className={`absolute inset-0 rounded-full ${talking ? "bg-critical/25 animate-ping" : someoneElseTalking ? "bg-gold/25 animate-pulse" : "bg-gold/15"}`} />
        <span
          className={`relative grid h-14 w-14 place-items-center rounded-full text-on-accent shadow-[0_8px_30px_-6px_rgba(212,160,23,0.7)] transition-transform ${
            talking ? "scale-110 bg-critical text-white" : "bg-gold"
          }`}
        >
          {connecting ? <Loader2 size={24} className="animate-spin" /> : someoneElseTalking ? <Volume2 size={24} /> : <Mic size={24} strokeWidth={2.2} />}
        </span>
      </button>
    </div>
  );
}
