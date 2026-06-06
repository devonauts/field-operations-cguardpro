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

const SRC = path.resolve(__dirname, "..", "app-icons", "c-guardpro-worker-app-nobackgroun.png");
const OUT = path.resolve(__dirname, "..", "assets");
const WEB = path.resolve(__dirname, "..", "src", "assets");

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
  fs.writeFileSync(path.join(OUT, "icon.png"), await compose(1024, 0.84, NAVY));

  // Android adaptive-icon foreground — TRANSPARENT, logo kept inside the safe
  // zone (~60%); @capacitor/assets paints the navy --iconBackgroundColor behind.
  fs.writeFileSync(path.join(OUT, "icon-foreground.png"), await compose(1024, 0.6, TRANSPARENT));

  // Splash — logo centered on navy (same light & dark).
  const splash = await compose(2732, 0.3, NAVY);
  fs.writeFileSync(path.join(OUT, "splash.png"), splash);
  fs.writeFileSync(path.join(OUT, "splash-dark.png"), splash);

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
