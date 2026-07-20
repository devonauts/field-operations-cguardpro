import { useEffect, useState } from "react";
import logo from "../assets/brand-logo.png";
import { getBranding } from "../lib/appBranding";

/**
 * In-app animated splash. The native splash (static logo on navy) hides almost
 * immediately (see main.tsx); this takes over on the same navy background so the
 * handoff is seamless, plays for 3.5s, then fades out and unmounts.
 *
 * Animation: radar rings expand & pulse and a soft gold glow breathes behind the
 * real CGuardPro logo, which pops in; the wordmark + tagline rise into place.
 */
const HOLD_MS = 3500;
const FADE_MS = 450;

export default function AnimatedSplash() {
  // Splash is shown pre-auth: use the cached tenant branding applied at boot
  // (a static read is fine — the splash unmounts before any refetch lands).
  const branding = getBranding();
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("out"), HOLD_MS);
    const t2 = setTimeout(() => setPhase("gone"), HOLD_MS + FADE_MS);
    // Launched with the screen OFF (push/Doze), WebView timers can freeze and
    // this overlay stayed up forever, looking like a dead app. When the app
    // becomes visible, fast-forward the dismissal unconditionally.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setTimeout(() => setPhase("out"), 800);
        setTimeout(() => setPhase("gone"), 800 + FADE_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        background:
          "radial-gradient(120% 90% at 50% 38%, color-mix(in srgb, var(--background) 88%, var(--ink) 4%) 0%, var(--background) 52%, color-mix(in srgb, var(--background) 92%, #000 8%) 100%)",
        opacity: phase === "out" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        // ALWAYS none: this overlay is pure decoration (aria-hidden). If it
        // ever gets stuck (frozen timers on a screen-off launch), taps must
        // still reach the app underneath instead of a dead logo.
        pointerEvents: "none",
      }}
    >
      <style>{css}</style>

      <div className="asStage">
        <span className="asGlow" />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="asRing" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
        <img
          src={branding.useTenantLogo && branding.logoUrl ? branding.logoUrl : logo}
          alt=""
          className="asLogo"
          draggable={false}
        />
      </div>

      {branding.displayName ? (
        <div className="asWord">{branding.displayName}</div>
      ) : (
        <div className="asWord">
          CGuard<span>Pro</span>
        </div>
      )}
      <div className="asTag">{branding.tagline ? branding.tagline.toUpperCase() : "SEGURIDAD · OPERACIONES"}</div>
    </div>
  );
}

const css = `
.asStage {
  position: relative;
  width: 220px;
  height: 220px;
  display: grid;
  place-items: center;
}
.asGlow {
  position: absolute;
  inset: -10%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--gold) 45%, transparent) 0%, color-mix(in srgb, var(--gold-strong) 15%, transparent) 45%, transparent 72%);
  filter: blur(6px);
  animation: asGlowPulse 2.6s ease-in-out infinite;
}
.asRing {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2.5px solid color-mix(in srgb, var(--gold) 90%, transparent);
  animation: asRingPulse 2.4s ease-out infinite;
}
.asLogo {
  position: relative;
  width: 150px;
  height: 150px;
  object-fit: contain;
  filter: drop-shadow(0 14px 26px rgba(0,0,0,0.55));
  animation: asPopIn 0.85s cubic-bezier(.2,.9,.25,1.2) both;
}
.asWord {
  margin-top: 18px;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-weight: 800;
  font-size: 30px;
  letter-spacing: -0.5px;
  color: var(--ink);
  animation: asRise 0.6s ease-out 0.55s both;
}
.asWord span { color: var(--gold); }
.asTag {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 4px;
  color: var(--muted);
  animation: asRise 0.6s ease-out 0.8s both;
}

@keyframes asRingPulse {
  0%   { transform: scale(0.55); opacity: 0; }
  35%  { opacity: 0.5; }
  100% { transform: scale(1.18); opacity: 0; }
}
@keyframes asGlowPulse {
  0%,100% { opacity: 0.6; transform: scale(1); }
  50%     { opacity: 0.95; transform: scale(1.06); }
}
@keyframes asPopIn {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  80%  { transform: scale(0.97); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes asRise {
  0%   { transform: translateY(22px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .asRing, .asGlow, .asLogo, .asWord, .asTag { animation: none; }
}
`;
