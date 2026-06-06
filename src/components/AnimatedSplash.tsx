import { useEffect, useState } from "react";
import logo from "../assets/brand-logo.png";

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
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("out"), HOLD_MS);
    const t2 = setTimeout(() => setPhase("gone"), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
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
          "radial-gradient(120% 90% at 50% 38%, #111A30 0%, #0A0F1D 52%, #04060C 100%)",
        opacity: phase === "out" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
    >
      <style>{css}</style>

      <div className="asStage">
        <span className="asGlow" />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="asRing" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
        <img src={logo} alt="" className="asLogo" draggable={false} />
      </div>

      <div className="asWord">
        CGuard<span>Pro</span>
      </div>
      <div className="asTag">SEGURIDAD · OPERACIONES</div>
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
  background: radial-gradient(circle, rgba(231,180,58,0.45) 0%, rgba(200,144,26,0.15) 45%, rgba(200,144,26,0) 72%);
  filter: blur(6px);
  animation: asGlowPulse 2.6s ease-in-out infinite;
}
.asRing {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2.5px solid rgba(212,160,23,0.9);
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
  color: #F3F6FC;
  animation: asRise 0.6s ease-out 0.55s both;
}
.asWord span { color: #D4A017; }
.asTag {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 4px;
  color: #9AA3B7;
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
