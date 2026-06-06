/* Generate branded app assets from the real CGuardPro logo
 * (app-icons/c-guardpro-worker-app-nobackgroun.png — transparent, no background)
 * composited over the navy brand background. Outputs
 * assets/{icon,icon-foreground,splash,splash-dark}.png for @capacitor/assets to
 * slice into every Android/iOS size. Also writes a web-optimized copy to
 * src/assets/brand-logo.png for the in-app splash/login. */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const NAVY = { r: 10, g: 14, b: 22, alpha: 1 }; // #0A0E16
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// The real brand logo (transparent, no background). Drop a replacement here to
// re-skin every icon/splash. We also accept the original drop-name as a fallback.
const CANDIDATES = ["source-logo.png", "c-guardpro-worker-app-nobackgroun.png"];
const SRC = (() => {
  for (const name of CANDIDATES) {
    const p = path.resolve(__dirname, "..", "app-icons", name);
    if (require("fs").existsSync(p)) return p;
  }
  return path.resolve(__dirname, "..", "app-icons", CANDIDATES[0]);
})();
const OUT = path.resolve(__dirname, "..", "assets");
const WEB = path.resolve(__dirname, "..", "src", "assets");
// `pyBuild` regenerates native icons by copying app-icons/{icon,icon-foreground,
// splash,splash-dark}.png → assets/ → capacitor-assets. We write the composites
// to BOTH places so the build pipeline always uses the real logo (otherwise the
// stale placeholder icon.png in app-icons/ wins and every build reverts the icon).
const ICONS = path.resolve(__dirname, "..", "app-icons");

/** Resize the logo (preserving aspect) and center it on a `size`² canvas. */
async function compose(size, logoFrac, bg) {
  const logoPx = Math.round(size * logoFrac);
  const logo = await sharp(SRC)
    .resize(logoPx, logoPx, { fit: "contain", background: TRANSPARENT })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error("Source logo not found:", SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(WEB, { recursive: true });

  // iOS app icon — opaque navy background (iOS forbids transparency), logo large.
  const icon = await compose(1024, 0.84, NAVY);
  // Android adaptive-icon foreground — TRANSPARENT, logo kept inside the safe
  // zone (~60%); @capacitor/assets paints the navy --iconBackgroundColor behind.
  const iconFg = await compose(1024, 0.6, TRANSPARENT);
  // Splash — logo centered on navy (same light & dark).
  const splash = await compose(2732, 0.3, NAVY);

  // Write to assets/ (npm run assets) AND app-icons/ (pyBuild's regenerate_icons).
  for (const dir of [OUT, ICONS]) {
    fs.writeFileSync(path.join(dir, "icon.png"), icon);
    fs.writeFileSync(path.join(dir, "icon-foreground.png"), iconFg);
    fs.writeFileSync(path.join(dir, "splash.png"), splash);
    fs.writeFileSync(path.join(dir, "splash-dark.png"), splash);
  }

  // Web-optimized transparent logo for the in-app animated splash + login.
  await sharp(SRC)
    .resize(512, 512, { fit: "contain", background: TRANSPARENT })
    .png()
    .toFile(path.join(WEB, "brand-logo.png"));

  console.log("✔ assets generated from", path.basename(SRC));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
