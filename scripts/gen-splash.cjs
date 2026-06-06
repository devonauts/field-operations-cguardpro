/**
 * Generates a designed splash + matching icon for CGuardPro and writes them into
 * app-icons/ (which the build pipeline then fans out to every native size).
 *
 *   node scripts/gen-splash.cjs
 *
 * Design: deep navy gradient, concentric "radar" rings, a soft gold glow, a metallic
 * gold shield crest with a check, and the CGuardPro wordmark + tagline. Pure vector,
 * rendered to PNG via sharp.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT = path.join(__dirname, "..", "app-icons");
fs.mkdirSync(OUT, { recursive: true });

// ---- emblem geometry (offsets relative to a center, scaled by k) ----
const SHIELD = [
  ["M", [0, -296]],
  ["Q", [114, -296, 226, -264]],
  ["L", [216, 36]],
  ["Q", [216, 136, 104, 216]],
  ["Q", [44, 260, 0, 296]],
  ["Q", [-44, 260, -104, 216]],
  ["Q", [-216, 136, -216, 36]],
  ["L", [-226, -264]],
  ["Q", [-114, -296, 0, -296]],
  ["Z", []],
];
const CHECK = [[-98, -12], [-22, 64], [128, -96]];

const map = (pts, cx, cy, k) =>
  pts
    .map(([cmd, n]) => {
      const c = [];
      for (let i = 0; i < n.length; i += 2)
        c.push((cx + n[i] * k).toFixed(1), (cy + n[i + 1] * k).toFixed(1));
      return cmd + c.join(" ");
    })
    .join(" ");

const checkPath = (cx, cy, k) =>
  "M" +
  CHECK.map(([x, y]) => `${(cx + x * k).toFixed(1)},${(cy + y * k).toFixed(1)}`).join(" L");

// ---- emblem (shield + glow + rings + check), centered at (cx,cy) ----
function emblem(cx, cy, k, { rings = true } = {}) {
  const ringEls = rings
    ? [430, 560, 700, 850]
        .map(
          (r, i) =>
            `<circle cx="${cx}" cy="${cy}" r="${r * k}" fill="none" stroke="#D4A017" stroke-opacity="${(
              0.16 -
              i * 0.034
            ).toFixed(3)}" stroke-width="${(3.2).toFixed(1)}"/>`
        )
        .join("")
    : "";
  return `
    <circle cx="${cx}" cy="${cy}" r="${360 * k}" fill="url(#glow)"/>
    ${ringEls}
    <g filter="url(#emblemShadow)">
      <path d="${map(SHIELD, cx, cy, k)}" fill="url(#gold)" stroke="#7A5806" stroke-width="${(
    2 * k
  ).toFixed(1)}"/>
    </g>
    <path d="${map(SHIELD, cx, cy, k)}" fill="url(#sheen)"/>
    <path d="${checkPath(cx, cy - 18 * k, k)}" fill="none" stroke="#0A0E16" stroke-width="${(
    56 * k
  ).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.92"/>`;
}

const DEFS = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#111A30"/>
      <stop offset="0.5" stop-color="#0A0F1D"/>
      <stop offset="1" stop-color="#04060C"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#E7B43A" stop-opacity="0.55"/>
      <stop offset="0.45" stop-color="#C8901A" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#C8901A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#FDEFB8"/>
      <stop offset="0.28" stop-color="#F1CC63"/>
      <stop offset="0.62" stop-color="#D4A017"/>
      <stop offset="1" stop-color="#A6790B"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/>
      <stop offset="0.4" stop-color="#FFFFFF" stop-opacity="0.05"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F6D77A"/>
      <stop offset="1" stop-color="#D4A017"/>
    </linearGradient>
    <filter id="emblemShadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="14" stdDeviation="34" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>`;

// ---- SPLASH (2732, content centered, within CENTER_CROP safe zone) ----
function splashSVG() {
  const S = 2732;
  const cx = S / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${DEFS}
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    ${emblem(cx, 1118, 1.0)}
    <text x="${cx}" y="1684" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="186" letter-spacing="-3">
      <tspan fill="#F3F6FC">CGuard</tspan><tspan fill="url(#goldText)">Pro</tspan>
    </text>
    <g>
      <rect x="${cx - 150}" y="1742" width="300" height="3" fill="#D4A017" fill-opacity="0.5"/>
      <text x="${cx}" y="1818" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="600" font-size="58" letter-spacing="16" fill="#9AA3B7">SEGURIDAD · OPERACIONES</text>
    </g>
  </svg>`;
}

// ---- ICON (1024 full bleed) + adaptive foreground (padded, transparent) ----
function iconSVG() {
  const S = 1024;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${DEFS}
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    ${emblem(S / 2, S / 2 + 6, 1.18, { rings: true })}
  </svg>`;
}
function foregroundSVG() {
  const S = 1024;
  // smaller so it sits inside the adaptive-icon safe zone
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${DEFS}
    ${emblem(S / 2, S / 2 + 4, 0.86, { rings: false })}
  </svg>`;
}

async function render(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT, file));
  console.log("✓", file);
}

(async () => {
  await render(splashSVG(), "splash.png", 2732);
  await render(splashSVG(), "splash-dark.png", 2732);
  await render(iconSVG(), "icon.png", 1024);
  await render(foregroundSVG(), "icon-foreground.png", 1024);
  console.log("Done → app-icons/");
})();
