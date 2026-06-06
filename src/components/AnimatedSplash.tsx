import { useEffect, useState } from "react";

/**
 * In-app animated splash. The native splash (static logo) hides almost immediately
 * (see main.tsx); this takes over on the same navy background so the handoff is
 * seamless, plays for 3.5s, then fades out and unmounts.
 *
 * Animation: radar rings expand & pulse, the shield scales in with a soft bounce,
 * the check draws itself, the wordmark + tagline rise into place.
 */
const HOLD_MS = 3500;
const FADE_MS = 450;

const SHIELD_D =
  "M1366 800 Q1480 800 1592 832 L1582 1132 Q1582 1232 1470 1312 Q1410 1356 1366 1392 " +
  "Q1322 1356 1262 1312 Q1150 1232 1150 1132 L1140 832 Q1252 800 1366 800 Z";

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
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(120% 90% at 50% 38%, #111A30 0%, #0A0F1D 52%, #04060C 100%)",
        opacity: phase === "out" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
    >
      <style>{css}</style>
      <svg
        className="asLogo"
        width="78%"
        viewBox="600 560 1532 1320"
        style={{ maxWidth: 460 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="asGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#E7B43A" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#C8901A" stopOpacity="0.18" />
            <stop offset="1" stopColor="#C8901A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="asGold" x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="#FDEFB8" />
            <stop offset="0.28" stopColor="#F1CC63" />
            <stop offset="0.62" stopColor="#D4A017" />
            <stop offset="1" stopColor="#A6790B" />
          </linearGradient>
          <linearGradient id="asSheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
            <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="asGoldText" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F6D77A" />
            <stop offset="1" stopColor="#D4A017" />
          </linearGradient>
          <filter id="asShadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="14" stdDeviation="30" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* glow */}
        <circle className="asGlow" cx="1366" cy="1096" r="360" fill="url(#asGlow)" />

        {/* radar rings */}
        {[430, 560, 700, 850].map((r, i) => (
          <circle
            key={r}
            className="asRing"
            style={{ animationDelay: `${i * 0.45}s` }}
            cx="1366"
            cy="1096"
            r={r}
            fill="none"
            stroke="#D4A017"
            strokeWidth={3.2}
          />
        ))}

        {/* shield */}
        <g className="asShield" style={{ transformOrigin: "1366px 1096px" }}>
          <path
            d={SHIELD_D}
            fill="url(#asGold)"
            stroke="#7A5806"
            strokeWidth={2}
            filter="url(#asShadow)"
          />
          <path d={SHIELD_D} fill="url(#asSheen)" />
          {/* check (draws in) */}
          <path
            className="asCheck"
            d="M1268 1078 L1344 1154 L1494 1004"
            fill="none"
            stroke="#0A0E16"
            strokeWidth={56}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.92}
          />
        </g>

        {/* wordmark */}
        <text
          className="asWord"
          x="1366"
          y="1684"
          textAnchor="middle"
          fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
          fontWeight={800}
          fontSize={186}
          letterSpacing={-3}
        >
          <tspan fill="#F3F6FC">CGuard</tspan>
          <tspan fill="url(#asGoldText)">Pro</tspan>
        </text>
        <g className="asTag">
          <rect x="1216" y="1742" width="300" height="3" fill="#D4A017" fillOpacity={0.5} />
          <text
            x="1366"
            y="1818"
            textAnchor="middle"
            fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
            fontWeight={600}
            fontSize={58}
            letterSpacing={16}
            fill="#9AA3B7"
          >
            SEGURIDAD · OPERACIONES
          </text>
        </g>
      </svg>
    </div>
  );
}

const css = `
@keyframes asRingPulse {
  0%   { transform: scale(0.55); opacity: 0; }
  35%  { opacity: 0.5; }
  100% { transform: scale(1.15); opacity: 0; }
}
@keyframes asGlowPulse {
  0%,100% { opacity: 0.55; }
  50%     { opacity: 0.9; }
}
@keyframes asPopIn {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  80%  { transform: scale(0.97); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes asDraw { to { stroke-dashoffset: 0; } }
@keyframes asRise { 0% { transform: translateY(26px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }

.asRing {
  transform-box: fill-box; transform-origin: center;
  animation: asRingPulse 2.4s ease-out infinite;
}
.asGlow { animation: asGlowPulse 2.6s ease-in-out infinite; }
.asShield {
  transform-box: view-box; transform-origin: 1366px 1096px;
  animation: asPopIn 0.85s cubic-bezier(.2,.9,.25,1.2) both;
}
.asCheck {
  stroke-dasharray: 360; stroke-dashoffset: 360;
  animation: asDraw 0.5s ease-out 0.7s forwards;
}
.asWord {
  transform-box: fill-box;
  animation: asRise 0.6s ease-out 0.55s both;
}
.asTag {
  transform-box: fill-box;
  animation: asRise 0.6s ease-out 0.8s both;
}
@media (prefers-reduced-motion: reduce) {
  .asRing, .asGlow, .asShield, .asCheck, .asWord, .asTag { animation: none; }
  .asCheck { stroke-dashoffset: 0; }
}
`;
