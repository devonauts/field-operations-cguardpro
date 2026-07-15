import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Loader2, Volume2 } from "lucide-react";
import { useRadio } from "@/context/RadioContext";

const POS_KEY = "radioMicFabPos";
const SIZE = 96; // touch-target diameter in px (must match the h-24/w-24 button)

/** Resolved safe-area-inset-bottom in px (home indicator height). A CSS custom
 *  property stores the unresolved env() token, so measure it with a probe. */
function safeAreaBottom(): number {
  try {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom);width:0;visibility:hidden;pointer-events:none;";
    document.body.appendChild(el);
    const h = el.getBoundingClientRect().height;
    document.body.removeChild(el);
    return Number.isFinite(h) ? h : 0;
  } catch { return 0; }
}

/**
 * App-wide floating push-to-talk button for the live radio (Canal abierto).
 * Visible ONLY while on duty (and hidden while the full radio screen is open).
 * Press = transmit immediately; drag (move > threshold) repositions it instead of
 * talking, and the position persists. Lets the guard talk + keep listening from
 * any screen without opening the radio page.
 */
export default function FloatingRadioButton() {
  const { t } = useTranslation();
  const { onDuty, screenActive, state, speaker, talking, hint, myId, someoneElseTalking, resume, pressTalk, releaseTalk } = useRadio();

  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean; talked: boolean } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (s && typeof s.x === "number" && typeof s.y === "number") {
        // Clamp a previously-saved position back into the viewport so a stale
        // off-screen value (rotation / smaller screen) can't strand the button.
        const x = Math.max(8, Math.min(window.innerWidth - SIZE - 8, s.x));
        const y = Math.max(8, Math.min(window.innerHeight - SIZE - 8 - safeAreaBottom(), s.y));
        return { x, y };
      }
      return null;
    } catch {
      return null;
    }
  });

  if (!onDuty || screenActive) return null;

  const connecting = state === "connecting";
  const canTalk = !connecting && !someoneElseTalking;

  const onDown = (e: React.PointerEvent) => {
    resume();
    const el = ref.current;
    if (!el) return;
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    const r = el.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false, talked: false };
    // Immediate trigger: start transmitting on press (unless busy/connecting).
    if (canTalk) { drag.current.talked = true; pressTalk(); }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && (Math.abs(e.clientX - d.sx) > 8 || Math.abs(e.clientY - d.sy) > 8)) {
      d.moved = true;
      // It's a drag, not a talk — cancel any transmission we started on press.
      if (d.talked) { releaseTalk(); d.talked = false; }
    }
    if (!d.moved) return;
    const w = ref.current?.offsetWidth ?? SIZE;
    const h = ref.current?.offsetHeight ?? SIZE;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - d.ox));
    const y = Math.max(8, Math.min(window.innerHeight - h - 8 - safeAreaBottom(), e.clientY - d.oy));
    setPos({ x, y });
  };

  const onUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      setPos((p) => { try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ } return p; });
    } else if (d.talked) {
      releaseTalk(); // hold released → end transmission
    }
  };

  const status =
    talking ? t("radio.transmitting", "Transmitiendo…")
    : speaker ? `${speaker.userId === myId ? t("radio.talking", "Hablando") : `${speaker.name} ${t("radio.isTalking", "está hablando")}`}…`
    : connecting ? t("radio.connecting", "Conectando…")
    : hint || null;

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 16, bottom: 96 };

  return (
    <div
      ref={ref}
      className="fixed z-50"
      style={{ ...style, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* The button is the only in-flow element so its position never depends on
          the status label. The label floats ABOVE the button (absolute, out of
          flow) — showing/hiding it can't shift the button or push it off-screen. */}
      <div className="relative">
      {status && (
        <div className={`pointer-events-none absolute bottom-full right-0 mb-2 max-w-[60vw] truncate rounded-full px-3 py-1 text-[11px] font-semibold shadow-lg ${
          talking ? "bg-critical text-white" : speaker ? "bg-gold/90 text-on-accent" : "bg-surface-2 text-muted"
        }`}>
          {status}
        </div>
      )}

      <button
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as any}
        className={`no-press relative grid h-24 w-24 place-items-center rounded-full ${canTalk ? "" : "opacity-70"}`}
        aria-label={t("radio.holdToTalkChannel", "Mantén para hablar en el canal")}
      >
        <span className={`absolute inset-0 rounded-full ${talking ? "bg-critical/25 animate-ping" : someoneElseTalking ? "bg-gold/25 animate-pulse" : "bg-gold/15"}`} />
        <span
          className={`relative grid h-[88px] w-[88px] place-items-center rounded-full text-on-accent shadow-[0_8px_30px_-6px_rgba(212,160,23,0.7)] transition-transform ${
            talking ? "scale-110 bg-critical text-white" : "bg-gold"
          }`}
        >
          {connecting ? <Loader2 size={38} className="animate-spin" /> : someoneElseTalking ? <Volume2 size={38} /> : <Mic size={38} strokeWidth={2.2} />}
        </span>
      </button>
      </div>
    </div>
  );
}
